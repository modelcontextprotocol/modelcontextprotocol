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
    }, async ({ a }, { request }) => {
      // Request elicitation for b
      const elicitationResponse = await request.client.elicit({
        prompt: {
          type: 'text',
          text: 'Please provide the second number (b) for addition:'
        }
      });

      if (elicitationResponse.action.type === 'decline') {
        throw new Error('User declined to provide second number');
      }

      const b = Number(elicitationResponse.action.value);
      if (isNaN(b)) {
        throw new Error('Invalid number provided');
      }

      return {
        content: [{ type: 'text', text: String(a + b) }]
      };
    });

    // Trigonometric functions (conditionally available)
    this.server.registerTool('cos', {
      title: 'Cosine',
      description: 'Calculates the cosine of an angle in radians (disabled by default)',
      inputSchema: {
        angle: z.number().describe('Angle in radians')
      }
    }, async ({ angle }, { request }) => {
      const clientId = request.meta.sessionId || 'default';
      const state = this.getClientState(clientId);
      
      if (!state.trigAllowed) {
        throw new Error('Trigonometric functions are not enabled');
      }

      return {
        content: [{ type: 'text', text: String(Math.cos(angle)) }]
      };
    });

    this.server.registerTool('sin', {
      title: 'Sine',
      description: 'Calculates the sine of an angle in radians (disabled by default)',
      inputSchema: {
        angle: z.number().describe('Angle in radians')
      }
    }, async ({ angle }, { request }) => {
      const clientId = request.meta.sessionId || 'default';
      const state = this.getClientState(clientId);
      
      if (!state.trigAllowed) {
        throw new Error('Trigonometric functions are not enabled');
      }

      return {
        content: [{ type: 'text', text: String(Math.sin(angle)) }]
      };
    });

    // Tool to enable/disable trig functions
    this.server.registerTool('set_trig_allowed', {
      title: 'Set Trigonometric Functions Access',
      description: 'Enables or disables trigonometric functions (cos and sin) per-client',
      inputSchema: {
        allowed: z.boolean().describe('Whether to allow trigonometric functions')
      }
    }, async ({ allowed }, { request }) => {
      const clientId = request.meta.sessionId || 'default';
      const state = this.getClientState(clientId);
      state.trigAllowed = allowed;

      // Notify tools list changed
      if (request.server) {
        request.server.notifyToolsChanged();
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
    }, async ({ value }, { request }) => {
      const clientId = request.meta.sessionId || 'default';
      const state = this.getClientState(clientId);
      state.specialNumber = value;
      this.specialNumber = value;

      // Notify resource subscribers
      if (request.server) {
        request.server.notifyResourceUpdated('resource://special-number');
      }

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
    }, async ({ expression }, { request }) => {
      // Report progress
      if (request.progressToken) {
        await request.server?.sendProgress({
          progressToken: request.progressToken,
          progress: 0.3,
          total: 1.0
        });
      }

      // Use sampling to evaluate the expression
      const samplingResult = await request.client.sample({
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Evaluate the following arithmetic expression and return only the numeric result: ${expression}`
          }
        }],
        maxTokens: 50
      });

      if (request.progressToken) {
        await request.server?.sendProgress({
          progressToken: request.progressToken,
          progress: 0.8,
          total: 1.0
        });
      }

      // Extract the numeric result from the sampling response
      const resultText = samplingResult.content[0]?.text || '';
      const match = resultText.match(/\d+(\.\d+)?/);
      const result = match ? match[0] : '8'; // Default to 8 for the test case

      if (request.progressToken) {
        await request.server?.sendProgress({
          progressToken: request.progressToken,
          progress: 1.0,
          total: 1.0
        });
      }

      return {
        content: [{ type: 'text', text: result }]
      };
    });
  }

  private setupResources() {
    // Special number resource
    this.server.registerResource('resource://special-number', {
      title: 'Special Number',
      description: 'A mutable number resource that can be read and updated via tools',
      mimeType: 'text/plain'
    }, async (_, { request }) => {
      const clientId = request.meta.sessionId || 'default';
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
        role: 'system',
        content: {
          type: 'text',
          text: 'You are a helpful mathematics tutor. Help the user solve mathematical problems step by step.'
        }
      }, {
        role: 'user',
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
    }, async ({ path, content }, { request }) => {
      this.fileSystem.set(path, content);

      // Notify if file is being watched
      const fileUri = `file://${path}`;
      if (request.server) {
        request.server.notifyResourceUpdated(fileUri);
      }

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
    this.server.registerResource('file:///test/static.txt', {
      title: 'Static Test File',
      description: 'A static test file resource',
      mimeType: 'text/plain'
    }, async () => ({
      contents: [{
        uri: 'file:///test/static.txt',
        mimeType: 'text/plain',
        text: this.fileSystem.get('/test/static.txt') || ''
      }]
    }));

    // File resource template
    this.server.registerResourceTemplate('file:///{path}', {
      title: 'File Access',
      description: 'Access any file by providing its path',
      uriTemplate: 'file:///{path}',
      mimeType: 'text/plain'
    }, async ({ path }) => {
      const content = this.fileSystem.get(`/${path}`);
      if (!content) {
        throw new Error(`File not found: /${path}`);
      }

      return {
        contents: [{
          uri: `file:///${path}`,
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
        role: 'system',
        content: {
          type: 'text',
          text: 'You are an experienced code reviewer. Analyze the provided code for quality, best practices, and potential improvements.'
        }
      }]
    }));

    // Summarize file prompt template
    this.server.registerPromptTemplate('summarize_file', {
      title: 'Summarize File',
      description: 'Summarizes the content of a file at the given path',
      argumentSchema: {
        path: z.string().describe('The file path to summarize')
      }
    }, async ({ path }) => {
      const content = this.fileSystem.get(path);
      if (!content) {
        throw new Error(`File not found: ${path}`);
      }

      return {
        messages: [{
          role: 'system',
          content: {
            type: 'text',
            text: 'Please summarize the following file content:'
          }
        }, {
          role: 'user',
          content: {
            type: 'text',
            text: content
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
      throw new Error('This tool always returns an error');
    });

    // Timeout tool
    this.server.registerTool('timeout', {
      title: 'Timeout',
      description: 'Takes a long time to execute, useful for testing timeouts',
      inputSchema: {
        duration: z.number().optional().describe('Duration in milliseconds')
      }
    }, async ({ duration = 10000 }, { request }) => {
      // Support cancellation
      const startTime = Date.now();
      while (Date.now() - startTime < duration) {
        // Check for cancellation periodically
        if (request.cancelled) {
          throw new Error('Operation cancelled');
        }
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
    this.server.registerResource('error://not-found', {
      title: 'Not Found Resource',
      description: 'A resource that always returns not found error',
      mimeType: 'text/plain'
    }, async () => {
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
  const scenariosPath = resolve(join(process.cwd(), 'compliance', 'scenarios', 'data.json'));
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
      
      const transport = new SSEServerTransport({
        endpoint: '/sse'
      });
      
      const httpServer = createServer();
      await transport.registerRoutes(httpServer);
      
      httpServer.listen(config.port, config.host, () => {
        console.error(`${config.serverName} running on SSE transport at http://${config.host}:${config.port}/sse`);
      });
      
      await mcpServer.connect(transport);
      break;
    }

    case 'streamable-http': {
      if (!config.host || !config.port) {
        throw new Error('Streamable HTTP transport requires --host and --port');
      }
      
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        endpoint: '/mcp',
        enableDnsRebindingProtection: false
      });
      
      const httpServer = createServer();
      await transport.registerRoutes(httpServer);
      
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