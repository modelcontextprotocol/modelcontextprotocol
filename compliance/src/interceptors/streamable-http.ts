import express from 'express';
import { Server } from 'node:http';
import type { AnnotatedJSONRPCMessage } from '../types.js';
import type { JSONRPCMessage } from '../../../schema/draft/schema.js';

export interface StreamableHTTPInterceptorOptions {
  targetUrl: string;
  listenPort: number;
  listenHost?: string;
  onMessage?: (message: AnnotatedJSONRPCMessage) => void;
  clientId: string;
  serverId: string;
}

/**
 * Streamable HTTP interceptor for MCP protocol
 * Handles both regular POST requests and SSE streams with session management
 */
export class StreamableHTTPInterceptor {
  private app: express.Application;
  private server: Server | null = null;
  private options: StreamableHTTPInterceptorOptions;
  private sessions: Map<string, { transport: 'POST' | 'SSE' }> = new Map();

  constructor(options: StreamableHTTPInterceptorOptions) {
    this.options = options;
    this.app = express();
    this.setupMiddleware();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());

    // Handle POST requests
    this.app.post('*', async (req, res) => {
      try {
        const sessionId = req.headers['mcp-session-id'] as string;
        const message = req.body as JSONRPCMessage;
        
        // Log the incoming message
        this.logMessage(message, this.options.clientId, this.options.serverId, {
          method: 'POST',
          headers: this.extractHeaders(req.headers),
        });

        // Track session
        if (sessionId) {
          this.sessions.set(sessionId, { transport: 'POST' });
        }

        // Forward to target server
        const targetUrl = new URL(req.path, this.options.targetUrl);
        const response = await fetch(targetUrl.toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.forwardHeaders(req.headers),
          },
          body: JSON.stringify(message),
        });

        const responseData = await response.json();
        
        // Log the response if it's a JSON-RPC message
        if (this.isJSONRPCMessage(responseData)) {
          this.logMessage(responseData, this.options.serverId, this.options.clientId, {
            method: 'POST',
            headers: this.extractHeaders(response.headers),
          });
        }

        // Forward response headers
        const responseHeaders = ['mcp-session-id', 'mcp-protocol-version'];
        responseHeaders.forEach(header => {
          const value = response.headers.get(header);
          if (value) {
            res.setHeader(header, value);
          }
        });

        res.status(response.status).json(responseData);
      } catch (error) {
        console.error('Error forwarding POST request:', error);
        res.status(500).json({ 
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal proxy error' },
          id: null
        });
      }
    });

    // Handle GET requests for SSE
    this.app.get('*', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string;
      
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      try {
        // Track session
        if (sessionId) {
          this.sessions.set(sessionId, { transport: 'SSE' });
        }

        const targetUrl = new URL(req.path, this.options.targetUrl);
        const response = await fetch(targetUrl.toString(), {
          headers: this.forwardHeaders(req.headers),
        });

        if (!response.body) {
          res.status(500).end();
          return;
        }

        // Forward SSE headers
        const sseHeaders = ['mcp-session-id'];
        sseHeaders.forEach(header => {
          const value = response.headers.get(header);
          if (value) {
            res.setHeader(header, value);
          }
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            // Forward SSE line
            res.write(line + '\n');

            // Parse SSE data for logging
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (this.isJSONRPCMessage(data)) {
                  this.logMessage(data, this.options.serverId, this.options.clientId, {
                    method: 'GET-SSE',
                    headers: this.extractHeaders(req.headers),
                  });
                }
              } catch {
                // Not JSON or not a JSON-RPC message
              }
            }
          }
        }

        res.end();
      } catch (error) {
        console.error('Error forwarding SSE stream:', error);
        res.status(500).end();
      }
    });

    // Handle DELETE requests for session termination
    this.app.delete('*', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string;
      
      try {
        // Remove session tracking
        if (sessionId) {
          this.sessions.delete(sessionId);
        }

        // Forward to target server
        const targetUrl = new URL(req.path, this.options.targetUrl);
        const response = await fetch(targetUrl.toString(), {
          method: 'DELETE',
          headers: this.forwardHeaders(req.headers),
        });

        res.status(response.status).end();
      } catch (error) {
        console.error('Error forwarding DELETE request:', error);
        res.status(500).end();
      }
    });
  }

  private forwardHeaders(headers: any): Record<string, string> {
    const result: Record<string, string> = {};
    const headersToForward = [
      'mcp-session-id',
      'mcp-protocol-version',
      'accept',
      'authorization',
    ];

    for (const header of headersToForward) {
      if (headers[header]) {
        result[header] = headers[header];
      }
    }

    return result;
  }

  private extractHeaders(headers: any): Record<string, string> {
    const result: Record<string, string> = {};
    const relevantHeaders = [
      'mcp-session-id',
      'mcp-protocol-version',
      'content-type',
      'accept',
    ];

    for (const header of relevantHeaders) {
      const value = typeof headers.get === 'function' ? headers.get(header) : headers[header];
      if (value) {
        result[header] = value;
      }
    }

    return result;
  }

  private isJSONRPCMessage(data: any): data is JSONRPCMessage {
    return (
      typeof data === 'object' &&
      data !== null &&
      data.jsonrpc === '2.0' &&
      (('method' in data && (typeof data.id === 'string' || typeof data.id === 'number' || !('id' in data))) ||
       ('result' in data && ('id' in data)) ||
       ('error' in data && ('id' in data)))
    );
  }

  private logMessage(
    message: JSONRPCMessage,
    sender: string,
    recipient: string,
    httpMetadata?: {
      method: 'POST' | 'POST-SSE' | 'GET-SSE';
      headers: Record<string, string>;
    }
  ): void {
    const annotated: AnnotatedJSONRPCMessage = {
      from: sender,
      to: recipient,
      message,
      metadata: httpMetadata ? {
        streamable_http_metadata: httpMetadata,
      } : undefined,
    };

    if (this.options.onMessage) {
      this.options.onMessage(annotated);
    }
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(
        this.options.listenPort,
        this.options.listenHost || '127.0.0.1',
        () => {
          resolve();
        }
      );
      
      this.server.on('error', reject);
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.sessions.clear();
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }
}