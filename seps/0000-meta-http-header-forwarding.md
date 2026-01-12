# SEP-0000: Automatic \_meta to HTTP Header Forwarding for Distributed Tracing

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2025-12-29
- **Author(s)**: Manah Khalil (@monahk)
- **Sponsor**: None
- **PR**: #2028

## Abstract

This SEP proposes a standardized mechanism for MCP servers to automatically forward `_meta` fields from client requests to downstream HTTP calls. W3C Trace Context fields (`traceparent`, `tracestate`) are forwarded **by default** to enable distributed tracing without requiring server modifications. Custom metadata fields require explicit opt-in. Currently, `_meta` reaches the MCP server but is not forwarded, breaking end-to-end observability across the MCP boundary.

## Motivation

Modern distributed systems rely on trace context propagation (OpenTelemetry, W3C Trace Context) for observability. The MCP protocol already supports passing metadata via `_meta` in `request.params` (established in Issue #246). However, there is no mechanism for MCP servers to forward this context to downstream services.

### The Problem

When an MCP client sends a tool call with trace context:

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": { "location": "Dallas" },
    "_meta": {
      "traceparent": "00-e796ccb939d95b7c54d523095a9bd3b4-e515588135c1c901-01",
      "correlation_id": "mcp-webchat-1767041682815"
    }
  }
}
```

The MCP server receives `_meta` in `request.params._meta`, but when it makes HTTP calls to external APIs (e.g., AccuWeather, GitHub API, ClickUp API), **no trace headers are forwarded**:

```text
[EXTERNAL API REQUEST RECEIVED]
Headers:
  accept: application/json
  user-agent: axios/1.13.2
  host: api.example.com

>>> NO trace context headers found <<<
>>> _meta is NOT being forwarded <<<
```

This was verified by intercepting HTTP traffic from an unmodified MCP server (`@timlukahorstmann/mcp-weather`) calling a mock API endpoint.

### Prior Work

- **Issue #246**: Established the `_meta` convention for client-to-server metadata propagation. Marked as "completed" because the protocol layer works.
- **PR #666 (typescript-sdk)**: Proposed automatic HTTP header forwarding with `X-MCP-*` prefix. **Rejected** with rationale: _"This PR introduces transport-specific concerns (HTTP headers) into the MCP SDK without protocol-level support."_
- **Discussion #801**: Ongoing discussion about client-level request identifiers.

The rejection of PR #666 explicitly called for protocol-level support before SDK implementation. This SEP provides that protocol-level foundation.

### Why This Matters

Without trace context propagation:

- Distributed traces break at the MCP boundary
- Debugging multi-service requests involving MCP tools is difficult
- Organizations cannot correlate MCP tool calls with downstream API metrics
- Enterprise observability requirements cannot be met

## Specification

### 1. Field Classification and Default Behavior

Fields in `_meta` are classified into two categories with different default behaviors:

#### 1.1 W3C Trace Context Fields (Forwarded by Default)

The following fields are **automatically forwarded** to downstream HTTP calls unless explicitly disabled:

| `_meta` Field | HTTP Header   | Default       |
| ------------- | ------------- | ------------- |
| `traceparent` | `traceparent` | **Forwarded** |
| `tracestate`  | `tracestate`  | **Forwarded** |
| `baggage`     | `baggage`     | **Forwarded** |

**Rationale**: These are standardized W3C fields designed for propagation. They contain no sensitive data and are expected to flow through distributed systems. This matches OpenTelemetry's auto-instrumentation behavior.

#### 1.2 Custom Fields (Opt-In)

All other `_meta` fields are **NOT forwarded by default** and require explicit opt-in:

| `_meta` Field    | HTTP Header            | Default       |
| ---------------- | ---------------------- | ------------- |
| `correlation_id` | `X-MCP-Correlation-Id` | Not forwarded |
| `tenant_id`      | `X-MCP-Tenant-Id`      | Not forwarded |
| `{custom}`       | `X-MCP-{Custom}`       | Not forwarded |

**Rationale**: Custom fields could contain sensitive data (tenant IDs, user context, etc.) and should not leak to third-party APIs without explicit configuration.

### 2. Server SDK Behavior

#### 2.1 Automatic W3C Trace Context Forwarding

MCP Server SDKs MUST automatically inject W3C Trace Context headers (`traceparent`, `tracestate`, `baggage`) from `_meta` into outbound HTTP requests made during tool execution.

This behavior:

- Is **enabled by default**
- Requires no code changes from MCP server authors
- Can be disabled via configuration

```typescript
// W3C headers are forwarded automatically - no code needed!

// To disable (opt-out):
const server = new Server({
  forwardTraceContext: false, // Disable automatic W3C header forwarding
});
```

#### 2.2 Custom Field Forwarding (Opt-In)

For custom `_meta` fields, SDKs SHOULD provide explicit opt-in configuration:

```typescript
const server = new Server({
  forwardCustomMeta: true, // Enable custom field forwarding
  customMetaFields: ["correlation_id", "tenant_id"], // Whitelist specific fields
  customMetaPrefix: "X-MCP-", // Prefix for custom headers
});
```

#### 2.3 Context Accessor

Tool handlers MUST have access to `_meta` from the request context for manual use:

```typescript
server.tool("get_weather", async (params, context) => {
  const meta = context.meta; // Access to full _meta object
  // Use manually if needed
});
```

#### 2.4 Manual Header Extraction Utility

SDKs SHOULD provide a utility for manual header extraction when needed:

```typescript
import { extractHttpHeaders } from "@modelcontextprotocol/sdk/utils";

const headers = extractHttpHeaders(context.meta, {
  includeCustom: true, // Include custom fields
  customFields: ["correlation_id"], // Whitelist
});
```

### 3. Field Validation

SDKs MUST validate `_meta` fields before forwarding:

- Values MUST be strings
- Values MUST contain only visible ASCII characters (0x21-0x7E) and spaces (0x20)
- Values MUST NOT contain control characters or newlines (prevents header injection)
- Individual values SHOULD be limited to 256 characters
- Total `_meta` size SHOULD be limited to 8KB

Invalid fields MUST be silently dropped (not cause errors).

### 4. Configuration Options

| Option                | Type     | Default    | Description                           |
| --------------------- | -------- | ---------- | ------------------------------------- |
| `forwardTraceContext` | boolean  | `true`     | Forward W3C Trace Context headers     |
| `forwardCustomMeta`   | boolean  | `false`    | Forward custom `_meta` fields         |
| `customMetaFields`    | string[] | `[]`       | Whitelist of custom fields to forward |
| `customMetaPrefix`    | string   | `"X-MCP-"` | Prefix for custom field headers       |

### 5. Transport Considerations

This specification applies to MCP servers making **outbound HTTP/HTTPS requests**. For other transports:

- **gRPC**: Map to gRPC metadata
- **Message Queues**: Map to message headers/properties
- **WebSocket**: Not applicable (no standard header mechanism)

### 6. Conflict Resolution

When `_meta` contains W3C Trace Context fields and the outbound HTTP request already has corresponding headers set (e.g., via auto-instrumentation):

1. If `traceparent` is present and valid in `_meta`, SDKs MUST use an **all-or-nothing** approach:
   - Discard ALL existing W3C Trace Context headers (`traceparent`, `tracestate`, `baggage`) from the outbound request
   - Forward ONLY the W3C fields present in `_meta`
2. SDKs SHOULD log a debug-level message when overriding existing headers
3. No error should be raised—this is expected behavior when integrating with existing observability infrastructure

**Rationale**: W3C Trace Context fields are semantically linked—`tracestate` contains vendor-specific data keyed to the `traceparent`, and `baggage` may contain context relevant to that specific trace. Mixing fields from different sources would create inconsistent trace context. The all-or-nothing approach ensures trace coherence across the MCP boundary.

## Rationale

### Why Default-On for W3C Trace Context?

The key insight is that **opt-in defeats the purpose**. If every MCP server author must explicitly enable trace forwarding, adoption will be minimal and the distributed tracing problem remains unsolved.

W3C Trace Context fields are:

1. **Standardized** - designed specifically for propagation across service boundaries
2. **Non-sensitive** - contain only trace/span IDs, not business data
3. **Expected to propagate** - this is their entire purpose

This matches how OpenTelemetry auto-instrumentation works: trace context propagates automatically without application code changes.

### Why Opt-In for Custom Fields?

Custom fields like `tenant_id`, `user_id`, or `correlation_id` could contain:

- Sensitive identifiers
- Business context that shouldn't leak to third parties
- PII or security-relevant data

These require explicit opt-in to prevent accidental data exposure.

### Why Protocol-Level Specification?

PR #666 was rejected because it added transport-specific behavior without protocol backing. This SEP:

1. Defines which `_meta` fields have semantic meaning for forwarding
2. Specifies default behaviors for each field category
3. Provides clear SDK implementation guidance
4. Allows SDK implementations to follow a standard

### Alternative Designs Considered

1. **All opt-in (PR #666 approach)**: Rejected because it requires every server to enable forwarding, defeating the purpose.

2. **All opt-out**: Too risky for custom fields that may contain sensitive data.

3. **New top-level `request.trace` field**: Would require schema changes and break existing implementations.

The chosen design balances automatic trace propagation with security for custom data.

## Backward Compatibility

This SEP introduces a **behavioral change** for W3C Trace Context forwarding:

- **Before**: No headers forwarded from `_meta`
- **After**: `traceparent`, `tracestate`, `baggage` forwarded automatically

This is backward compatible in the sense that:

- The `_meta` field format is unchanged
- Servers not making HTTP calls are unaffected
- Downstream APIs receiving additional headers will ignore unknown headers (per HTTP spec)
- Servers can opt-out if the new behavior causes issues

**Risk mitigation**:

- Servers can set `forwardTraceContext: false` to restore previous behavior
- Only W3C standard headers are forwarded by default (not arbitrary data)
- SDK release notes should clearly document the behavioral change

## Security Implications

### Header Injection

**Risk**: Malicious `_meta` values could inject arbitrary HTTP headers.

**Mitigation**: SDKs MUST validate all `_meta` values (ASCII-only, no control characters, size limits) and reject/sanitize invalid input.

### Information Disclosure

**Risk**: Sensitive data in `_meta` could leak to third-party APIs.

**Mitigation**:

- Only W3C Trace Context fields (non-sensitive) are forwarded by default
- Custom fields require explicit opt-in with whitelist
- Documentation MUST warn against including sensitive data in `_meta`

### Amplification

**Risk**: Large `_meta` payloads could increase request sizes.

**Mitigation**: Size limits (256 chars per field, 8KB total) prevent abuse.

## Reference Implementation

A reference implementation will be provided in the TypeScript SDK after acceptance. The implementation will include:

1. Automatic W3C Trace Context injection for HTTP clients (fetch, axios, etc.)
2. `forwardTraceContext` and `forwardCustomMeta` configuration options
3. `context.meta` accessor in tool handlers
4. `extractHttpHeaders()` utility for manual use
5. Validation and sanitization logic
6. Unit tests covering all scenarios

### Proof of Concept Testing

The problem was verified using:

- MCP client sending `_meta` with `traceparent` and `correlation_id`
- Unmodified `@timlukahorstmann/mcp-weather` MCP server
- Mock HTTPS server intercepting AccuWeather API calls
- Result: **No trace headers received** at mock server

Test code available at: [link to test repository or gist]

## Open Questions

1. **Should there be a capability negotiation?** Clients could discover if a server supports meta forwarding via `initialize` response.

2. **Should forwarding be configurable per-tool?** Some tools may call sensitive APIs where even trace context should not be forwarded.

3. **What about non-HTTP tool implementations?** Tools that don't make HTTP calls (e.g., local file operations) don't benefit from this.

4. **Should `baggage` be opt-in instead?** W3C Baggage can contain arbitrary key-value pairs, which may be more sensitive than trace IDs.

## Acknowledgments

- Contributors to Issue #246 who established the `_meta` convention
- Author of PR #666 for the initial SDK implementation attempt
- Participants in Discussion #801 for ongoing input on request identifiers
