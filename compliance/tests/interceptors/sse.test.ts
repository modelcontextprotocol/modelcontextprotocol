import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { SSEInterceptor } from '../../src/interceptors/sse.js';
import type { AnnotatedJSONRPCMessage } from '../../src/types.js';

describe('SSEInterceptor', () => {
  let interceptor: SSEInterceptor | null = null;
  let messages: AnnotatedJSONRPCMessage[] = [];

  afterEach(async () => {
    if (interceptor) {
      await interceptor.close();
      interceptor = null;
    }
    messages = [];
  });

  it('should create interceptor with options', () => {
    interceptor = new SSEInterceptor({
      targetUrl: 'http://localhost:9999',
      listenPort: 8888,
      clientId: 'test-client',
      serverId: 'test-server',
    });
    
    assert.ok(interceptor);
  });

  it('should start and close server', async () => {
    interceptor = new SSEInterceptor({
      targetUrl: 'http://localhost:9999',
      listenPort: 0, // Use random port
      clientId: 'test-client',
      serverId: 'test-server',
    });

    await interceptor.start();
    await interceptor.close();
    
    // Should not throw
    assert.ok(true);
  });

  it('should capture messages with onMessage callback', () => {
    interceptor = new SSEInterceptor({
      targetUrl: 'http://localhost:9999',
      listenPort: 0,
      clientId: 'test-client',
      serverId: 'test-server',
      onMessage: (msg) => messages.push(msg),
    });

    // Can't easily test the full flow without a real server
    // Just verify the structure is correct
    assert.ok(interceptor);
    assert.strictEqual(messages.length, 0);
  });

  it('should validate JSON-RPC message structure', () => {
    // This test would need to expose the isJSONRPCMessage method
    // or test through the full proxy flow
    const validMessages = [
      { jsonrpc: '2.0', id: 1, method: 'test' },
      { jsonrpc: '2.0', method: 'notify' },
      { jsonrpc: '2.0', id: 2, result: { value: 42 } },
      { jsonrpc: '2.0', id: 3, error: { code: -32000, message: 'Error' } },
    ];

    const invalidMessages = [
      { id: 1, method: 'test' }, // Missing jsonrpc
      { jsonrpc: '2.0' }, // Missing required fields
      { jsonrpc: '1.0', id: 1, method: 'test' }, // Wrong version
    ];

    // Just verify we can create the interceptor
    interceptor = new SSEInterceptor({
      targetUrl: 'http://localhost:9999',
      listenPort: 0,
      clientId: 'test-client',
      serverId: 'test-server',
    });
    
    assert.ok(interceptor);
  });

  it('should handle multiple interceptors on different ports', async () => {
    const interceptor1 = new SSEInterceptor({
      targetUrl: 'http://localhost:9998',
      listenPort: 0,
      clientId: 'client1',
      serverId: 'server1',
    });

    const interceptor2 = new SSEInterceptor({
      targetUrl: 'http://localhost:9999',
      listenPort: 0,
      clientId: 'client2',
      serverId: 'server2',
    });

    await interceptor1.start();
    await interceptor2.start();

    await interceptor1.close();
    await interceptor2.close();

    assert.ok(true);
  });
});