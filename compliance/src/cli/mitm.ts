#!/usr/bin/env tsx
import { createWriteStream, WriteStream, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StdioInterceptor } from '../interceptors/stdio.js';
import { SSEInterceptor } from '../interceptors/sse.js';
import { StreamableHTTPInterceptor } from '../interceptors/streamable-http.js';
import type { AnnotatedJSONRPCMessage, Scenarios } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface MITMOptions {
  transport: 'stdio' | 'sse' | 'streamable-http';
  logFile?: string;
  host?: string;
  port?: number;
  targetUrl?: string;
  command?: string;
  args?: string[];
  clientId?: string;
  serverId?: string;
  scenarioId?: number;
}

function printUsage() {
  console.error(`
Usage: mitm <transport> [options] -- <command> [args...]

Transports:
  stdio              Intercept stdio communication
  sse                Intercept Server-Sent Events
  streamable-http    Intercept streamable HTTP

Common Options:
  --log <file>       Write JSON logs to file (JSONL format)
  --client-id <id>   Client identifier (default: "client")
  --server-id <id>   Server identifier (default: "server")
  --scenario-id <id> Scenario ID from data.json (adds description as comment)

Transport-specific Options:
  For 'sse' and 'streamable-http':
    --host <host>    Host to listen on (default: 127.0.0.1)
    --port <port>    Port to listen on (required)
    <url>            Target server URL (required)
  
  For 'stdio':
    <command> [args] Command to execute (required)

Examples:
  mitm stdio --log test.jsonl -- node server.js
  mitm sse --port 8080 --log test.jsonl -- http://localhost:3000
  mitm streamable-http --port 8080 --log test.jsonl -- http://localhost:3000
`);
}

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    process.exit(0);
  }

  const transport = args[0] as MITMOptions['transport'];
  if (!['stdio', 'sse', 'streamable-http'].includes(transport)) {
    console.error(`Error: Invalid transport '${transport}'`);
    printUsage();
    process.exit(1);
  }

  // Find the -- separator
  const dashIndex = args.indexOf('--');
  if (dashIndex === -1) {
    console.error('Error: Missing -- separator before command/url');
    printUsage();
    process.exit(1);
  }

  const optionArgs = args.slice(1, dashIndex);
  const commandArgs = args.slice(dashIndex + 1);

  if (commandArgs.length === 0) {
    console.error('Error: Missing command or URL after --');
    printUsage();
    process.exit(1);
  }

  // Parse options
  const options: MITMOptions = {
    transport,
    clientId: 'client',
    serverId: 'server',
  };

  for (let i = 0; i < optionArgs.length; i++) {
    const arg = optionArgs[i];
    switch (arg) {
      case '--log':
        options.logFile = optionArgs[++i];
        break;
      case '--host':
        options.host = optionArgs[++i];
        break;
      case '--port':
        options.port = parseInt(optionArgs[++i], 10);
        break;
      case '--client-id':
        options.clientId = optionArgs[++i];
        break;
      case '--server-id':
        options.serverId = optionArgs[++i];
        break;
      case '--scenario-id':
        options.scenarioId = parseInt(optionArgs[++i], 10);
        if (isNaN(options.scenarioId)) {
          console.error('Error: --scenario-id must be a number');
          process.exit(1);
        }
        break;
      default:
        console.error(`Error: Unknown option '${arg}'`);
        printUsage();
        process.exit(1);
    }
  }

  // Set up logging
  let logStream: WriteStream | null = null;
  const logMessage = (message: AnnotatedJSONRPCMessage) => {
    const line = JSON.stringify(message) + '\n';
    if (logStream) {
      logStream.write(line);
    }
    // Also log to stderr for debugging
    const messageInfo = 'method' in message.message 
      ? message.message.method 
      : 'result' in message.message 
        ? 'response' 
        : 'error';
    process.stderr.write(`[MITM] ${message.from} -> ${message.to}: ${messageInfo}\n`);
  };

  if (options.logFile) {
    logStream = createWriteStream(options.logFile, { flags: 'w' });
    logStream.on('error', (error) => {
      console.error('Error writing to log file:', error);
      process.exit(1);
    });
    
    // If scenario ID is provided, write the description as a comment
    if (options.scenarioId !== undefined) {
      try {
        // Build path relative to the binary location
        const dataPath = join(__dirname, '..', '..', 'scenarios', 'data.json');
        const data = JSON.parse(readFileSync(dataPath, 'utf-8')) as Scenarios;
        const scenario = data.scenarios.find(s => s.id === options.scenarioId);
        
        if (!scenario) {
          console.error(`Error: Scenario with ID ${options.scenarioId} not found`);
          process.exit(1);
        }
        
        // Write the description as comment lines
        const lines = scenario.description.split('\n');
        for (const line of lines) {
          logStream.write(`// ${line}\n`);
        }
      } catch (error) {
        console.error('Error reading scenario data:', error);
        process.exit(1);
      }
    }
  }

  // Create and start the appropriate interceptor
  try {
    switch (transport) {
      case 'stdio': {
        options.command = commandArgs[0];
        options.args = commandArgs.slice(1);
        
        const interceptor = new StdioInterceptor({
          command: options.command,
          args: options.args,
          clientId: options.clientId!,
          serverId: options.serverId!,
          onMessage: logMessage,
        });
        
        interceptor.start();
        
        // Handle graceful shutdown
        process.on('SIGINT', () => {
          interceptor.close();
          if (logStream) logStream.end();
          process.exit(0);
        });
        
        break;
      }
      
      case 'sse': {
        if (!options.port) {
          console.error('Error: --port is required for SSE transport');
          process.exit(1);
        }
        
        options.targetUrl = commandArgs[0];
        
        const interceptor = new SSEInterceptor({
          targetUrl: options.targetUrl,
          listenPort: options.port,
          listenHost: options.host,
          clientId: options.clientId!,
          serverId: options.serverId!,
          onMessage: logMessage,
        });
        
        await interceptor.start();
        console.error(`[MITM] SSE proxy listening on ${options.host || '127.0.0.1'}:${options.port}`);
        console.error(`[MITM] Forwarding to ${options.targetUrl}`);
        
        // Handle graceful shutdown
        process.on('SIGINT', async () => {
          await interceptor.close();
          if (logStream) logStream.end();
          process.exit(0);
        });
        
        break;
      }
      
      case 'streamable-http': {
        if (!options.port) {
          console.error('Error: --port is required for streamable-http transport');
          process.exit(1);
        }
        
        options.targetUrl = commandArgs[0];
        
        const interceptor = new StreamableHTTPInterceptor({
          targetUrl: options.targetUrl,
          listenPort: options.port,
          listenHost: options.host,
          clientId: options.clientId!,
          serverId: options.serverId!,
          onMessage: logMessage,
        });
        
        await interceptor.start();
        console.error(`[MITM] Streamable HTTP proxy listening on ${options.host || '127.0.0.1'}:${options.port}`);
        console.error(`[MITM] Forwarding to ${options.targetUrl}`);
        
        // Handle graceful shutdown
        process.on('SIGINT', async () => {
          await interceptor.close();
          if (logStream) logStream.end();
          process.exit(0);
        });
        
        break;
      }
    }
  } catch (error) {
    console.error('Error starting interceptor:', error);
    if (logStream) logStream.end();
    process.exit(1);
  }
}

// Run the CLI
main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});