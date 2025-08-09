#!/usr/bin/env tsx
import { spawn, ChildProcess } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Scenarios } from '../src/types.js';

const SCENARIOS_PATH = join(process.cwd(), 'scenarios/data.json');
const GOLDENS_DIR = join(process.cwd(), 'scenarios/goldens');
const TYPESCRIPT_SDK_DIR = join(process.cwd(), 'typescript-sdk');

// Ensure goldens directory exists
if (!existsSync(GOLDENS_DIR)) {
  mkdirSync(GOLDENS_DIR, { recursive: true });
}

async function runScenario(scenario: Scenarios['scenarios'][0]): Promise<void> {
  console.log(`\n=== Running scenario ${scenario.id}: ${scenario.description} ===`);
  
  const logPath = join(GOLDENS_DIR, `${scenario.id}.jsonl`);
  
  // Determine transport type (default to stdio if not http_only)
  const transport = scenario.http_only ? 'sse' : 'stdio';
  
  try {
    if (transport === 'stdio') {
      await runStdioScenario(scenario, logPath);
    } else if (transport === 'sse') {
      await runSSEScenario(scenario, logPath);
    } else if (transport === 'streamable-http') {
      await runStreamableHTTPScenario(scenario, logPath);
    }
    
    console.log(`✓ Scenario ${scenario.id} completed successfully`);
  } catch (error) {
    console.error(`✗ Scenario ${scenario.id} failed:`, error);
    throw error;
  }
}

async function runStdioScenario(scenario: Scenarios['scenarios'][0], logPath: string): Promise<void> {
  // For stdio, we need to run the client with the server command as argument
  const clientArgs = [
    join(TYPESCRIPT_SDK_DIR, 'test-client'),
    '--scenario-id', scenario.id.toString(),
    '--id', scenario.client_ids[0], // Use first client for now
    'stdio',
    '--', // Stop option parsing here
    'tsx',
    join(process.cwd(), 'src/cli/mitm.ts'),
    'stdio',
    '--log', logPath,
    '--scenario-id', scenario.id.toString(),
    '--client-id', scenario.client_ids[0],
    '--server-id', scenario.server_name,
    '--',
    join(TYPESCRIPT_SDK_DIR, 'test-server'),
    '--server-name', scenario.server_name,
    '--transport', 'stdio'
  ];
  
  console.error('Running command:', 'tsx', clientArgs.join(' '));
  await runCommand('tsx', clientArgs);
}

async function runSSEScenario(scenario: Scenarios['scenarios'][0], logPath: string): Promise<void> {
  // For SSE, we need to start the server first, then run the client
  const port = 8080 + scenario.id; // Use unique port per scenario
  
  // Start server
  const serverProc = spawn('tsx', [
    join(TYPESCRIPT_SDK_DIR, 'test-server'),
    '--server-name', scenario.server_name,
    '--transport', 'sse',
    '--host', '127.0.0.1',
    '--port', port.toString()
  ]);
  
  // Wait for server to be ready
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  try {
    // Run client through MITM
    const clientArgs = [
      join(TYPESCRIPT_SDK_DIR, 'test-client'),
      '--scenario-id', scenario.id.toString(),
      '--id', scenario.client_ids[0],
      'sse',
      `http://127.0.0.1:${port}`
    ];
    
    // Run through MITM
    const mitmArgs = [
      join(process.cwd(), 'src/cli/mitm.ts'),
      'sse',
      '--log', logPath,
      '--scenario-id', scenario.id.toString(),
      '--client-id', scenario.client_ids[0],
      '--server-id', scenario.server_name,
      '--port', (port + 1000).toString(), // MITM proxy port
      '--',
      `http://127.0.0.1:${port}`
    ];
    
    // Start MITM proxy
    const mitmProc = spawn('tsx', mitmArgs);
    
    // Wait for MITM to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Update client to connect through MITM
    clientArgs[4] = `http://127.0.0.1:${port + 1000}`;
    
    await runCommand('tsx', clientArgs);
    
    // Clean up MITM
    mitmProc.kill();
  } finally {
    // Clean up server
    serverProc.kill();
  }
}

async function runStreamableHTTPScenario(scenario: Scenarios['scenarios'][0], logPath: string): Promise<void> {
  // Similar to SSE but with streamable-http transport
  const port = 9080 + scenario.id;
  
  // Implementation similar to SSE...
  console.log('Streamable HTTP scenarios not yet implemented');
}

async function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    
    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command exited with code ${code}`));
      }
    });
  });
}

async function main() {
  console.log('=== MCP Compliance Golden Generation ===\n');
  
  // Check prerequisites
  if (!existsSync(join(TYPESCRIPT_SDK_DIR, 'test-client'))) {
    console.error('Error: TypeScript SDK test-client not found');
    console.error('Please build the TypeScript SDK first');
    process.exit(1);
  }
  
  // Load scenarios
  const scenariosData = JSON.parse(readFileSync(SCENARIOS_PATH, 'utf-8')) as Scenarios;
  
  console.log(`Found ${scenariosData.scenarios.length} scenarios to run\n`);
  
  // Run each scenario
  let failedScenarios = 0;
  
  for (const scenario of scenariosData.scenarios) {
    try {
      await runScenario(scenario);
    } catch (error) {
      console.error(`\nFailed to complete scenario ${scenario.id}`);
      failedScenarios++;
      // Continue to next scenario instead of exiting
    }
  }
  
  if (failedScenarios > 0) {
    console.log(`\n=== Completed with ${failedScenarios} failed scenarios ===`);
    process.exit(1);
  } else {
    console.log('\n=== All scenarios completed successfully! ===');
  }
}

// Run the script
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});