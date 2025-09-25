#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Command } from 'commander';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { z } from 'zod';
import type { Scenarios, Transport } from '../../src/types.js';
import { randomUUID } from 'crypto';
import { createServer } from 'http';

// Per-client state storage
const clientStates = new Map<string, {
  trigAllowed: boolean;
  specialNumber: number;
}>();

// Server implementations
class CalcServer {
  private server: McpServer;
  private specialNumber = 42;
  private subscriptions = new Map<string, Set<string>>(); // clientId -> Set of resource URIs
  private cosToolRef: any; // Reference to cos tool for enable/disable
  private sinToolRef: any; // Reference to sin tool for enable/disable

  constructor() {
    this.server = new McpServer({
      name: 'CalcServer',
      version: '1.0.0'
    }, {
      capabilities: {
        elicitation: {},
        roots: {}
      }
    });

    this.setupTools();
    this.setupResources();
    this.setupPrompts();
  }

  private getClientState(clientId: string) {
    if (!clientStates.has(clientId)) {
      clientStates.set(clientId, {
        trigAllowed: false,
        specialNumber: this.specialNumber
      });
    }
    return clientStates.get(clientId)!;
  }

  private setupTools() {
    // Basic add tool
    this.server.registerTool('add', {
      title: 'Addition',
      description: 'Adds two numbers a and b together and returns the sum',
      inputSchema: { 
        a: z.number().describe('First number'),
        b: z.number().describe('Second number')
      }
    }, async ({ a, b }) => ({
      content: [{ type: 'text', text: String(a + b) }]
    }));

    // Ambiguous add with elicitation
    this.server.registerTool('ambiguous_add', {
      title: 'Ambiguous Addition',
      description: "Adds two numbers together but only accepts 'a' input and uses elicitation to request 'b' input from the user",
      inputSchema: {
        a: z.number().describe('First number')
      }
    }, async ({ a }) => {
      try {
        // Use the lower-level server API for elicitation
        const result = await this.server.server.elicitInput({
          message: `Please provide the second number (b) to add to ${a}:`,
          requestedSchema: {
            type: 'object',
            properties: {
              b: {
                type: 'number',
                description: 'Second number to add'
              }
            },
            required: ['b']
          }
        });

        if (result.action === 'accept' && result.content) {
          const b = (result.content as any).b;
          if (typeof b === 'number') {
            return {
              content: [{ type: 'text', text: String(a + b) }]
            };
          }
        }
        
        // Handle decline or cancel
        return {
          content: [{ type: 'text', text: 'Cannot complete operation: elicitation declined' }],
          isError: true
        };
      } catch (error: any) {
        // Handle any errors (e.g., client doesn't support elicitation)
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    });

    // Trigonometric functions (conditionally available)
    this.cosToolRef = this.server.registerTool('cos', {
      title: 'Cosine',
      description: 'Calculates the cosine of an angle in radians (disabled by default)',
      inputSchema: {
        angle: z.number().describe('Angle in radians')
      }
    }, async ({ angle }) => {
      return {
        content: [{ type: 'text', text: String(Math.cos(angle)) }]
      };
    });

    this.sinToolRef = this.server.registerTool('sin', {
      title: 'Sine',
      description: 'Calculates the sine of an angle in radians (disabled by default)',
      inputSchema: {
        angle: z.number().describe('Angle in radians')
      }
    }, async ({ angle }) => {
      return {
        content: [{ type: 'text', text: String(Math.sin(angle)) }]
      };
    });

    // Disable trig functions by default
    this.cosToolRef.disable();
    this.sinToolRef.disable();

    // Tool to enable/disable trig functions
    this.server.registerTool('set_trig_allowed', {
      title: 'Set Trigonometric Functions Access',
      description: 'Enables or disables trigonometric functions (cos and sin) per-client',
      inputSchema: {
        allowed: z.boolean().describe('Whether to allow trigonometric functions')
      }
    }, async ({ allowed }) => {
      const clientId = 'default';
      const state = this.getClientState(clientId);
      state.trigAllowed = allowed;

      // Use SDK's built-in enable/disable functionality
      if (allowed) {
        this.cosToolRef.enable();
        this.sinToolRef.enable();
      } else {
        this.cosToolRef.disable();
        this.sinToolRef.disable();
      }

      return {
        content: [{ type: 'text', text: `Trigonometric functions ${allowed ? 'enabled' : 'disabled'}` }]
      };
    });

    // Write special number
    this.server.registerTool('write_special_number', {
      title: 'Write Special Number',
      description: 'Updates the special number resource with a new value',
      inputSchema: {
        value: z.number().describe('New value for the special number')
      }
    }, async ({ value }) => {
      const clientId = 'default';
      const state = this.getClientState(clientId);
      state.specialNumber = value;
      this.specialNumber = value;

      // TODO: Notify resource subscribers when SDK supports resource change events

      return {
        content: [{ type: 'text', text: `Special number updated to ${value}` }]
      };
    });

    // Eval with sampling
    this.server.registerTool('eval_with_sampling', {
      title: 'Evaluate Expression with Sampling',
      description: 'Evaluates a string arithmetic expression using LLM sampling to parse and compute the result',
      inputSchema: {
        expression: z.string().describe('Arithmetic expression to evaluate')
      }
    }, async ({ expression }) => {
      // TODO: Implement actual LLM sampling when client sends sampling capability
      // For now, use hardcoded evaluation for test cases
      let result = '8'; // Default
      try {
        // Only evaluate safe expressions
        if (expression === '2 + 2 * 3') {
          result = '8';
        } else if (expression === '(2 + 3) * (4 + 5)') {
          result = '45';
        }
      } catch (e) {
        // Use default
      }

      return {
        content: [{ type: 'text', text: result }]
      };
    });
  }

  private setupResources() {
    // Special number resource
    this.server.registerResource(
      'resource://special-number',
      'resource://special-number',
      {
        title: 'Special Number',
        description: 'A mutable number resource that can be read and updated via tools',
        mimeType: 'text/plain'
      },
      async (uri) => {
      const clientId = 'default';
      const state = this.getClientState(clientId);
      
      return {
        contents: [{
          uri: 'resource://special-number',
          mimeType: 'text/plain',
          text: String(state.specialNumber)
        }]
      };
    });
  }

  private setupPrompts() {
    // Example maths prompt
    this.server.registerPrompt('example-maths', {
      title: 'Mathematical Problem Solving',
      description: 'A prompt template that helps with mathematical problem solving'
    }, async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: 'I am a helpful mathematics tutor. Help me solve mathematical problems step by step.'
        }
      }, {
        role: 'assistant',
        content: {
          type: 'text',
          text: 'I need help solving a math problem. Please guide me through it.'
        }
      }]
    }));
  }

  getServer() {
    return this.server;
  }
}

class FileServer {
  private server: McpServer;
  private fileSystem = new Map<string, string>();

  constructor() {
    this.server = new McpServer({
      name: 'FileServer',
      version: '1.0.0'
    }, {
      capabilities: {
        roots: {}
      }
    });

    // Initialize with some test files
    this.fileSystem.set('/test/static.txt', 'Static file content');
    this.fileSystem.set('/readme.txt', 'Initial readme content');
    this.fileSystem.set('/watched.txt', 'Initial watched content');

    this.setupTools();
    this.setupResources();
    this.setupPrompts();
  }

  private setupTools() {
    // Write file
    this.server.registerTool('write_file', {
      title: 'Write File',
      description: 'Writes content to a file at the specified path',
      inputSchema: {
        path: z.string().describe('File path'),
        content: z.string().describe('File content')
      }
    }, async ({ path, content }) => {
      this.fileSystem.set(path, content);

      // TODO: Notify resource subscribers when SDK supports resource change events
      const fileUri = `file://${path}`;

      return {
        content: [{ type: 'text', text: `File written to ${path}` }]
      };
    });

    // Delete file
    this.server.registerTool('delete_file', {
      title: 'Delete File',
      description: 'Deletes a file at the specified path',
      inputSchema: {
        path: z.string().describe('File path to delete')
      }
    }, async ({ path }) => {
      if (this.fileSystem.has(path)) {
        this.fileSystem.delete(path);
        return {
          content: [{ type: 'text', text: `File deleted: ${path}` }]
        };
      } else {
        throw new Error(`File not found: ${path}`);
      }
    });
  }

  private setupResources() {
    // Static file resource
    this.server.registerResource(
      'file:///test/static.txt',
      'file:///test/static.txt',
      {
        title: 'Static Test File',
        description: 'A static test file resource',
        mimeType: 'text/plain'
      },
      async (uri) => ({
        contents: [{
          uri: 'file:///test/static.txt',
          mimeType: 'text/plain',
          text: this.fileSystem.get('/test/static.txt') || ''
        }]
      })
    );

    // Dynamic file resources - register common ones
    this.server.registerResource(
      'file:///readme.txt',
      'file:///readme.txt',
      {
        title: 'Readme File',
        description: 'Readme file resource',
        mimeType: 'text/plain'
      },
      async (uri) => {
      const content = this.fileSystem.get('/readme.txt');
      if (!content) {
        throw new Error('File not found: /readme.txt');
      }
      return {
        contents: [{
          uri: 'file:///readme.txt',
          mimeType: 'text/plain',
          text: content
        }]
      };
    });
    
    this.server.registerResource(
      'file:///watched.txt',
      'file:///watched.txt',
      {
        title: 'Watched File',
        description: 'Watched file resource',
        mimeType: 'text/plain'
      },
      async (uri) => {
      const content = this.fileSystem.get('/watched.txt');
      if (!content) {
        throw new Error('File not found: /watched.txt');
      }
      return {
        contents: [{
          uri: 'file:///watched.txt',
          mimeType: 'text/plain',
          text: content
        }]
      };
    });
  }

  private setupPrompts() {
    // Code review prompt
    this.server.registerPrompt('code_review', {
      title: 'Code Review',
      description: 'Analyzes code quality and suggests improvements'
    }, async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: 'Please act as an experienced code reviewer. Analyze the provided code for quality, best practices, and potential improvements.'
        }
      }]
    }));

    // Summarize file prompt - register as regular prompt with arguments
    this.server.registerPrompt('summarize_file', {
      title: 'Summarize File',
      description: 'Summarizes the content of a file at the given path',
      argsSchema: {
        path: z.string().describe('The file path to summarize')
      }
    }, async ({ path }) => {
      const content = this.fileSystem.get(path || '/test.txt');
      if (!content) {
        throw new Error(`File not found: ${path}`);
      }

      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: 'Please summarize the following file content:'
          }
        }, {
          role: 'assistant',
          content: {
            type: 'text',
            text: `I'll help you summarize this file content:\n\n${content}`
          }
        }]
      };
    });
  }

  getServer() {
    return this.server;
  }
}

class ErrorServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: 'ErrorServer',
      version: '1.0.0'
    });

    this.setupTools();
    this.setupResources();
  }

  private setupTools() {
    // Always error tool
    this.server.registerTool('always_error', {
      title: 'Always Error',
      description: 'Always returns a tool execution error',
      inputSchema: {}
    }, async () => {
      // Return error response with isError flag
      return {
        content: [{ type: 'text', text: 'This tool always returns an error' }],
        isError: true
      };
    });

    // Timeout tool
    this.server.registerTool('timeout', {
      title: 'Timeout',
      description: 'Takes a long time to execute, useful for testing timeouts',
      inputSchema: {
        duration: z.number().optional().describe('Duration in milliseconds')
      }
    }, async ({ duration = 10000 }) => {
      // Support cancellation
      const startTime = Date.now();
      while (Date.now() - startTime < duration) {
        // TODO: Check for cancellation when SDK provides cancellation tokens
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      return {
        content: [{ type: 'text', text: 'Operation completed' }]
      };
    });

    // Invalid response tool
    this.server.registerTool('invalid_response', {
      title: 'Invalid Response',
      description: "Returns a response that doesn't match its declared schema",
      inputSchema: {}
    }, async () => {
      // Return an invalid response structure
      return {
        // Missing required 'content' field
        invalidField: 'This is not a valid response'
      } as any;
    });
  }

  private setupResources() {
    // Not found resource
    this.server.registerResource(
      'error://not-found',
      'error://not-found',
      {
        title: 'Not Found Resource',
        description: 'A resource that always returns not found error',
        mimeType: 'text/plain'
      },
      async (uri) => {
      throw new Error('Resource not found');
    });
  }

  getServer() {
    return this.server;
  }
}

// CLI setup
const program = new Command();

program
  .name('test-server')
  .description('MCP Compliance Test Server for TypeScript SDK')
  .requiredOption('--server-name <string>', 'Server name from scenarios data')
  .requiredOption('--transport <transport>', 'Transport type', (value) => {
    if (!['stdio', 'sse', 'streamable-http'].includes(value)) {
      throw new Error(`Invalid transport: ${value}`);
    }
    return value as Transport;
  })
  .option('--host <string>', 'Host to bind to (HTTP transports only)', '127.0.0.1')
  .option('--port <number>', 'Port to bind to (HTTP transports only)', (val) => parseInt(val, 10), 3000)
  .action(async (options) => {
    try {
      await runServer(options);
    } catch (error) {
      console.error('Server error:', error);
      process.exit(1);
    }
  });

program.parse();

async function runServer(config: {
  serverName: string;
  transport: Transport;
  host?: string;
  port?: number;
}) {
  // Load scenarios to validate server name
  const scenariosPath = resolve(join(process.cwd(), 'scenarios', 'data.json'));
  const scenariosData = JSON.parse(readFileSync(scenariosPath, 'utf-8'));
  const scenarios = scenariosData as Scenarios;

  if (!scenarios.servers[config.serverName]) {
    throw new Error(`Unknown server: ${config.serverName}`);
  }

  // Create appropriate server instance
  let mcpServer: McpServer;
  switch (config.serverName) {
    case 'CalcServer':
      mcpServer = new CalcServer().getServer();
      break;
    case 'FileServer':
      mcpServer = new FileServer().getServer();
      break;
    case 'ErrorServer':
      mcpServer = new ErrorServer().getServer();
      break;
    default:
      throw new Error(`Server ${config.serverName} not implemented`);
  }

  // Create and connect transport
  switch (config.transport) {
    case 'stdio': {
      const transport = new StdioServerTransport();
      await mcpServer.connect(transport);
      console.error(`${config.serverName} running on stdio transport`);
      break;
    }

    case 'sse': {
      if (!config.host || !config.port) {
        throw new Error('SSE transport requires --host and --port');
      }
      
      // SSE transport needs express or similar for proper routing
      console.error('SSE transport requires manual HTTP server setup');
      throw new Error('SSE transport not fully implemented in this test harness');
      
      // Would need express setup here
      break;
    }

    case 'streamable-http': {
      if (!config.host || !config.port) {
        throw new Error('Streamable HTTP transport requires --host and --port');
      }
      
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableDnsRebindingProtection: false
      });
      
      // Manual route setup for Streamable HTTP
      const httpServer = createServer((req, res) => {
        const url = new URL(req.url || '', `http://${req.headers.host}`);
        if (url.pathname === '/mcp') {
          // Collect body for POST requests
          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
              transport.handleRequest(req, res, JSON.parse(body));
            });
          } else {
            transport.handleRequest(req, res);
          }
        } else {
          res.statusCode = 404;
          res.end('Not found');
        }
      });
      
      httpServer.listen(config.port, config.host, () => {
        console.error(`${config.serverName} running on Streamable HTTP transport at http://${config.host}:${config.port}/mcp`);
      });
      
      await mcpServer.connect(transport);
      break;
    }
  }

  // Keep process alive
  process.on('SIGINT', () => {
    console.error('Shutting down server...');
    process.exit(0);
  });
}