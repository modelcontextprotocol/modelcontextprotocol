# SEP-2028: Automatic \_meta to HTTP Header Forwarding for Distributed Tracing

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2025-12-29
- **Author(s)**: Manah Khalil (@monahk)
- **Sponsor**: None
- **PR**: #2028

## Abstract

This SEP proposes a standardized mechanism for MCP servers to automatically forward `_meta` fields from client requests to downstream HTTP calls using a **group-based policy system**. Header groups (e.g., `trace-context`, `baggage`) can be configured with policies (`clear-and-use-meta`, `prefer-meta`, `ignore-meta`) that control forwarding behavior and conflict resolution. W3C Trace Context fields are forwarded by default. Currently, `_meta` reaches the MCP server but is not forwarded, breaking end-to-end observability across the MCP boundary.

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

### 1. Group-Based Header Forwarding

This specification uses a **group-based model** where semantically related headers are treated as a unit. Each group has a single `policy` setting that controls both forwarding and conflict resolution.

#### 1.1 Policies

| Policy               | Behavior                                                                                                                | Use When                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `clear-and-use-meta` | If ANY header in the group exists in `_meta`, discard ALL existing headers in that group, then forward ALL from `_meta` | Headers are tightly coupled (e.g., `traceparent` + `tracestate`) |
| `prefer-meta`        | For each header: if it exists in `_meta`, overwrite existing; otherwise preserve existing                               | Headers are independent (e.g., `baggage`)                        |
| `ignore-meta`        | Never forward from `_meta` for this group; existing headers are always preserved                                        | Disable forwarding entirely                                      |

#### 1.2 Behavior Matrix

| Policy               | `_meta` has header? | Existing header? | Result                                                |
| -------------------- | ------------------- | ---------------- | ----------------------------------------------------- |
| `clear-and-use-meta` | Yes (any in group)  | Yes              | Clear ALL existing in group, forward ALL from `_meta` |
| `clear-and-use-meta` | Yes (any in group)  | No               | Forward from `_meta`                                  |
| `clear-and-use-meta` | No                  | Yes              | Keep existing                                         |
| `prefer-meta`        | Yes                 | Yes              | Overwrite that specific header with `_meta` value     |
| `prefer-meta`        | Yes                 | No               | Forward from `_meta`                                  |
| `prefer-meta`        | No                  | Yes              | Keep existing                                         |
| `ignore-meta`        | Yes                 | Yes              | Keep existing, ignore `_meta`                         |
| `ignore-meta`        | Yes                 | No               | Do nothing                                            |
| `ignore-meta`        | No                  | Yes              | Keep existing                                         |

#### 1.3 Predefined Groups

SDKs MUST support these predefined header groups:

| Group Name      | Headers                     | Default Policy       | Required          | Rationale                                                                          |
| --------------- | --------------------------- | -------------------- | ----------------- | ---------------------------------------------------------------------------------- |
| `trace-context` | `traceparent`, `tracestate` | `clear-and-use-meta` | `["traceparent"]` | Tightly coupled per W3C Trace Context spec; `tracestate` is keyed to `traceparent` |
| `baggage`       | `baggage`                   | `prefer-meta`        | —                 | Independent W3C standard; can be replaced independently                            |

**Note**: W3C Trace Context and W3C Baggage are separate standards that can version independently, hence they are separate groups with independent policies.

#### 1.4 Custom Fields

All other `_meta` fields are **NOT forwarded by default**. Users can define custom groups to forward them:

| `_meta` Field    | HTTP Header            | Default       |
| ---------------- | ---------------------- | ------------- |
| `correlation_id` | `X-MCP-Correlation-Id` | Not forwarded |
| `tenant_id`      | `X-MCP-Tenant-Id`      | Not forwarded |
| `{custom}`       | `X-MCP-{Custom}`       | Not forwarded |

**Rationale**: Custom fields could contain sensitive data (tenant IDs, user context, etc.) and should not leak to third-party APIs without explicit configuration.

### 2. Server SDK Behavior

#### 2.1 Automatic Header Forwarding

MCP Server SDKs MUST automatically forward headers from `_meta` to outbound HTTP requests based on group policies. By default:

- `trace-context` group (`traceparent`, `tracestate`) uses `clear-and-use-meta` policy with `required: ["traceparent"]`
- `baggage` group uses `prefer-meta` policy
- Custom fields are not forwarded unless explicitly configured

This behavior requires no code changes from MCP server authors.

#### 2.2 Configuration API

SDKs MUST support configuring header groups via `headerGroups`:

```typescript
const server = new Server({
  headerGroups: {
    // Override predefined group policy
    baggage: { policy: "ignore-meta" }, // Disable baggage forwarding

    // Override with custom validator for W3C Trace Context format
    "trace-context": {
      policy: "clear-and-use-meta",
      required: ["traceparent"],
      validator: (headers) => isValidTraceparent(headers.traceparent),
    },

    // Define custom group for Datadog (with required header)
    datadog: {
      headers: [
        "x-datadog-trace-id",
        "x-datadog-parent-id",
        "x-datadog-sampling-priority",
      ],
      policy: "clear-and-use-meta", // These headers are coupled
      required: ["x-datadog-trace-id"], // Group skipped if trace-id missing
    },

    // Define custom group for internal headers
    internal: {
      headers: ["x-tenant-id", "x-request-id", "x-correlation-id"],
      policy: "prefer-meta", // These are independent
    },
  },
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
  groups: ["trace-context", "internal"], // Extract specific groups
});
```

### 3. Field Validation and Processing Order

SDKs MUST process `_meta` fields in the following order:

1. **Validation**: Validate all `_meta` field values (see below)
2. **Required check**: For each group with a `required` array, verify all required headers are present in `_meta`; skip the group entirely if any are missing
3. **Custom validation**: If a `validator` function is configured for the group, invoke it; skip the group if validation fails
4. **Policy application**: Apply the group's policy to determine final headers

#### 3.1 Validation Rules

SDKs MUST validate `_meta` fields before forwarding:

- Values MUST be strings
- Values MUST contain only visible ASCII characters (0x21-0x7E) and spaces (0x20)
- Values MUST NOT contain control characters or newlines (prevents header injection)
- Individual values SHOULD be limited to 256 characters
- Total `_meta` size SHOULD be limited to 8KB

Invalid fields MUST be silently dropped (not cause errors).

### 4. Configuration Options

#### 4.1 Header Group Configuration

| Property    | Type                                                         | Required | Description                                                                                    |
| ----------- | ------------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------- |
| `policy`    | `"clear-and-use-meta"` \| `"prefer-meta"` \| `"ignore-meta"` | Yes      | Forwarding and conflict policy                                                                 |
| `headers`   | `string[]`                                                   | No\*     | Headers in this group                                                                          |
| `required`  | `string[]`                                                   | No       | Headers that MUST be present in `_meta` for group to forward; if any missing, group is skipped |
| `validator` | `(headers: Record<string, string>) => boolean`               | No       | Custom validation function; if it returns false, group is skipped                              |

\* `headers` is required for custom groups, optional when overriding predefined groups.

#### 4.2 Predefined Group Defaults

| Group           | Default Policy       | Required          |
| --------------- | -------------------- | ----------------- |
| `trace-context` | `clear-and-use-meta` | `["traceparent"]` |
| `baggage`       | `prefer-meta`        | —                 |

### 5. Transport Considerations

This specification applies to MCP servers making **outbound HTTP/HTTPS requests**. For other transports:

- **gRPC**: Map to gRPC metadata
- **Message Queues**: Map to message headers/properties
- **WebSocket**: Not applicable (no standard header mechanism)

### 6. Conflict Resolution and Group Integrity

Conflict resolution is handled by the group's `policy` setting (see Section 1.1 and 1.2).

#### 6.1 Group Integrity

By design, the SDK never mixes headers from different sources within a group. Groups stay intact:

- `clear-and-use-meta`: ALL from `_meta`, or ALL from existing (if `_meta` has nothing or `required` headers are missing)
- `prefer-meta`: Per-header replacement, but no partial mixing within a single header
- `ignore-meta`: ALL from existing, `_meta` ignored entirely

#### 6.2 Manual Mixing (Advanced)

To mix sources within a group (e.g., `traceparent` from `_meta` + `tracestate` from existing), the server must:

1. Set `policy: "ignore-meta"` for that group
2. Manually read from `context.meta` in the tool handler
3. Construct headers explicitly

This is intentional—mixing coupled headers like `traceparent` + `tracestate` from different sources can break tracing. If you need to do it, you take explicit responsibility.

#### 6.3 Logging

SDKs SHOULD log a debug-level message when overriding existing headers. No error should be raised—this is expected behavior when integrating with existing observability infrastructure.

## Rationale

### Why Group-Based Design?

The group-based approach was developed through community feedback to address several concerns:

1. **Separate W3C standards**: `traceparent`/`tracestate` (W3C Trace Context) and `baggage` (W3C Baggage) are separate standards that can version independently. They should be configurable independently.

2. **Future-proof**: New standards (Datadog, Jaeger, OpenTelemetry vendor extensions, internal conventions) don't require spec changes—users define their own groups.

3. **Semantic coupling**: Headers like `traceparent` + `tracestate` are tightly coupled (`tracestate` is keyed to `traceparent`). The `clear-and-use-meta` policy ensures they stay together.

4. **Simple mental model**: Single `policy` setting per group, 3 clear policies, no ambiguity.

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
2. Specifies default behaviors via group policies
3. Provides clear SDK implementation guidance
4. Allows SDK implementations to follow a standard

### Alignment with OpenTelemetry

This proposal aligns with [OpenTelemetry's MCP context propagation guidance](https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/#context-propagation) which recommends using `params._meta`. The approach of using standard header names (no `X-MCP-` prefix for W3C headers) also aligns with OpenTelemetry semantic conventions.

### Alternative Designs Considered

1. **All opt-in (PR #666 approach)**: Rejected because it requires every server to enable forwarding, defeating the purpose.

2. **All opt-out**: Too risky for custom fields that may contain sensitive data.

3. **New top-level `request.trace` field**: Would require schema changes and break existing implementations.

4. **Hardcoded W3C headers**: The original design treated all W3C headers as one unit. Rejected because `trace-context` and `baggage` are separate standards.

5. **Two-setting design (`enabled` + `conflictPolicy`)**: Rejected in favor of single `policy` setting for simplicity.

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

- Servers can set `policy: "ignore-meta"` for any group to restore previous behavior
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

1. Automatic header injection for HTTP clients (fetch, axios, etc.) based on group policies
2. `headerGroups` configuration with predefined `trace-context` and `baggage` groups
3. Support for custom group definitions
4. `context.meta` accessor in tool handlers
5. `extractHttpHeaders()` utility for manual use
6. Validation and sanitization logic
7. Unit tests covering all policy behaviors

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

4. **Should `baggage` default to `ignore-meta`?** W3C Baggage can contain arbitrary key-value pairs. Currently proposing `prefer-meta` to match OpenTelemetry behavior, but this is open for discussion.

## Acknowledgments

- Contributors to Issue #246 who established the `_meta` convention
- Author of PR #666 for the initial SDK implementation attempt
- Participants in Discussion #801 for ongoing input on request identifiers
