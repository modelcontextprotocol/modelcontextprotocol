#!/usr/bin/env tsx
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Parse command line arguments
const args = process.argv.slice(2);
const sdks = args.filter(arg => !arg.startsWith('--'));
const specificScenario = args.find(arg => arg.startsWith('--scenario='))?.split('=')[1];

// Validate SDKs exist
const availableSDKs = sdks.length > 0 ? sdks : ['typescript-sdk'];
for (const sdk of availableSDKs) {
  const clientPath = join(process.cwd(), sdk, 'test-client');
  const serverPath = join(process.cwd(), sdk, 'test-server');
  
  if (!existsSync(clientPath)) {
    console.error(`Error: ${sdk} test-client not found at ${clientPath}`);
    process.exit(1);
  }
  
  if (!existsSync(serverPath)) {
    console.error(`Error: ${sdk} test-server not found at ${serverPath}`);
    process.exit(1);
  }
}

console.log('=== MCP Cross-SDK Compliance Testing ===\n');
console.log(`Testing SDKs: ${availableSDKs.join(', ')}`);
if (specificScenario) {
  console.log(`Testing specific scenario: ${specificScenario}`);
}
console.log('');

// Run the tests
const testArgs = ['--no-cache', '--test', 'tests/cross-sdk.test.ts'];

// Add test name pattern if specific scenario requested
if (specificScenario) {
  testArgs.push('--test-name-pattern', `Scenario ${specificScenario}:`);
}

// Set environment variable to pass available SDKs to test
process.env.AVAILABLE_SDKS = availableSDKs.join(',');

const proc = spawn('tsx', testArgs, {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: {
    ...process.env,
    AVAILABLE_SDKS: availableSDKs.join(','),
  },
});

proc.on('exit', (code) => {
  process.exit(code || 0);
});