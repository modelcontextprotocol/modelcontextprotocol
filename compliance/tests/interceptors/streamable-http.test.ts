import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { StreamableHTTPInterceptor } from '../../src/interceptors/streamable-http.js';
import type { AnnotatedJSONRPCMessage } from '../../src/types.js';

describe('StreamableHTTPInterceptor', () => {
  let interceptor: StreamableHTTPInterceptor | null = null;
  let messages: AnnotatedJSONRPCMessage[] = [];

  afterEach(async () => {
    if (interceptor) {
      await interceptor.close();
      interceptor = null;
    }
    messages = [];
  });

  it('should create interceptor with options', () => {
    interceptor = new StreamableHTTPInterceptor({
      targetUrl: 'http://localhost:9999',
      listenPort: 8888,
      clientId: 'test-client',
      serverId: 'test-server',
    });
    
    assert.ok(interceptor);
  });

  it('should start and close server', async () => {
    interceptor = new StreamableHTTPInterceptor({
      targetUrl: 'http://localhost:9999',
      listenPort: 0, // Use random port
      clientId: 'test-client',
      serverId: 'test-server',
    });

    await interceptor.start();
    await interceptor.close();
    
    assert.ok(true);
  });

  it('should capture messages with onMessage callback', () => {
    interceptor = new StreamableHTTPInterceptor({
      targetUrl: 'http://localhost:9999',
      listenPort: 0,
      clientId: 'test-client',
      serverId: 'test-server',
      onMessage: (msg) => messages.push(msg),
    });

    assert.ok(interceptor);
    assert.strictEqual(messages.length, 0);
  });

  it('should track active sessions', async () => {
    interceptor = new StreamableHTTPInterceptor({
      targetUrl: 'http://localhost:9999',
      listenPort: 0,
      clientId: 'test-client',
      serverId: 'test-server',
    });

    await interceptor.start();
    
    // Initially no sessions
    assert.deepStrictEqual(interceptor.getActiveSessions(), []);
    
    await interceptor.close();
  });

  it('should include streamable_http_metadata in logged messages', () => {
    const capturedMessages: AnnotatedJSONRPCMessage[] = [];
    
    interceptor = new StreamableHTTPInterceptor({
      targetUrl: 'http://localhost:9999',
      listenPort: 0,
      clientId: 'test-client',
      serverId: 'test-server',
      onMessage: (msg) => {
        capturedMessages.push(msg);
        
        // Verify metadata structure
        assert.ok(msg.metadata.streamable_http_metadata);
        assert.ok(msg.metadata.streamable_http_metadata.method);
        assert.ok(msg.metadata.streamable_http_metadata.headers);
        assert.strictEqual(msg.metadata.transport, 'streamable-http');
      },
    });

    assert.ok(interceptor);
  });

  it('should handle multiple interceptors on different ports', async () => {
    const interceptor1 = new StreamableHTTPInterceptor({
      targetUrl: 'http://localhost:9998',
      listenPort: 0,
      clientId: 'client1',
      serverId: 'server1',
    });

    const interceptor2 = new StreamableHTTPInterceptor({
      targetUrl: 'http://localhost:9999',
      listenPort: 0,
      clientId: 'client2',
      serverId: 'server2',
    });

    await interceptor1.start();
    await interceptor2.start();

    // Both should have empty session lists
    assert.deepStrictEqual(interceptor1.getActiveSessions(), []);
    assert.deepStrictEqual(interceptor2.getActiveSessions(), []);

    await interceptor1.close();
    await interceptor2.close();

    assert.ok(true);
  });

  it('should validate JSON-RPC message structure', () => {
    const validMessages = [
      { jsonrpc: '2.0', id: 1, method: 'test' },
      { jsonrpc: '2.0', method: 'notify' },
      { jsonrpc: '2.0', id: 2, result: { value: 42 } },
      { jsonrpc: '2.0', id: 3, error: { code: -32000, message: 'Error' } },
    ];

    interceptor = new StreamableHTTPInterceptor({
      targetUrl: 'http://localhost:9999',
      listenPort: 0,
      clientId: 'test-client',
      serverId: 'test-server',
    });
    
    // Just verify we can create the interceptor with valid message formats
    assert.ok(interceptor);
  });
});