import { spawn, ChildProcess } from 'node:child_process';
import { Transform } from 'node:stream';
import type { AnnotatedJSONRPCMessage } from '../types.js';
import type { JSONRPCMessage } from '../../../schema/draft/schema.js';

export interface StdioInterceptorOptions {
  command: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
  onMessage?: (message: AnnotatedJSONRPCMessage) => void;
  clientId: string;
  serverId: string;
}

/**
 * Simple stdio interceptor that logs JSON-RPC messages between client and server
 */
export class StdioInterceptor {
  private serverProcess: ChildProcess | null = null;
  private options: StdioInterceptorOptions;

  constructor(options: StdioInterceptorOptions) {
    this.options = options;
  }

  start(): void {
    // Spawn the server process
    this.serverProcess = spawn(this.options.command, this.options.args || [], {
      env: this.options.env,
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    if (!this.serverProcess.stdin || !this.serverProcess.stdout) {
      throw new Error('Failed to create stdio pipes');
    }

    // Create transform streams to intercept messages with proper line buffering
    const createLineTransform = (sender: string, recipient: string) => {
      let buffer = '';
      
      return new Transform({
        transform: (chunk, _encoding, callback) => {
          buffer += chunk.toString();
          
          // Process complete lines
          const lines = buffer.split('\n');
          // Keep the last incomplete line in the buffer
          buffer = lines.pop() || '';
          
          // Process each complete line
          for (const line of lines) {
            if (line.trim()) {
              try {
                const message = JSON.parse(line) as JSONRPCMessage;
                this.logMessage(message, sender, recipient);
              } catch (e) {
                // Not valid JSON, ignore
              }
            }
          }
          
          callback(null, chunk);
        },
        flush: (callback) => {
          // Process any remaining data in buffer
          if (buffer.trim()) {
            try {
              const message = JSON.parse(buffer) as JSONRPCMessage;
              this.logMessage(message, sender, recipient);
            } catch (e) {
              // Not valid JSON, ignore
            }
          }
          callback();
        }
      });
    };
    
    const clientToServerTransform = createLineTransform(this.options.clientId, this.options.serverId);
    const serverToClientTransform = createLineTransform(this.options.serverId, this.options.clientId);

    // Wire up the streams
    process.stdin
      .pipe(clientToServerTransform)
      .pipe(this.serverProcess.stdin);

    this.serverProcess.stdout
      .pipe(serverToClientTransform)
      .pipe(process.stdout);
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

  close(): void {
    if (this.serverProcess && !this.serverProcess.killed) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }
  }
}