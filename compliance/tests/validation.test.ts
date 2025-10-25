import { describe, it } from 'node:test';
import assert from 'node:assert';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  validateScenarios,
  validateAnnotatedLog,
  normalizeLogForComparison,
  compareNormalizedLogs,
  parseJSONLLog,
} from '../src/validation.js';
import type { Scenarios, AnnotatedJSONRPCMessage } from '../src/types.js';

describe('validateScenarios', () => {
  it('should validate a valid scenarios object', () => {
    const validScenarios: Scenarios = {
      servers: {
        CalcServer: {
          description: 'A simple calculator server',
          tools: {
            add: { description: 'Adds two numbers' },
            multiply: { description: 'Multiplies two numbers' },
          },
          resources: {
            'resource://special-number': { description: 'A special number' },
          },
          resourceTemplates: {},
          prompts: {
            'example-maths': { description: 'Example math prompt' },
          },
          promptTemplates: {},
        },
      },
      scenarios: [
        {
          id: 1,
          description: 'client1 connects to CalcServer and calls add(a=10, b=20)',
          client_ids: ['client1'],
          server_name: 'CalcServer',
        },
      ],
    };

    assert.doesNotThrow(() => validateScenarios(validScenarios));
  });

  it('should reject duplicate scenario IDs', () => {
    const invalidScenarios = {
      servers: { TestServer: { description: 'Test', tools: {}, resources: {}, resourceTemplates: {}, prompts: {}, promptTemplates: {} } },
      scenarios: [
        { id: 1, description: 'Test 1', client_ids: ['client1'], server_name: 'TestServer' },
        { id: 1, description: 'Test 2', client_ids: ['client2'], server_name: 'TestServer' },
      ],
    };

    assert.throws(() => validateScenarios(invalidScenarios), /Duplicate scenario ID: 1/);
  });

  it('should reject scenarios referencing non-existent servers', () => {
    const invalidScenarios = {
      servers: {},
      scenarios: [
        { id: 1, description: 'Test', client_ids: ['client1'], server_name: 'NonExistent' },
      ],
    };

    assert.throws(
      () => validateScenarios(invalidScenarios),
      /Scenario 1 references non-existent server: NonExistent/
    );
  });

  it('should require at least one client ID', () => {
    const invalidScenarios = {
      servers: { TestServer: { description: 'Test', tools: {}, resources: {}, resourceTemplates: {}, prompts: {}, promptTemplates: {} } },
      scenarios: [
        { id: 1, description: 'Test', client_ids: [], server_name: 'TestServer' },
      ],
    };

    assert.throws(() => validateScenarios(invalidScenarios));
  });
});

describe('validateAnnotatedLog', () => {
  it('should validate a valid annotated log', () => {
    const validLog: AnnotatedJSONRPCMessage[] = [
      {
        from: 'client1',
        to: 'CalcServer',
        message: {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: '1.0' },
        },
      },
    ];

    assert.doesNotThrow(() => validateAnnotatedLog(validLog));
  });

  it('should validate HTTP metadata when present', () => {
    const validLog: AnnotatedJSONRPCMessage[] = [
      {
        from: 'client1',
        to: 'CalcServer',
        message: {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
        },
      metadata: {
        streamable_http_metadata: {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'mcp-session-id': 'test-session',
            },
      },
        },
      },
    ];

    assert.doesNotThrow(() => validateAnnotatedLog(validLog));
  });

  it('should reject invalid JSON-RPC messages', () => {
    const invalidLog = [
      {
        from: 'client1',
        to: 'server',
        message: {
          // Missing jsonrpc field
          id: 1,
          method: 'test',
        },
      },
    ];

    assert.throws(() => validateAnnotatedLog(invalidLog));
  });

});

describe('log comparison utilities', () => {

  it('should filter non-deterministic HTTP headers', () => {
    const log: AnnotatedJSONRPCMessage[] = [
      {
        from: 'client1',
        to: 'server',
        message: { jsonrpc: '2.0', id: 1, method: 'test' },
      metadata: {
        streamable_http_metadata: {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'date': 'Fri, 15 Mar 2024 10:30:00 GMT',
              'x-request-id': 'random-id',
              'mcp-session-id': 'session-123',
            },
      },
        },
      },
    ];

    const normalized = normalizeLogForComparison(log);
    const headers = normalized[0].metadata?.streamable_http_metadata!.headers;
    
    assert.strictEqual(headers['content-type'], 'application/json');
    assert.strictEqual(headers['mcp-session-id'], 'session-123');
    assert.strictEqual(headers['date'], undefined);
    assert.strictEqual(headers['x-request-id'], undefined);
  });

  it('should correctly compare normalized logs', () => {
    const log1: AnnotatedJSONRPCMessage[] = [
      {
        message: { jsonrpc: '2.0', id: 1, method: 'test', params: { a: 1 } },
        from: 'client1',
      to: 'server',
      },
    ];

    const log2: AnnotatedJSONRPCMessage[] = [
      {
        message: { jsonrpc: '2.0', id: 1, method: 'test', params: { a: 1 } },
        from: 'client1',
      to: 'server',
      },
    ];

    const normalized1 = normalizeLogForComparison(log1);
    const normalized2 = normalizeLogForComparison(log2);

    assert.strictEqual(compareNormalizedLogs(normalized1, normalized2), true);
  });

  it('should detect differences in normalized logs', () => {
    const log1: AnnotatedJSONRPCMessage[] = [
      {
        message: { jsonrpc: '2.0', id: 1, method: 'test', params: { a: 1 } },
        from: 'client1',
      to: 'server',
      },
    ];

    const log2: AnnotatedJSONRPCMessage[] = [
      {
        message: { jsonrpc: '2.0', id: 1, method: 'test', params: { a: 2 } }, // Different param
        from: 'client1',
      to: 'server',
      },
    ];

    const normalized1 = normalizeLogForComparison(log1);
    const normalized2 = normalizeLogForComparison(log2);

    assert.strictEqual(compareNormalizedLogs(normalized1, normalized2), false);
  });
});

describe('parseJSONLLog', () => {
  let tempDir: string;

  it('should parse JSONL log without comments', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'test-'));
    const logPath = join(tempDir, 'test.jsonl');
    
    const messages: AnnotatedJSONRPCMessage[] = [
      {
        from: 'client1',
        to: 'server',
        message: { jsonrpc: '2.0', id: 1, method: 'test' },
      },
    ];
    
    writeFileSync(logPath, messages.map(m => JSON.stringify(m)).join('\n'));
    
    const result = parseJSONLLog(logPath);
    assert.strictEqual(result.description, undefined);
    assert.strictEqual(result.messages.length, 1);
    assert.deepStrictEqual(result.messages[0], messages[0]);
    
    rmSync(tempDir, { recursive: true });
  });

  it('should parse JSONL log with single-line comment', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'test-'));
    const logPath = join(tempDir, 'test.jsonl');
    
    const content = `// This is a test scenario
${JSON.stringify({
      from: 'client1',
        to: 'server',
        message: { jsonrpc: '2.0', id: 1, method: 'test' },
    })}`;
    
    writeFileSync(logPath, content);
    
    const result = parseJSONLLog(logPath);
    assert.strictEqual(result.description, 'This is a test scenario');
    assert.strictEqual(result.messages.length, 1);
    
    rmSync(tempDir, { recursive: true });
  });

  it('should parse JSONL log with multi-line comment', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'test-'));
    const logPath = join(tempDir, 'test.jsonl');
    
    const content = `// This is a multi-line
// test scenario description
// with three lines
${JSON.stringify({
      from: 'client1',
        to: 'server',
        message: { jsonrpc: '2.0', id: 1, method: 'test' },
    })}`;
    
    writeFileSync(logPath, content);
    
    const result = parseJSONLLog(logPath);
    assert.strictEqual(result.description, 'This is a multi-line\ntest scenario description\nwith three lines');
    assert.strictEqual(result.messages.length, 1);
    
    rmSync(tempDir, { recursive: true });
  });

  it('should handle empty lines gracefully', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'test-'));
    const logPath = join(tempDir, 'test.jsonl');
    
    const content = `// Test scenario

${JSON.stringify({
      from: 'client1',
        to: 'server',
        message: { jsonrpc: '2.0', id: 1, method: 'test' },
    })}

`;
    
    writeFileSync(logPath, content);
    
    const result = parseJSONLLog(logPath);
    assert.strictEqual(result.description, 'Test scenario');
    assert.strictEqual(result.messages.length, 1);
    
    rmSync(tempDir, { recursive: true });
  });

  it('should throw on invalid JSON line', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'test-'));
    const logPath = join(tempDir, 'test.jsonl');
    
    writeFileSync(logPath, '// Comment\ninvalid json');
    
    assert.throws(() => parseJSONLLog(logPath), /Failed to parse line/);
    
    rmSync(tempDir, { recursive: true });
  });

  it('should throw on invalid message format', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'test-'));
    const logPath = join(tempDir, 'test.jsonl');
    
    writeFileSync(logPath, JSON.stringify({ invalid: 'message' }));
    
    assert.throws(() => parseJSONLLog(logPath), /Invalid message/);
    
    rmSync(tempDir, { recursive: true });
  });
});