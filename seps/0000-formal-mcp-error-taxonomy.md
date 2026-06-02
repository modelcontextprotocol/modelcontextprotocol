# SEP-0000: Formal MCP Error Taxonomy

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-06-02
- **Author(s)**: @Agent-Hellboy
- **Sponsor**: None (seeking sponsor)
- **PR**: TBD

## Abstract

MCP should define a formal protocol-owned error taxonomy so SDKs, clients, and servers can identify the same failure the same way across implementations.

The current wire-level `error.code` values are too coarse and have drifted across SDKs. The clearest example is "resource not found", which has appeared as `-32002`, `-32602`, `0`, and `-32603` depending on SDK and version. "Session not found" is also inconsistent across SDKs, sometimes represented as raw HTTP text, sometimes as a JSON-RPC error.

This SEP keeps JSON-RPC numeric error codes as the compatibility layer, but adds a structured MCP condition code in `error.data` as an interoperability layer. The taxonomy follows PostgreSQL `SQLSTATE` structurally: a stable family/class plus a precise condition. It also takes interoperability guidance from gRPC, where one protocol-level error model is implemented across multiple language SDKs, and from Stripe, Kubernetes, RFC 9457, and Cloudflare, where generic transport/status codes are paired with machine-readable domain-specific error semantics.

This SEP is compatible with either decision on JSON-RPC numeric code allocation. MCP can continue using existing numeric mappings where required by protocol version compatibility, or it can revise those mappings in future specifications. In both cases, the MCP condition code remains the stable protocol semantic.

## Motivation

PostgreSQL assigns stable error codes to server messages. The first part of the code identifies the error class, and the remaining part identifies the specific condition. Applications can match either broadly or precisely.

MCP needs the same property:

- A client should distinguish "tool not found" from "tool arguments invalid" even if both map to JSON-RPC `-32602`.
- A client should distinguish "resource not found" from "malformed resource URI".
- A client should distinguish "session expired" from "unsupported protocol version".
- SDKs should not invent different numeric codes for the same condition.
- Conformance tests should be able to assert exact behavior across TypeScript, Python, Go, Rust, Java, C#, Kotlin, PHP, Ruby, and Swift.

This is not a novel or optional documentation nicety. Mature protocols and APIs already formalize machine-readable error conditions because prose messages and broad transport codes are not enough for interoperable clients. MCP should follow the same discipline by making `error.data.mcpError.code` the common error vocabulary shared by all SDKs:

| System                   | Pattern MCP should borrow                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| PostgreSQL SQLSTATE      | Stable error classes plus precise conditions. Applications can match by broad class or exact condition.   |
| gRPC status codes        | A shared error model implemented consistently across language libraries.                                  |
| Stripe API errors        | HTTP status plus structured `type`, `code`, `decline_code`, and parameter metadata for programmatic use.  |
| Kubernetes Status        | Transport/status code plus `reason` to clarify the API-specific condition.                                |
| RFC 9457 Problem Details | Generic HTTP status plus machine-readable problem type and structured details.                            |
| Cloudflare errors        | Product-specific error codes and categories layered on top of HTTP status for retry and escalation logic. |

This follows PostgreSQL, gRPC, Stripe, Kubernetes, RFC 9457, and Cloudflare patterns without fighting JSON-RPC numeric code space. The point is not to replace JSON-RPC. The point is to formalize MCP error semantics and expose them as a stable interoperability layer above JSON-RPC.

### Local SDK Evidence

The official SDK implementations show why a taxonomy is needed:

| SDK        | Observed behavior / constants                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TypeScript | `ProtocolErrorCode.ResourceNotFound` is used for resource misses in server code, while many tool/prompt misses use `InvalidParams`. Session examples use `-32001`. |
| Python     | Defines standard JSON-RPC constants and `REQUEST_TIMEOUT = -32001`; streamable HTTP manager returns `INVALID_REQUEST` (`-32600`) for "Session not found".          |
| Go         | Standard JSON-RPC constants live in `jsonrpc`; `CodeResourceNotFound` is deprecated toward `CodeInvalidParams`, but older compatibility still exists.              |
| Rust       | Defines `RESOURCE_NOT_FOUND = -32002` and `URL_ELICITATION_REQUIRED = -32042` alongside standard JSON-RPC codes.                                                   |
| Java       | Defines `RESOURCE_NOT_FOUND = -32002` in `McpSchema.ErrorCodes`.                                                                                                   |
| C#         | Defines `HeaderMismatch = -32001`, `ResourceNotFound = -32002`, `UrlElicitationRequired = -32042`, and standard JSON-RPC codes.                                    |
| Kotlin     | Defines SDK-specific `CONNECTION_CLOSED = -32000`, `REQUEST_TIMEOUT = -32001`, `RESOURCE_NOT_FOUND = -32002`, plus standard JSON-RPC codes.                        |
| PHP        | Defines `SERVER_ERROR = -32000` and `RESOURCE_NOT_FOUND = -32002` plus standard JSON-RPC codes.                                                                    |
| Ruby       | Currently exposes standard JSON-RPC codes only.                                                                                                                    |
| Swift      | Maps `connectionClosed` to `-32000`, transport errors to `-32001`, and URL elicitation to `-32042`.                                                                |

The drift is not just naming. The same logical event can produce different wire codes, and different events can share the same wire code without a machine-readable subtype.

## Specification

### Design Goals

- Preserve JSON-RPC compatibility.
- Define a formal MCP error taxonomy.
- Expose that taxonomy as a stable MCP error interoperability layer.
- Avoid overloading JSON-RPC numeric code space for MCP application semantics.
- Make error conditions stable, self-explaining, and testable.
- Let clients match by family or exact condition.
- Keep backward compatibility for existing clients that only inspect `error.code`.
- Give SDK authors a generated/shared source of truth.
- Make the proposal independent of the unresolved debate over whether MCP should allocate custom meanings inside `-32000..-32099`.

### Non-Goals

- Do not replace JSON-RPC `error.code`.
- Do not require clients to ignore JSON-RPC `error.code`.
- Do not encode every possible tool execution failure as a protocol error.
- Do not require applications to expose internal implementation details.
- Do not define HTTP status behavior for every transport case in this SEP unless needed for the error taxonomy.
- Do not require this SEP to settle whether MCP may or may not use JSON-RPC's `-32000..-32099` implementation-defined server-error range.

### Interoperability Model

MCP error responses should be interpreted in layers:

| Layer                  | Field                      | Purpose                                                                       |
| ---------------------- | -------------------------- | ----------------------------------------------------------------------------- |
| JSON-RPC compatibility | `error.code`               | Keeps generic JSON-RPC clients and existing MCP clients working.              |
| MCP interoperability   | `error.data.mcpError.code` | Gives all MCP SDKs and clients the same stable semantic condition.            |
| Human diagnostics      | `error.message`            | Helps humans understand the specific occurrence. Clients MUST NOT parse this. |

MCP needs this interoperability layer because JSON-RPC numeric codes are too coarse, overloaded, and version-sensitive to carry MCP-specific semantics reliably across SDKs.

### Wire Shape

Every MCP protocol error response SHOULD include `error.data.mcpError`.

Future protocol versions MAY make this field REQUIRED for all MCP-defined protocol errors.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32602,
    "message": "Resource not found",
    "data": {
      "mcpError": {
        "code": "MCP-VAL-RESOURCE-NOT-FOUND",
        "family": "validation",
        "condition": "resource_not_found"
      }
    }
  }
}
```

### Field Semantics

| Field       | Type   | Semantics                                         |
| ----------- | ------ | ------------------------------------------------- |
| `code`      | string | Stable MCP condition code.                        |
| `family`    | string | Broad class of error. Clients MAY branch on this. |
| `condition` | string | Specific condition within the family.             |

Optional fields:

| Field        | Type   | Semantics                                                              |
| ------------ | ------ | ---------------------------------------------------------------------- |
| `target`     | string | Method, resource, tool, prompt, task, or transport surface involved.   |
| `details`    | object | Structured details safe to expose to the peer.                         |
| `deprecated` | object | Optional metadata if this condition replaces an old code or condition. |

### Error Families

| Family        | Prefix | Purpose                                                                          |
| ------------- | ------ | -------------------------------------------------------------------------------- |
| `protocol`    | `PRO`  | Invalid JSON-RPC/MCP envelope, unsupported method, unsupported protocol version. |
| `validation`  | `VAL`  | Invalid or missing MCP request parameters.                                       |
| `capability`  | `CAP`  | Capability not supported, not negotiated, or not declared.                       |
| `auth`        | `AUT`  | Authentication and authorization failures.                                       |
| `session`     | `SES`  | Missing, expired, unknown, or invalid session state.                             |
| `resource`    | `RES`  | Resource lifecycle and availability conditions.                                  |
| `tool`        | `TOL`  | Tool resolution and tool protocol failures.                                      |
| `prompt`      | `PRM`  | Prompt resolution and prompt protocol failures.                                  |
| `task`        | `TSK`  | Task lifecycle, task lookup, cancellation, and result retrieval failures.        |
| `transport`   | `TRN`  | Streamable HTTP, SSE, resumability, and transport-level failures.                |
| `elicitation` | `ELI`  | Elicitation-required or elicitation-result failures.                             |
| `rate_limit`  | `RAT`  | Quota, concurrency, and rate-limit failures.                                     |
| `upstream`    | `UPS`  | Dependency, backend, or external service failures.                               |
| `internal`    | `INT`  | Unexpected implementation failure.                                               |

### Initial Condition Registry

| MCP code                         | Family        | Condition                  | JSON-RPC code        |
| -------------------------------- | ------------- | -------------------------- | -------------------- |
| `MCP-PRO-PARSE-ERROR`            | `protocol`    | `parse_error`              | `-32700`             |
| `MCP-PRO-INVALID-REQUEST`        | `protocol`    | `invalid_request`          | `-32600`             |
| `MCP-PRO-METHOD-NOT-FOUND`       | `protocol`    | `method_not_found`         | `-32601`             |
| `MCP-VAL-INVALID-PARAMS`         | `validation`  | `invalid_params`           | `-32602`             |
| `MCP-INT-INTERNAL-ERROR`         | `internal`    | `internal_error`           | `-32603`             |
| `MCP-VAL-RESOURCE-URI-INVALID`   | `validation`  | `resource_uri_invalid`     | `-32602`             |
| `MCP-VAL-RESOURCE-NOT-FOUND`     | `validation`  | `resource_not_found`       | `-32602`             |
| `MCP-VAL-TOOL-NAME-INVALID`      | `validation`  | `tool_name_invalid`        | `-32602`             |
| `MCP-VAL-TOOL-NOT-FOUND`         | `validation`  | `tool_not_found`           | `-32602`             |
| `MCP-VAL-PROMPT-NOT-FOUND`       | `validation`  | `prompt_not_found`         | `-32602`             |
| `MCP-CAP-NOT-SUPPORTED`          | `capability`  | `capability_not_supported` | `-32601`             |
| `MCP-SES-NOT-FOUND`              | `session`     | `session_not_found`        | `-32600` or `-32602` |
| `MCP-SES-EXPIRED`                | `session`     | `session_expired`          | `-32600` or `-32602` |
| `MCP-TRN-HEADER-MISMATCH`        | `transport`   | `header_mismatch`          | `-32600`             |
| `MCP-TRN-RESUMPTION-UNAVAILABLE` | `transport`   | `resumption_unavailable`   | `-32600`             |
| `MCP-ELI-URL-REQUIRED`           | `elicitation` | `url_elicitation_required` | `-32042` initially   |
| `MCP-TSK-NOT-FOUND`              | `task`        | `task_not_found`           | `-32602`             |
| `MCP-TSK-TERMINAL`               | `task`        | `task_terminal`            | `-32602`             |

Open question: `session_not_found` needs spec discussion. Python currently uses `-32600`; TypeScript examples use `-32001`; some SDKs return raw HTTP 404. This SEP should standardize the MCP condition immediately and separately decide the JSON-RPC numeric mapping.

### Compatibility Rules

1. Existing clients MAY continue to inspect `error.code`.
2. New clients SHOULD inspect `error.data.mcpError.code` for MCP-defined errors.
3. SDKs SHOULD expose typed constants/classes for both JSON-RPC numeric codes and MCP condition codes.
4. If an SDK receives an older error without `mcpError`, it MAY infer the condition from `error.code`, method, message, and protocol version, but MUST treat that inference as best-effort.
5. SDKs SHOULD NOT create new MCP-specific numeric JSON-RPC codes without adding a condition entry to the registry.

The compatibility model is intentionally layered:

- JSON-RPC `error.code` is the protocol compatibility layer.
- `error.data.mcpError.code` is the MCP interoperability layer.
- Human-readable `error.message` is diagnostic text and MUST NOT be the only way to identify the condition.

This means an implementation may keep returning `-32002`, `-32602`, or another legacy numeric code for a specific protocol version, while still exposing the same stable MCP condition code, such as `MCP-VAL-RESOURCE-NOT-FOUND`.

### SDK API Shape

Each SDK should expose a common concept:

```text
McpErrorCondition
  code: "MCP-VAL-RESOURCE-NOT-FOUND"
  family: "validation"
  condition: "resource_not_found"
  jsonRpcCode: -32602
```

Language-specific examples:

- TypeScript: `McpErrorCondition.ResourceNotFound`
- Python: `McpErrorCondition.RESOURCE_NOT_FOUND`
- Go: `mcp.ErrorConditionResourceNotFound`
- Rust: `ErrorCondition::ResourceNotFound`
- Java/C#: `McpErrorCondition.ResourceNotFound`

## Rationale

### Why Not Just Use Numeric JSON-RPC Codes?

JSON-RPC already reserves important ranges. MCP has already had confusion around `-32000..-32099`; issue #509 argues that MCP should not treat that range as free application space.

Using `error.data.mcpError.code` avoids that fight. The numeric `error.code` remains useful for JSON-RPC compatibility, while the MCP condition code carries the stable protocol semantics.

Other ecosystems solve this exact problem by layering a domain-specific, machine-readable condition over the generic transport/protocol status. MCP should do the same. JSON-RPC `error.code` should remain the compatibility layer; MCP error conditions should be the interoperability layer.

Even if MCP decides that it is acceptable to allocate custom meanings in `-32000..-32099`, numeric JSON-RPC codes alone still do not solve the interoperability problem. They are too small, version-sensitive, and overloaded to express the full MCP condition space. A condition registry is still needed so SDKs converge on the same semantic names and clients can match specific failure conditions without parsing prose messages.

### Alternatives Considered

**Standardize only numeric JSON-RPC codes.** This would improve some cases, such as resource-not-found, but it would not solve the broader subtype problem. Many distinct MCP conditions legitimately share the same JSON-RPC code.

**Use prose `error.message` values as the stable contract.** Rejected because messages are for human diagnostics and vary by SDK, localization, handler implementation, and security posture. Clients must not parse messages for control flow.

**Define SDK-only error constants without a wire-level field.** Rejected because clients and servers implemented in different languages would still lack a shared protocol-visible condition.

## Backward Compatibility

This SEP preserves JSON-RPC `error.code` as the compatibility layer. Existing clients MAY continue to inspect `error.code`, and older clients that ignore `error.data.mcpError` will continue to receive ordinary JSON-RPC errors.

The main compatibility change is that conforming MCP implementations will begin adding structured MCP error condition metadata under `error.data.mcpError`. This is additive for clients that tolerate unknown `data` fields.

Existing SDK numeric aliases, such as `ResourceNotFound = -32002`, may remain where needed for compatibility, but should be marked deprecated when the registry maps the condition to a standard JSON-RPC code.

### Migration Plan

1. Add the taxonomy to the draft specification and schema.
2. Add examples to schema examples.
3. Add generated constants/types for the current SDKs.
4. Update SDK error constructors to include `error.data.mcpError`.
5. Add conformance tests.
6. Keep legacy numeric aliases where needed, but mark them deprecated when the registry maps the condition to a standard JSON-RPC code.

## Security Implications

This SEP adds structured metadata to protocol errors. Implementations must ensure `details` contains only information safe to expose to the peer. Servers must not include secrets, internal stack traces, private file paths, credentials, or authorization decisions that reveal sensitive policy details.

The taxonomy may improve security-relevant behavior by allowing clients and conformance tests to distinguish authentication, authorization, validation, session, transport, and internal-error conditions without parsing prose. However, the taxonomy itself does not change authentication, authorization, or access-control rules.

## Reference Implementation

I guess, it's not required for now.

## Conformance Tests

Because this is a Standards Track SEP that changes observable protocol behavior, conformance coverage is required before the SEP can reach `Final` status.

Add conformance tests for at least:

- Unknown tool name.
- Unknown prompt name.
- Unknown resource URI.
- Invalid resource URI syntax.
- Invalid pagination cursor.
- Unknown or expired session ID.
- Unsupported protocol version.
- URL elicitation required.
- Task not found.
- Internal handler failure.

Each test should assert:

- JSON-RPC `error.code`.
- `error.data.mcpError.code`.
- `error.data.mcpError.family`.
- `error.data.mcpError.condition`.
- HTTP status for Streamable HTTP cases where applicable.

The conformance scenario should include a traceability file mapping each normative `MUST`, `MUST NOT`, `SHOULD`, and `SHOULD NOT` in the Specification section to either a check ID or a documented exclusion.

## Open Questions

- Should `session_not_found` map to `-32600`, `-32602`, or another numeric JSON-RPC code?
- Should `error.data.mcpError` become required immediately for all MCP-defined protocol errors, or should it start as `SHOULD` and become required in a future protocol version?
- Should the condition registry live directly in the specification, in generated schema metadata, or in a separate machine-readable registry file?
