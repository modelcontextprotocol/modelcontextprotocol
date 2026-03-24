# SEP-2448: Server Execution Telemetry

- **Status**: TBD
- **Type**: Standards Track
- **Created**: 2026-03-23
- **Author(s)**: Sankara Avula (@savula15), Evan Tahler (@evantahler), Yash Sheth (@yashsheth46) and Guru Sattanathan (@avoguru)
- **Sponsor**: TBD
- **PR**: TBD

## Abstract

This SEP defines a standard MCP capability that allows servers to return OpenTelemetry spans to clients in response to service side operations. This covers `tools/call` and `resources/read`, the two MCP operations that involve opaque server side processing most relevant to cross-organization observability. Clients can then ingest these spans into their own observability backend, providing end-to-end distributed tracing across organizational boundaries without requiring a shared collector.

This SEP defines a delivery mechanism for a client visible trace slice, a server-selected subset of trace data that the server determines is appropriate to disclose to the requesting client. It complements SEP-414 by enabling the response-side return of execution spans. Together, these SEPs enable distributed trace stitching across organizational boundaries without requiring shared collectors or federated observability infrastructure.

Servers advertise the **serverExecutionTelemetry** capability during initialization. Clients request span data via **_meta.otel** in tools/call and resources/read requests, and servers return spans under the same `_meta.otel` key in responses.

## Motivation

MCP enables agents to call tools hosted by MCP servers operated by different organizations. SEP-414 enables propagation of the client's `traceparent` to MCP servers. However, there is currently no standardized mechanism for servers to return execution telemetry to clients.

In cross-organization MCP scenarios, this creates a one-way observability gap:

1. Tool execution appears as a black box: the client sees a single `mcp.call_tool` span,  everything the server does (auth checks, API calls, cache operations etc..) is invisible.
2. Resource reads are equally opaque: `resources/read` can involve expensive server-side I/O, ACL checks, remote API lookups, and format conversion. When a resource read is denied or slow, the client has no visibility into why.
3. Guardrail or runtime control decisions are not observable: when a server blocks a tool call due to policy denial or auth failure, the client has no structured visibility into which processing stage failed or why.
4. Server-side latency breakdown cannot be stitched into client traces: clients cannot debug server-side bottlenecks or accurately attribute latency across the call boundary.

In traditional OpenTelemetry deployments, services export spans to shared or federated collectors. This model does not apply to many cross-organization MCP deployments:

- Server operators typically do not expose collector access to external clients.
- Clients and servers may use different telemetry backends with no federation.
- Server-side spans may contain sensitive infrastructure details unsuitable for external exposure.

This observability gap is particularly relevant for:

- Enterprise agents calling vendor-operated MCP servers which has become the de facto integration pattern.
- Multi-tenant MCP platforms serving customers with independent observability systems
- Compliance sensitive deployments requiring structured visibility into tool execution and control decisions

This SEP defines an explicit, opt-in mechanism for returning a minimal trace slice directly in MCP responses, without requiring shared infrastructure. Together with SEP-414, it enables a full-circle telemetry story for MCP.

## Specification

### Protocol Key and Terminology

The capability is advertised as `serverExecutionTelemetry` in the server's capabilities object. Telemetry request and response data is carried under `_meta.otel` in `tools/call` and `resources/read` messages.

This document uses **telemetry passback** (and **span passback** when referring specifically to trace spans) to refer to the mechanism defined by the `serverExecutionTelemetry` capability: the in-band return of OpenTelemetry data from server to client via `_meta.otel`.

### Server Capability Advertisement

In the initialize response, an MCP server that supports span passback **MUST** advertise `serverExecutionTelemetry`:

```json
{
 "capabilities": {
   "serverExecutionTelemetry": {
     "version": "2026-03-01",
     "signals": {
       "traces": { "supported": true }
     }
   }
 }
}
```

| Field                      | Type    | Description                                                             |
|---------------------------|---------|-------------------------------------------------------------------------|
| `version`                 | string  | Schema version (date based)                                             |
| `signals.traces.supported`| boolean | Whether span passback is available (metrics may be supported too in future) |

### Client Request

Clients **MAY** explicitly request span passback by setting `_meta.otel` on a `tools/call` or `resources/read` request

```json
{
 "_meta": {
   "traceparent": "00-abcdef1234567890abcdef1234567890-1234567890abcdef-01",
   "otel": {
     "traces": {
       "request": true,
       "detailed": false
     }
   }
 }
}
```

```json
{
 "method": "resources/read",
 "params": {
   "uri": "file:///data/report.csv",
   "_meta": {
     "traceparent": "00-abcdef1234567890abcdef1234567890-fedcba0987654321-01",
     "otel": {
       "traces": {
         "request": true,
         "detailed": false
       }
     }
   }
 }
}
```

| Field                   | Type    | Description |
|------------------------|---------|-------------|
| `otel.traces.request`  | boolean | `true` to opt into receiving spans in the response |
| `otel.traces.detailed` | boolean | `false` = root + direct children only; `true` = full span tree |

The traceparent field ([W3C Trace Context](https://www.w3.org/TR/trace-context/)) is passed alongside but outside the otel key. Trace context propagation via traceparent in MCP requests follows the mechanism defined in SEP-414.

### Server Response

When span passback is requested, servers **MUST** return spans under `_meta.otel` in the JSON-RPC response.

```json
{
 "_meta": {
   "otel": {
     "traces": {
       "resourceSpans": [
         {
           "resource": {
             "attributes": [
               { "key": "service.name", "value": { "stringValue": "mcp-weather-server" } }
             ]
           },
           "scopeSpans": [
             {
               "scope": { "name": "server-execution-telemetry" },
               "spans": [ ... ]
             }
           ]
         }
       ]
     }
   }
 }
}
```

```json
{
 "result": {
   "contents": [
     {
       "uri": "file:///data/report.csv",
       "mimeType": "text/csv",
       "text": "id,name,value\n1,alpha,100\n..."
     }
   ],
   "_meta": {
     "otel": {
       "traces": {
         "resourceSpans": [
           {
             "resource": {
               "attributes": [
                 { "key": "service.name", "value": { "stringValue": "mcp-data-server" } }
               ]
             },
             "scopeSpans": [
               {
                 "scope": { "name": "server-execution-telemetry" },
                 "spans": [ ... ]
               }
             ]
           }
         ]
       }
     }
   }
 }
}
```

| Field                   | Type  | Description |
|------------------------|-------|-------------|
| `traces.resourceSpans` | array | Verbatim [OTLP JSON](https://opentelemetry.io/docs/specs/otlp/) `resourceSpans`; the client can POST this directly to `/v1/traces` |

### Span Ownership Model

This SEP establishes the following ownership model for spans in a passback exchange:
- The MCP client creates a span for the tool call or resources read and passes its context via traceparent to the server.
- The MCP server creates a server span parented to that client span.
- The server returns the server span (and optional child spans) via `_meta.otel`.
- The client ingests these spans without modifying them.

This ensures a single client → server relationship in the distributed trace, no duplicate or phantom spans are introduced.

**Scope note:** This specification addresses single-hop telemetry passback between an MCP client and its directly connected MCP server. Multi-hop chain propagation, where an MCP server acts as a client to another MCP server is anticipated but deferred to a future SEP. To preserve trace continuity in multi-hop scenarios, servers that call external MCP tools **SHOULD** forward
 _meta.traceparent even if they do not support telemetry passback themselves.

### Public Span Model - Best Practices

The server determines which spans to return. The following best practices guide server implementers in constructing a useful public span set:

1. The response SHOULD contain a root server span representing the tool call or resources read, parented to the client's traceparent. This gives the client a single entry point to anchor the returned spans in its trace.
2. Servers SHOULD surface spans for major execution stages such as authentication, policy evaluation, and tool handler invocation as direct children of the root span. These provide a top-level breakdown of where time was spent and what decisions were made, without requiring the client to understand internal implementation details.
3. Span names and attributes SHOULD use generic labels rather than exposing internal service names, credentials, policy definitions, or business payloads. Servers SHOULD sanitize spans before returning them.
4.  When the tool is not executed (due to policy denial, authentication failure, or other pre-execution checks), servers MAY still return spans for the processing stages that did execute. Servers MAY include `_meta` span data in JSON-RPC error responses. Span status MAY be set independently of JSON-RPC error semantics.

## Rationale

### Design Decisions

- **Per-layer opt-in:** The server advertises support, and the client explicitly requests spans for each call. This ensures neither party is required to participate in telemetry exchange by default.
- **Standard OTLP representation:** Returned spans use unmodified OTLP JSON (`resourceSpans`) and are directly POSTable to any `/v1/traces` endpoint. No custom serialization or proprietary format is introduced.

**Why Not HTTP Server-Timing?**

Mechanisms such as [HTTP Server-Timing](https://www.w3.org/TR/server-timing) provide trace identifiers but do not provide span data. They still require access to the server's telemetry backend to retrieve actual spans, which is precisely the access that cross-organization MCP deployments lack. This SEP returns span data directly in the response, eliminating the need for shared backend access.

**How is this related to SEP-414?**

SEP-414 handles the request side of distributed tracing in MCP whereas this SEP handles the response side. Together, SEP-414 and this SEP enable complete bidirectional distributed tracing across MCP without requiring shared collectors or shared observability infrastructure.

## Backward Compatibility

This SEP introduces no backward-incompatible changes. It adds a new optional capability that existing MCP clients and servers can safely ignore if unrecognized.

- Servers that do not support telemetry passback omit `serverExecutionTelemetry` from their capabilities, and clients therefore do not request passback.
- Clients that do not support telemetry passback omit `otel` from request `_meta`, and servers therefore continue normal behavior.
- The change is purely additive and does not alter existing message semantics.

## Reference Implementation

A reference implementation is available in Arcade MCP in `feat/serverExecutionTelemetry` ([PR #797](https://github.com/ArcadeAI/arcade-mcp/pull/797)).

Explainer video: TBD

## Security Implications

Telemetry passback crosses organizational trust boundaries and therefore **MUST** be treated as potentially sensitive and untrusted.

**MCP servers**
- MUST NOT include secrets, credentials, tokens, or other sensitive data in returned telemetry.
- SHOULD apply the same data handling and redaction standards used for any other externally visible telemetry.

**MCP clients**
- MUST validate trace lineage against the originating request context, including the parent trace ID where applicable.
- SHOULD treat returned spans as untrusted external telemetry.
- SHOULD validate, sanitize, and apply appropriate storage or forwarding controls before exporting returned telemetry to downstream systems.

