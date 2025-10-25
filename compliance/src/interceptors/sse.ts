import { createServer, Server, IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import express from 'express';
import type { AnnotatedJSONRPCMessage } from '../types.js';
import type { JSONRPCMessage } from '../../../schema/draft/schema.js';

export interface SSEInterceptorOptions {
  targetUrl: string;
  listenPort: number;
  listenHost?: string;
  onMessage?: (message: AnnotatedJSONRPCMessage) => void;
  clientId: string;
  serverId: string;
}

/**
 * SSE interceptor that acts as a proxy between client and server
 * capturing JSON-RPC messages sent over Server-Sent Events
 */
export class SSEInterceptor {
  private app: express.Application;
  private server: Server | null = null;
  private options: SSEInterceptorOptions;
  
  constructor(options: SSEInterceptorOptions) {
    this.options = options;
    this.app = express();
    this.setupMiddleware();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());

    // Handle POST requests (JSON-RPC messages from client to server)
    this.app.post('*', async (req, res) => {
      try {
        const message = req.body as JSONRPCMessage;
        this.logMessage(message, this.options.clientId, this.options.serverId);

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
        if (this.isJSONRPCMessage(responseData)) {
          this.logMessage(responseData, this.options.serverId, this.options.clientId);
        }

        res.status(response.status).json(responseData);
      } catch (error) {
        console.error('Error forwarding POST request:', error);
        res.status(500).json({ error: 'Proxy error' });
      }
    });

    // Handle GET requests (SSE streams)
    this.app.get('*', async (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      try {
        const targetUrl = new URL(req.path, this.options.targetUrl);
        const response = await fetch(targetUrl.toString(), {
          headers: this.forwardHeaders(req.headers),
        });

        if (!response.body) {
          res.status(500).end();
          return;
        }

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

            // Try to parse as SSE data
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (this.isJSONRPCMessage(data)) {
                  this.logMessage(data, this.options.serverId, this.options.clientId);
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
    recipient: string
  ): void {
    const annotated: AnnotatedJSONRPCMessage = {
      from: sender,
      to: recipient,
      message,
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
}