# SEP-2164: Standardize Resource Not Found Error Code

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-01-28
- **Author(s)**: Peter Alexander (@pja-ant)
- **Sponsor**: None (seeking sponsor)
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2164

## Abstract

The current MCP specification [recommends `-32002`](https://modelcontextprotocol.io/specification/draft/server/resources#error-handling) as the error code for resource not found. However, `-32002` falls within the JSON-RPC "server error" range (`-32000` to `-32099`) which is reserved for implementation-defined errors, not protocol-level semantics. Additionally, SDK implementations are inconsistent — only 4 of 6 official SDKs use `-32002`, while the TypeScript SDK uses `-32602` and the Python SDK uses `0`.

This SEP standardizes on `-32602` (Invalid Params), the correct JSON-RPC error code for this case, and aligns the specification with the JSON-RPC standard.

## Motivation

Current SDK implementations vary in their error handling for resource not found:

| SDK        | Current Error Code                   | Source |
| ---------- | ------------------------------------ | ------ |
| TypeScript | `-32602` (InvalidParams)             | [mcp.ts#L561](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/server/src/server/mcp.ts#L561) |
| Python     | `0` (generic)                        | [server.py#L790](https://github.com/modelcontextprotocol/python-sdk/blob/main/src/mcp/server/lowlevel/server.py#L790) |
| C#         | `-32002` (custom RESOURCE_NOT_FOUND) | [McpServerImpl.cs#L289](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/src/ModelContextProtocol.Core/Server/McpServerImpl.cs#L289) |
| Rust       | `-32002` (custom RESOURCE_NOT_FOUND) | [model.rs#L450](https://github.com/modelcontextprotocol/rust-sdk/blob/main/crates/rmcp/src/model.rs#L450) |
| Java       | `-32002` (custom RESOURCE_NOT_FOUND) | [McpAsyncServer.java#L732](https://github.com/modelcontextprotocol/java-sdk/blob/main/mcp-core/src/main/java/io/modelcontextprotocol/server/McpAsyncServer.java#L732) |
| Go         | `-32002` (custom RESOURCE_NOT_FOUND) | [server.go#L786](https://github.com/modelcontextprotocol/go-sdk/blob/main/mcp/server.go#L786) |
| Kotlin     | `-32603` (INTERNAL_ERROR)            | [Server.kt#L618-L621](https://github.com/modelcontextprotocol/kotlin-sdk/blob/main/kotlin-sdk-server/src/commonMain/kotlin/io/modelcontextprotocol/kotlin/sdk/server/Server.kt#L618-L621) |
| PHP        | `-32002` (custom RESOURCE_NOT_FOUND) | [Error.php#L37](https://github.com/modelcontextprotocol/php-sdk/blob/main/src/Schema/JsonRpc/Error.php#L37) |
| Ruby       | N/A (left to implementor)            | [server.rb#L375-L379](https://github.com/modelcontextprotocol/ruby-sdk/blob/main/lib/mcp/server.rb#L375-L379) |
| Swift      | N/A (no built-in handler)            | N/A |

This inconsistency means clients cannot reliably detect resource-not-found conditions across implementations. Of the 8 SDKs with built-in resource handling, four different error codes are used: `-32002` (C#, Rust, Java, Go, PHP), `-32602` (TypeScript), `-32603` (Kotlin), and `0` (Python). Ruby and Swift leave error handling to the server implementor. Clients that need to distinguish "resource not found" from other errors must handle all variants.

## Specification

If the requested resource does not exist, servers MUST return a JSON-RPC error with code `-32602` (Invalid Params):

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "error": {
    "code": -32602,
    "message": "Resource not found",
    "data": {
      "uri": "file:///nonexistent.txt"
    }
  }
}
```

The `data` field SHOULD include the `uri` that was not found.

Servers MUST NOT return an empty `contents` array for a non-existent resource. An empty array is ambiguous — it could mean the resource exists but has no content, or that it doesn't exist at all.

## Rationale

### Why `-32602` (Invalid Params)?

`-32602` is the standard JSON-RPC error code for invalid parameters. A non-existent URI is semantically an invalid parameter — the client provided a URI that doesn't correspond to any resource. This aligns with the TypeScript SDK's existing behavior and avoids introducing custom error codes outside the JSON-RPC reserved range.

### Why Not a Custom Error Code?

Several SDKs use `-32002` (RESOURCE_NOT_FOUND), but:

- Custom codes in the `-32000` to `-32099` range are "reserved for implementation-defined server errors" per JSON-RPC spec, not for protocol-level semantics
- Adding a protocol-defined custom code requires all clients to be updated to recognize it
- `-32602` already has the correct meaning and is universally understood by JSON-RPC libraries

## Backward Compatibility

This changes what is specified — the current spec recommends `-32002`, and this SEP changes it to `-32602`. However, since the current recommendation is not consistently followed across SDKs (only 5 of 10 use `-32002`), clients cannot rely on any single error code today. This means the practical impact on clients is minimal — any client robust enough to work across existing SDKs already handles multiple error codes or treats all errors generically.

### Migration Path

1. SDKs should update their resource-not-found error code to `-32602`
2. During the transition, clients SHOULD handle both `-32602` and `-32002` as resource-not-found
3. The specification should document `-32602` as the canonical error code

## Security Implications

None. This change only affects error code values, not access control or data exposure.
