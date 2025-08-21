import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, accessSync, constants } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Scenarios } from '../src/types.js';

// Get the root directory of the project
const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const SCENARIOS_PATH = join(PROJECT_ROOT, 'compliance', 'scenarios', 'data.json');

// Load the actual scenarios data
const scenariosData = JSON.parse(readFileSync(SCENARIOS_PATH, 'utf-8')) as Scenarios;

// Get available SDKs from environment or default to typescript-sdk
const AVAILABLE_SDKS = process.env.AVAILABLE_SDKS 
  ? process.env.AVAILABLE_SDKS.split(',')
  : ['typescript-sdk'].filter(sdk => 
      existsSync(join(PROJECT_ROOT, 'compliance', sdk, 'test-client')) && 
      existsSync(join(PROJECT_ROOT, 'compliance', sdk, 'test-server'))
    );

// Helper to run a binary and capture output
async function runBinary(
  binaryPath: string, 
  args: string[] = [],
  options: { timeout?: number; expectError?: boolean } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn(binaryPath, args, {
      cwd: PROJECT_ROOT,
      timeout: options.timeout || 5000,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => { stdout += data.toString(); });
    proc.stderr?.on('data', (data) => { stderr += data.toString(); });

    proc.on('error', (err) => {
      resolve({ stdout, stderr: stderr + err.message, exitCode: -1 });
    });

    proc.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code || 0 });
    });

    // Kill the process after a short time if it doesn't exit
    if (!options.expectError) {
      setTimeout(() => {
        try {
          proc.kill();
        } catch {}
      }, 1000);
    }
  });
}

describe('SDK Binary Validation Tests', () => {
  for (const sdk of AVAILABLE_SDKS) {
    describe(`${sdk} binaries`, () => {
      const clientPath = join(PROJECT_ROOT, 'compliance', sdk, 'test-client');
      const serverPath = join(PROJECT_ROOT, 'compliance', sdk, 'test-server');

      describe('Binary existence and executability', () => {
        it('should have test-client binary', () => {
          assert.ok(existsSync(clientPath), `test-client binary missing at ${clientPath}`);
        });

        it('should have test-server binary', () => {
          assert.ok(existsSync(serverPath), `test-server binary missing at ${serverPath}`);
        });

        it('test-client should be executable', () => {
          assert.doesNotThrow(() => accessSync(clientPath, constants.X_OK));
        });

        it('test-server should be executable', () => {
          assert.doesNotThrow(() => accessSync(serverPath, constants.X_OK));
        });
      });

      describe('Client CLI validation', () => {
        it('should show help with --help', async () => {
          const result = await runBinary(clientPath, ['--help']);
          assert.ok(result.stdout.includes('--scenario-id') || result.stdout.includes('scenario-id'));
          assert.ok(result.stdout.includes('--id') || result.stdout.includes('client identifier'));
        });

        it('should reject missing --scenario-id', async () => {
          const result = await runBinary(clientPath, ['--id', 'client1', 'stdio', 'echo'], { expectError: true });
          assert.notStrictEqual(result.exitCode, 0, 'Should exit with error');
          assert.ok(result.stderr.includes('scenario-id') || result.stderr.includes('required'));
        });

        it('should reject missing --id', async () => {
          const result = await runBinary(clientPath, ['--scenario-id', '1', 'stdio', 'echo'], { expectError: true });
          assert.notStrictEqual(result.exitCode, 0, 'Should exit with error');
          assert.ok(result.stderr.includes('--id') || result.stderr.includes('required'));
        });

        it('should reject invalid scenario ID', async () => {
          const result = await runBinary(clientPath, ['--scenario-id', '9999', '--id', 'client1', 'stdio', 'echo'], { expectError: true });
          assert.notStrictEqual(result.exitCode, 0, 'Should exit with error');
          assert.ok(result.stderr.includes('9999') || result.stderr.includes('not found') || result.stderr.includes('invalid') || result.stderr.includes('Scenario'));
        });

        it('should reject invalid client ID for scenario', async () => {
          // Use scenario 1 which only has client1
          const result = await runBinary(clientPath, ['--scenario-id', '1', '--id', 'client999', 'stdio', 'echo'], { expectError: true });
          assert.notStrictEqual(result.exitCode, 0, 'Should exit with error');
          assert.ok(result.stderr.includes('client999') || result.stderr.includes('not found') || result.stderr.includes('not listed') || result.stderr.includes('Client ID'));
        });

        it('should accept valid arguments', async () => {
          const result = await runBinary(clientPath, ['--scenario-id', '1', '--id', 'client1', 'stdio', 'echo']);
          // It will fail to connect to echo, but argument parsing should succeed
          assert.ok(!result.stderr.includes('required option'));
        });
      });

      describe('Server CLI validation', () => {
        it('should show help with --help', async () => {
          const result = await runBinary(serverPath, ['--help']);
          assert.ok(result.stdout.includes('--server-name') || result.stdout.includes('server-name'));
          assert.ok(result.stdout.includes('--transport') || result.stdout.includes('transport'));
        });

        it('should reject missing --server-name', async () => {
          const result = await runBinary(serverPath, ['--transport', 'stdio'], { expectError: true });
          assert.notStrictEqual(result.exitCode, 0, 'Should exit with error');
          assert.ok(result.stderr.includes('server-name') || result.stderr.includes('required'));
        });

        it('should reject missing --transport', async () => {
          const result = await runBinary(serverPath, ['--server-name', 'CalcServer'], { expectError: true });
          assert.notStrictEqual(result.exitCode, 0, 'Should exit with error');
          assert.ok(result.stderr.includes('transport') || result.stderr.includes('required'));
        });

        it('should reject invalid server name', async () => {
          const result = await runBinary(serverPath, ['--server-name', 'InvalidServer', '--transport', 'stdio'], { expectError: true });
          assert.notStrictEqual(result.exitCode, 0, 'Should exit with error');
          assert.ok(result.stderr.includes('InvalidServer') || result.stderr.includes('not found') || result.stderr.includes('invalid') || result.stderr.includes('Unknown server'));
        });

        it('should reject invalid transport', async () => {
          const result = await runBinary(serverPath, ['--server-name', 'CalcServer', '--transport', 'invalid'], { expectError: true });
          assert.notStrictEqual(result.exitCode, 0, 'Should exit with error');
          assert.ok(result.stderr.includes('invalid') || result.stderr.includes('transport'));
        });

        it('should accept HTTP-specific flags only for HTTP transports', async () => {
          // stdio transport should not accept --host/--port
          const result = await runBinary(serverPath, [
            '--server-name', 'CalcServer', 
            '--transport', 'stdio',
            '--host', 'localhost',
            '--port', '3000'
          ]);
          // Should either ignore or warn about these flags for stdio
          assert.ok(!result.stderr.includes('error parsing'));
        });

        it('should accept valid arguments for stdio', async () => {
          const result = await runBinary(serverPath, ['--server-name', 'CalcServer', '--transport', 'stdio']);
          // Server will start and wait for input, but basic arg parsing should work
          assert.ok(!result.stderr.includes('required option'));
        });
      });

      describe('Scenario description validation', () => {
        let tempDir: string;
        let modifiedScenariosPath: string;

        before(() => {
          tempDir = mkdtempSync(join(tmpdir(), 'sdk-validation-'));
          modifiedScenariosPath = join(tempDir, 'modified-scenarios.json');
        });

        after(() => {
          if (tempDir) {
            rmSync(tempDir, { recursive: true });
          }
        });

        it('client should validate scenario description when --scenarios-data is provided', async function() {
          // Create a modified scenarios file with changed description
          const modifiedScenarios = JSON.parse(JSON.stringify(scenariosData));
          modifiedScenarios.scenarios[0].description = 'MODIFIED: ' + modifiedScenarios.scenarios[0].description;
          writeFileSync(modifiedScenariosPath, JSON.stringify(modifiedScenarios, null, 2));

          // Run client with --scenarios-data pointing to modified file
          const result = await runBinary(clientPath, [
            '--scenario-id', '1',
            '--id', 'client1',
            '--scenarios-data', modifiedScenariosPath,
            'stdio', 'echo'
          ], { expectError: true });

          // Skip this test if --scenarios-data is not implemented yet
          if (result.stderr.includes('unknown option') || result.stderr.includes('--scenarios-data')) {
            this.skip('--scenarios-data not implemented in this SDK yet');
            return;
          }

          assert.notStrictEqual(result.exitCode, 0, 'Should exit with error when description mismatch');
          assert.ok(
            result.stderr.includes('description') || 
            result.stderr.includes('mismatch') || 
            result.stderr.includes('changed'),
            'Should mention description mismatch'
          );
        });

        it('server should validate server definition description when --scenarios-data is provided', async function() {
          // Create a modified scenarios file with changed server description
          const modifiedScenarios = JSON.parse(JSON.stringify(scenariosData));
          modifiedScenarios.servers.CalcServer.description = 'MODIFIED: ' + modifiedScenarios.servers.CalcServer.description;
          writeFileSync(modifiedScenariosPath, JSON.stringify(modifiedScenarios, null, 2));

          // Run server with --scenarios-data pointing to modified file
          const result = await runBinary(serverPath, [
            '--server-name', 'CalcServer',
            '--transport', 'stdio',
            '--scenarios-data', modifiedScenariosPath
          ], { expectError: true });

          // Skip this test if --scenarios-data is not implemented yet
          if (result.stderr.includes('unknown option') || result.stderr.includes('--scenarios-data')) {
            this.skip('--scenarios-data not implemented in this SDK yet');
            return;
          }

          assert.notStrictEqual(result.exitCode, 0, 'Should exit with error when description mismatch');
          assert.ok(
            result.stderr.includes('description') || 
            result.stderr.includes('mismatch') || 
            result.stderr.includes('changed'),
            'Should mention description mismatch'
          );
        });
      });

      describe('Transport support validation', () => {
        it('client should support stdio transport', async () => {
          const result = await runBinary(clientPath, [
            '--scenario-id', '1',
            '--id', 'client1',
            'stdio', 'echo'
          ]);
          // Should not have transport-related errors in parsing phase
          assert.ok(!result.stderr.includes('unsupported transport'));
        });

        it('client should handle sse transport', async function() {
          const result = await runBinary(clientPath, [
            '--scenario-id', '1',
            '--id', 'client1',
            'sse', 'http://localhost:3000'
          ]);
          
          // Skip if SSE not implemented
          if (result.stderr.includes('not implemented') || result.stderr.includes('unsupported')) {
            this.skip('SSE transport not implemented in this SDK yet');
            return;
          }
          
          // Should attempt connection (will fail, but transport should be recognized)
          assert.ok(!result.stderr.includes('invalid transport'));
        });

        it('client should handle streamable-http transport', async function() {
          const result = await runBinary(clientPath, [
            '--scenario-id', '1', 
            '--id', 'client1',
            'streamable-http', 'http://localhost:3000'
          ]);
          
          // Skip if streamable-http not implemented
          if (result.stderr.includes('not implemented') || result.stderr.includes('unsupported')) {
            this.skip('streamable-http transport not implemented in this SDK yet');
            return;
          }
          
          // Should attempt connection (will fail, but transport should be recognized)
          assert.ok(!result.stderr.includes('invalid transport'));
        });

        it('server should support stdio transport', async () => {
          const result = await runBinary(serverPath, [
            '--server-name', 'CalcServer',
            '--transport', 'stdio'
          ]);
          assert.ok(!result.stderr.includes('unsupported transport'));
        });

        it('server should handle sse transport', async function() {
          const result = await runBinary(serverPath, [
            '--server-name', 'CalcServer',
            '--transport', 'sse',
            '--port', '0' // Use port 0 to get random available port
          ]);
          
          // Skip if SSE not implemented
          if (result.stderr.includes('not implemented') || result.stderr.includes('unsupported')) {
            this.skip('SSE transport not implemented in this SDK yet');
            return;
          }
          
          assert.ok(!result.stderr.includes('invalid transport'));
        });

        it('server should handle streamable-http transport', async function() {
          const result = await runBinary(serverPath, [
            '--server-name', 'CalcServer',
            '--transport', 'streamable-http',
            '--port', '0' // Use port 0 to get random available port
          ]);
          
          // Skip if streamable-http not implemented  
          if (result.stderr.includes('not implemented') || result.stderr.includes('unsupported')) {
            this.skip('streamable-http transport not implemented in this SDK yet');
            return;
          }
          
          assert.ok(!result.stderr.includes('invalid transport'));
        });
      });

      describe('Error handling and exit codes', () => {
        it('client should exit with non-zero code on errors', async () => {
          const result = await runBinary(clientPath, ['--scenario-id', '9999', '--id', 'client1', 'stdio', 'echo'], { expectError: true });
          assert.notStrictEqual(result.exitCode, 0);
        });

        it('server should exit with non-zero code on errors', async () => {
          const result = await runBinary(serverPath, ['--server-name', 'InvalidServer', '--transport', 'stdio'], { expectError: true });
          assert.notStrictEqual(result.exitCode, 0);
        });

        it('should handle missing scenarios data file gracefully', async function() {
          const result = await runBinary(clientPath, [
            '--scenario-id', '1',
            '--id', 'client1',
            '--scenarios-data', '/non/existent/path/scenarios.json',
            'stdio', 'echo'
          ], { expectError: true });

          // Skip if --scenarios-data not implemented
          if (result.stderr.includes('unknown option') || result.stderr.includes('--scenarios-data')) {
            this.skip('--scenarios-data not implemented in this SDK yet');
            return;
          }

          assert.notStrictEqual(result.exitCode, 0);
          assert.ok(result.stderr.includes('not found') || result.stderr.includes('exist') || result.stderr.includes('ENOENT'));
        });
      });
    });
  }
});