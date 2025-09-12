import { describe, it } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

describe('MITM CLI', () => {
  const mitmPath = join(process.cwd(), 'src/cli/mitm.ts');
  
  it('should show help when called without arguments', async () => {
    const result = await runCommand(['tsx', mitmPath]);
    assert.strictEqual(result.code, 0);
    assert.ok(result.stderr.includes('Usage:'));
  });

  it('should show help with --help flag', async () => {
    const result = await runCommand(['tsx', mitmPath, '--help']);
    assert.strictEqual(result.code, 0);
    assert.ok(result.stderr.includes('Usage:'));
  });

  it('should reject invalid transport', async () => {
    const result = await runCommand(['tsx', mitmPath, 'invalid']);
    assert.strictEqual(result.code, 1);
    assert.ok(result.stderr.includes("Invalid transport 'invalid'"));
  });

  it('should require -- separator', async () => {
    const result = await runCommand(['tsx', mitmPath, 'stdio']);
    assert.strictEqual(result.code, 1);
    assert.ok(result.stderr.includes('Missing -- separator'));
  });

  it('should require command after --', async () => {
    const result = await runCommand(['tsx', mitmPath, 'stdio', '--']);
    assert.strictEqual(result.code, 1);
    assert.ok(result.stderr.includes('Missing command or URL'));
  });

  it('should log to file with --log option', async () => {
    // Just verify the option is accepted, actual logging tested in interceptor tests
    const result = await runCommand([
      'tsx', mitmPath,
      'stdio',
      '--log', 'test.jsonl',
      '--'
    ]);
    
    // Should fail because no command provided after --
    assert.strictEqual(result.code, 1);
    assert.ok(result.stderr.includes('Missing command'));
  });

  it('should require port for HTTP transports', async () => {
    const result = await runCommand([
      'tsx', mitmPath, 
      'sse',
      '--',
      'http://localhost:3000'
    ]);
    
    assert.strictEqual(result.code, 1);
    assert.ok(result.stderr.includes('--port is required'));
  });

  it('should accept custom client and server IDs', async () => {
    // Just verify the options are accepted
    const result = await runCommand([
      'tsx', mitmPath,
      'stdio',
      '--client-id', 'my-client',
      '--server-id', 'my-server',
      '--'
    ]);

    // Should fail because no command provided after --
    assert.strictEqual(result.code, 1);
    assert.ok(result.stderr.includes('Missing command'));
  });

  it('should accept scenario ID', async () => {
    const result = await runCommand([
      'tsx', mitmPath,
      'stdio',
      '--scenario-id', '1',
      '--'
    ]);
    
    // Should fail because no command provided, but scenario-id should be accepted
    assert.strictEqual(result.code, 1);
    assert.ok(result.stderr.includes('Missing command'));
  });

  it('should reject invalid scenario ID', async () => {
    const result = await runCommand([
      'tsx', mitmPath,
      'stdio',
      '--scenario-id', 'invalid',
      '--',
      'echo', 'test'
    ]);
    
    assert.strictEqual(result.code, 1);
    assert.ok(result.stderr.includes('--scenario-id must be a number'));
  });
});

// Helper function to run a command and capture output
function runCommand(args: string[], options?: { timeout?: number }): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve) => {
    const proc = spawn(args[0], args.slice(1), {
      timeout: options?.timeout || 5000,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    proc.on('error', (error) => {
      console.error('Process error:', error);
      resolve({ code: 1, stdout, stderr });
    });
  });
}