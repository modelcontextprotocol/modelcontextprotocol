# Model Context Protocol TypeScript SDK Research

## Overview

The Model Context Protocol (MCP) TypeScript SDK provides a comprehensive framework for building both MCP clients and servers. It supports multiple transport mechanisms and offers a high-level API for implementing MCP features.

## Key Components

### 1. Server Implementation

#### High-Level API: `McpServer`
- Located in `src/server/mcp.ts`
- Provides a simplified interface for creating MCP servers
- Key features:
  - Tool registration with input/output schema validation using Zod
  - Resource registration (static and dynamic with URI templates)
  - Prompt registration with argument schemas
  - Automatic capability negotiation
  - Built-in completion support

Example usage:
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "calc-server",
  version: "1.0.0"
});

// Register a tool
server.registerTool("add", {
  title: "Addition Tool",
  description: "Add two numbers",
  inputSchema: { a: z.number(), b: z.number() }
}, async ({ a, b }) => ({
  content: [{ type: "text", text: String(a + b) }]
}));

// Connect to transport
const transport = new StdioServerTransport();
await server.connect(transport);
```

#### Low-Level API: `Server`
- Located in `src/server/index.ts`
- Provides direct control over request handlers
- Used when you need custom protocol handling

### 2. Client Implementation

#### High-Level API: `Client`
- Located in `src/client/index.ts`
- Provides methods for all MCP operations:
  - `listTools()`, `callTool()`
  - `listResources()`, `readResource()`
  - `listPrompts()`, `getPrompt()`
  - `complete()` for argument completion
  - `setLoggingLevel()`
- Automatic capability checking
- Built-in initialization flow

Example usage:
```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({
  name: "test-client",
  version: "1.0.0"
});

const transport = new StdioClientTransport({
  command: "node",
  args: ["server.js"]
});

await client.connect(transport);

// Use the client
const tools = await client.listTools();
const result = await client.callTool({
  name: "add",
  arguments: { a: 10, b: 20 }
});
```

### 3. Transport Mechanisms

#### stdio Transport
- Server: `StdioServerTransport` - reads from stdin, writes to stdout
- Client: `StdioClientTransport` - spawns a subprocess
- Best for: Local command-line tools, direct integrations
- Features: Simple, synchronous communication

#### SSE Transport (Deprecated)
- Server: `SSEServerTransport`
- Client: `SSEClientTransport`
- Being replaced by Streamable HTTP

#### Streamable HTTP Transport
- Server: `StreamableHTTPServerTransport`
- Client: `StreamableHTTPClientTransport`
- Features:
  - Stateful (with session management) or stateless modes
  - Supports both JSON responses and SSE streaming
  - DNS rebinding protection
  - Resumability support via event stores
  - Handles batch requests

Configuration example:
```typescript
// Stateful mode
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
  onsessioninitialized: (sessionId) => {
    // Store session
  },
  enableDnsRebindingProtection: true,
  allowedHosts: ['127.0.0.1']
});

// Stateless mode
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined
});
```

## MCP Features Implementation

### 1. Tools
- Define functions that LLMs can execute
- Support input/output schemas with Zod validation
- Can return text content or resource links
- Error handling with `isError` flag

### 2. Resources
- Static resources: Fixed URI endpoints
- Dynamic resources: URI templates with parameters
- Support for listing, reading, and subscribing
- Resource templates with completion support

### 3. Prompts
- Reusable prompt templates
- Argument schemas with validation
- Context-aware argument completion
- Return structured messages for LLM consumption

### 4. Sampling
- Servers can request LLM completions from clients
- Used for recursive/agentic behaviors
- Requires client capability support

### 5. Completions
- Argument completion for prompts and resources
- Context-aware suggestions
- Implemented via `completable()` wrapper for Zod schemas

## Important Implementation Details

### Schema Validation
- Uses Zod for runtime type validation
- Automatic conversion to JSON Schema for protocol messages
- Support for complex nested schemas

### Error Handling
- `McpError` class with standard error codes
- Proper error propagation through transports
- Tool errors can be returned as part of the result

### Capability Negotiation
- Automatic during initialization
- Server advertises supported features
- Client checks capabilities before making requests

### Session Management (Streamable HTTP)
- Session IDs for stateful connections
- Request correlation across multiple HTTP requests
- Support for concurrent clients

## Testing Considerations

### For Compliance Testing
1. **Transport Abstraction**: All transports implement the same `Transport` interface, making it easy to swap between them
2. **Message Validation**: Built-in JSON-RPC message validation
3. **Capability Testing**: Can test different capability combinations
4. **Error Scenarios**: Proper error codes and messages for invalid requests

### Key Files for Reference
- Types: `src/types.ts` - All protocol types and schemas
- Server: `src/server/mcp.ts` - High-level server API
- Client: `src/client/index.ts` - Client implementation
- Transports: `src/server/stdio.ts`, `src/server/streamableHttp.ts`
- Examples: README.md contains multiple usage examples

## Recommendations for Test Implementation

1. **Use High-Level APIs**: The `McpServer` and `Client` classes provide the easiest way to implement test scenarios
2. **Leverage Zod**: Use Zod schemas for all input/output validation to ensure type safety
3. **Transport Selection**: Start with stdio for simplicity, then add HTTP transports
4. **Error Testing**: The SDK properly propagates errors, making it easy to test error scenarios
5. **Capability Matrix**: Test different combinations of server/client capabilities