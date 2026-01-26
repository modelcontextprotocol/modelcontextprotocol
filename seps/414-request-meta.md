# SEP-414: Request `params._meta` for metadata propagation

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-01-20
- **Author(s)**: Adrian Cole (@codefromthecrypt)
- **Sponsor**: None (seeking sponsor)
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/414

## Abstract

This SEP documents and standardizes the convention of using `request.params._meta` to carry
metadata such as trace identifiers, correlation identifiers, and progress tokens across MCP
clients and servers. The goal is interoperability: avoid ad hoc metadata placement (for example,
`meta` vs `_meta`) while keeping the protocol neutral about any particular observability system.
The proposal is additive and backward compatible because MCP and JSON-RPC already permit extra
request parameters. This SEP focuses on documenting and normalizing existing usage, including the
MCP progress flow and common OpenTelemetry (OTel) propagation patterns.

## Motivation

There is already an emerging convention of using `request.params._meta` to propagate metadata.
The MCP progress flow specification uses `_meta.progressToken` to request out-of-band progress
updates, and multiple SDKs and adapters use `_meta` to carry trace context.

Without documentation, cross-implementation interoperability is fragile: clients and servers must
coordinate out-of-band and can easily diverge on names and placement. This SEP addresses the gap
raised in [issue #246](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/246) and
provides a single, stable convention for metadata propagation without changing request semantics.

## Specification

### 1. Requests and notifications

For any MCP request or notification, the `params` object:

- **MAY** include a `_meta` key whose value is an object whose keys are strings and values can be any other JSON value.
- `_meta` is reserved for metadata not part of method-specific parameters.
- Receivers **MUST** ignore `_meta` keys they do not understand.

This aligns with the existing progress flow, which uses `_meta.progressToken` as defined in the
[progress flow specification](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-03-26/basic/utilities/progress.mdx).

### 2. Non-normative example (trace + progress)

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": {
      "location": "New York"
    },
    "_meta": {
      "progressToken": "abc123",
      "traceparent": "00-0af7651916cd43dd8448eb211c80319c-00f067aa0ba902b7-01"
    }
  }
}
```

When OpenTelemetry (OTel) context propagation is used, values such as `traceparent`,
`tracestate`, and `baggage` in `_meta` SHOULD follow the same value format as the W3C
Trace Context headers per [W3C Trace Context](https://www.w3.org/TR/trace-context/#relationship-between-the-headers).

## Rationale

### Why document this even though extra params are allowed?

JSON-RPC allows extra properties, but it does not define conventions for metadata placement.
MCP similarly allows extra request parameters, but does not standardize a metadata carrier.
Documenting a common `_meta` location avoids interoperability issues and provides a stable
convention for correlation IDs and trace context.

- [JSON-RPC request object](https://www.jsonrpc.org/specification#request_object)
- [MCP requests](https://modelcontextprotocol.io/specification/2025-03-26/basic#requests)

### Why choose `_meta` instead of `meta` or `extra`?

The `_meta` name aligns with existing MCP usage and prior art:

- Progress flow uses `_meta.progressToken` (see the [progress flow specification](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-03-26/basic/utilities/progress.mdx)).
- [csharp-sdk moved to `request.params._meta`](https://github.com/modelcontextprotocol/csharp-sdk/pull/360)
- [OpenInference MCP instrumentation (Python)](https://github.com/Arize-ai/openinference/tree/main/python/instrumentation/openinference-instrumentation-mcp)
- [OpenInference MCP instrumentation (TypeScript)](https://github.com/Arize-ai/openinference/tree/main/js/packages/openinference-instrumentation-mcp)
- [mcp-otel (TypeScript)](https://github.com/dylibso/mcp-otel/blob/2407c736c92d6a5e71b454845d839f33dabbbfca/src/agent.ts#L119)

### Why not solve this only for W3C trace-context?

Focusing solely on W3C Trace Context would limit flexibility. OTel supports multiple propagators
(W3C, B3, Jaeger, and others), and non-tracing metadata (for example, progress flow) also benefits
from a generic metadata carrier.

- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
- [B3 propagation](https://github.com/openzipkin/b3-propagation)
- [OTel propagators overview](https://opentelemetry.io/docs/languages/sdk-configuration/general/#otel_propagators)

### Why not mix metadata with existing parameters?

Co-mingling metadata with method parameters can cause collisions and errors. For example, applying
OpenTelemetry text map serialization to the full params object can corrupt method arguments and
change types. Keeping metadata in `_meta` also makes it easier to redact sensitive values before
sending params to an LLM or logging them.

### Why not handle this directly in JSON-RPC?

The JSON-RPC community has discussed adding `meta` in a potential 2.1 revision, but that work is
not finalized. MCP needs a clear convention today while JSON-RPC evolves.

[JSON-RPC group discussion on meta](https://groups.google.com/g/json-rpc/c/pFFuI0JN8Cs/m/8IvCqmB-EQAJ?utm_medium=email&utm_source=footer&pli=1)

### Related discussions and use cases

- [Discussion #309](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/309)
- [Discussion #234](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/234)

## Backward Compatibility

This change is additive and backward compatible. MCP already permits extra parameters, and
`_meta` is optional. Receivers ignoring `_meta` will continue to function correctly.

## Security Implications

`_meta` may include sensitive data (for example, trace correlation IDs or auth-related metadata).
Implementations should continue to follow existing data-handling guidance appropriate to their
environment.

## Reference Implementation

Existing implementations demonstrate the pattern:

- [OpenInference MCP instrumentation (Python)](https://github.com/Arize-ai/openinference/tree/main/python/instrumentation/openinference-instrumentation-mcp)
- [OpenInference MCP instrumentation (TypeScript)](https://github.com/Arize-ai/openinference/tree/main/js/packages/openinference-instrumentation-mcp)
- [OpenInference demo tutorial](https://github.com/Arize-ai/phoenix/tree/main/tutorials/mcp/tracing_between_mcp_client_and_server)
- [OpenInference demo video](https://www.linkedin.com/feed/update/urn:li:activity:7319120266809298944/)
- [csharp-sdk `_meta` change](https://github.com/modelcontextprotocol/csharp-sdk/pull/360)
- [mcp-otel (TypeScript)](https://github.com/dylibso/mcp-otel/blob/2407c736c92d6a5e71b454845d839f33dabbbfca/src/agent.ts#L119)

## Alternatives Considered

- A top-level `request.meta` or `response.meta` field, which may simplify typing but is a more
  invasive protocol change.
- Encoding trace context in method-specific parameters, which risks collisions and data leakage.
- Waiting for JSON-RPC 2.1 to standardize metadata, which may take time and may not align with MCP
  requirements.

## Open Questions

- The draft schema already defines `MetaObject` and `RequestMetaObject` (used by `_meta`), while
  released schemas inline `_meta` fields. Should released schemas adopt the draft base types to
  improve codegen consistency?
  - [Draft schema](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/draft/schema.ts)
  - [Released schema (2025-11-25)](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2025-11-25/schema.ts)
