# SEP: Canonical Media Type for MCP HTTP Transport (`application/mcp+json`)

**Status:** Proposal  
**Type:** Standards Track  
**Created:** 2026-03-05  
**Author:** Ryan Millett  
**Related:** SEP-1961 (Mandatory Security Headers), SEP-1960 (.well-known Discovery), Transport Working Group Roadmap (2025-12-19)

---

## Abstract

This SEP proposes the registration and mandatory use of a canonical structured media
type — `application/mcp+json` — for all MCP HTTP transport request and response
bodies. The absence of an MCP-specific media type currently prevents HTTP
infrastructure (load balancers, API gateways, WAFs, enterprise proxies) from
identifying, routing, and governing MCP traffic without parsing the JSON-RPC message
body. This proposal resolves that gap using a well-established HTTP convention that
requires no changes to the JSON-RPC message format or transport semantics.

---

## Motivation

### 1. MCP Traffic Is Currently Invisible to Infrastructure

MCP HTTP transport today uses `Content-Type: application/json` — the same media type
used by REST APIs, webhooks, GraphQL, and countless other protocols. This creates a
fundamental ambiguity: no piece of HTTP infrastructure can determine that a given
request is MCP traffic without inspecting and parsing the JSON body to look for
JSON-RPC fields such as `"jsonrpc"`, `"method"`, or `"id"`.

This matters because the MCP working group has explicitly identified infrastructure
routing as a first-class concern. The December 2025 Transport Working Group roadmap
states:

> "We're exploring ways to expose routing-critical information (such as the RPC method
> or tool name) via standard HTTP paths or headers. This would allow load balancers
> and API gateways to route traffic without parsing JSON bodies."

A canonical media type is the simplest, most standards-compliant first step toward
that goal. It makes MCP traffic identifiable at the HTTP layer — before any body
parsing occurs — using a mechanism that every piece of HTTP infrastructure already
understands natively.

### 2. The Absence Creates Documented Interoperability Bugs

The lack of an MCP-specific media type is not merely a theoretical concern. It has
produced real interoperability failures across multiple SDK implementations:

- The Java SDK throws a runtime exception for responses with unexpected media types
  (e.g., `text/plain`), because there is no canonical MCP type to validate against.
- The Postman MCP client rejects `application/json` responses in certain transport
  modes, despite servers returning it per the current spec.
- The Python SDK incorrectly rejects requests with RFC-compliant `Accept: */*`
  headers because it enforces a strict `application/json` match with no fallback.
- SDK implementations across Python, TypeScript, Java, and C# handle content-type
  negotiation inconsistently, leading to client-server incompatibilities.

A canonical media type resolves these ambiguities by giving all implementations a
single unambiguous type to produce and consume.

### 3. Enterprise Governance Requires Traffic Identification

As MCP moves from developer tooling into enterprise production deployments, governance
requirements demand that infrastructure be able to:

- Identify MCP traffic for policy enforcement without deep packet inspection
- Route MCP requests to MCP-aware policy engines and audit systems
- Apply MCP-specific WAF rules distinct from generic JSON API rules
- Enforce DLP policies that reason about MCP tool invocations as a distinct
  traffic class

These requirements are impossible to satisfy cleanly when MCP traffic is
indistinguishable from arbitrary `application/json` at the header level.

### 4. Precedent Is Well-Established

Structured media types with the `+json` suffix are the IANA-registered standard
pattern (RFC 6838) for JSON-derived protocols that require their own identity. The
pattern is in wide use across regulated industries:

| Media Type | Protocol |
|---|---|
| `application/fhir+json` | HL7 FHIR (healthcare) |
| `application/scim+json` | SCIM (identity provisioning) |
| `application/jose+json` | JOSE (JWT/signing) |
| `application/geo+json` | GeoJSON |
| `application/ld+json` | JSON-LD (semantic web) |
| `application/vnd.api+json` | JSON:API |

MCP is now Linux Foundation infrastructure. It warrants the same treatment.

---

## Specification

### 3.1 Media Type Definition

The canonical media type for MCP HTTP transport message bodies SHALL be:

```
application/mcp+json
```

This type is a structured syntax media type per RFC 6838 §4.2.8. Processors that
do not have explicit support for `application/mcp+json` MUST fall back to
`application/json` processing rules, as required by the structured syntax suffix
convention. This ensures backward compatibility with existing generic JSON tooling.

### 3.2 Request Requirements

MCP clients using HTTP transport (Streamable HTTP, SSE) MUST include the following
header on all POST requests containing a JSON-RPC message body:

```http
Content-Type: application/mcp+json
```

MCP clients SHOULD include `application/mcp+json` as the preferred type in the
`Accept` header, while retaining backward-compatible fallbacks:

```http
Accept: application/mcp+json, text/event-stream, application/json
```

### 3.3 Response Requirements

MCP servers using HTTP transport MUST include the following header on all responses
containing a JSON-RPC message body:

```http
Content-Type: application/mcp+json
```

MCP servers responding with an SSE stream retain the existing requirement:

```http
Content-Type: text/event-stream
```

SSE-framed JSON-RPC messages within the stream are implicitly typed by the enclosing
`text/event-stream` content type and are not subject to the `application/mcp+json`
requirement.

### 3.4 Server Validation

MCP servers SHOULD validate that incoming POST requests declare `Content-Type:
application/mcp+json`. During a transition period, servers MUST also accept
`Content-Type: application/json` to maintain backward compatibility with clients
that have not yet adopted this specification.

Servers MAY return `HTTP 415 Unsupported Media Type` for requests with neither
`application/mcp+json` nor `application/json` content types, after the transition
period defined in §3.7.

### 3.5 Infrastructure Routing

The primary motivation for this media type is enabling infrastructure-layer
identification and routing of MCP traffic. Conforming deployments enable the
following patterns without body parsing:

**Load balancer routing:**
```
if Content-Type = "application/mcp+json"
  → route to MCP server pool
```

**API gateway policy:**
```
if Content-Type = "application/mcp+json"
  → apply MCP rate limits
  → apply MCP auth requirements
  → forward to MCP policy engine
```

**WAF rule:**
```
if Content-Type = "application/mcp+json"
  → apply MCP-specific inspection ruleset
  → log to MCP audit trail
```

**Enterprise proxy:**
```
if Content-Type = "application/mcp+json"
  AND Authorization header present
  → introspect token scopes
  → evaluate against MCP DLP policy
  → permit or deny
```

None of these patterns require JSON body parsing. The media type header alone is
sufficient for infrastructure routing decisions.

### 3.6 Relationship to Proposed Routing Headers

The December 2025 Transport Working Group roadmap proposes exposing additional
routing metadata — such as the JSON-RPC method name and tool name — as HTTP headers,
to enable more granular infrastructure routing without body parsing.

`application/mcp+json` is complementary to and independent of those proposals. It
answers a prior question — "is this MCP traffic at all?" — that the proposed
method/tool headers presuppose. The recommended complete header set, when those
proposals are adopted, would be:

```http
Content-Type: application/mcp+json       ← this SEP: "this is MCP traffic"
Mcp-Protocol-Version: 2025-11-25         ← existing: protocol version
Mcp-Session-Id: {session-id}             ← existing: session tracking
Mcp-Method: tools/call                   ← proposed: operation type
Mcp-Tool-Name: send_email                ← proposed: specific tool
Authorization: Bearer {token}            ← existing: identity
```

This header set gives infrastructure complete routing context without touching the
request body.

### 3.7 Transition and Backward Compatibility

This proposal is explicitly designed for zero-breaking-change adoption:

**Phase 1 — Opt-in (immediate):** Clients and servers MAY begin sending
`application/mcp+json`. Recipients MUST accept it as equivalent to
`application/json` for all processing purposes.

**Phase 2 — Recommended (next spec revision):** The specification SHOULD declare
`application/mcp+json` as the RECOMMENDED content type for MCP HTTP transport.
`application/json` remains accepted.

**Phase 3 — Required (future spec revision, with notice):** After sufficient
ecosystem adoption, the specification MAY require `application/mcp+json` for new
client implementations, with `application/json` retained for backward compatibility
with legacy clients.

At no point in this transition does a conforming server break a conforming client
that has not yet adopted this type.

### 3.8 IANA Registration

The authors intend to register `application/mcp+json` with IANA per RFC 6838
following working group acceptance of this SEP. The registration will reference
the MCP specification maintained by the Agentic AI Foundation under the Linux
Foundation.

Registration template (abbreviated):

```
Type name:              application
Subtype name:           mcp+json
Required parameters:    none
Optional parameters:    none
Encoding considerations: Same as application/json (RFC 8259)
Security considerations: See MCP specification security section.
                         Receivers MUST NOT execute content solely
                         on the basis of this media type.
Interoperability:       Processors without explicit mcp+json support
                        MUST fall back to application/json rules
                        per RFC 6838 §4.2.8 structured syntax suffix
                        conventions.
Published specification: https://modelcontextprotocol.io/specification
Applications that use this type: MCP clients and servers using HTTP transport
```

---

## Security Considerations

### MIME Sniffing Prevention

Clients and servers implementing this SEP SHOULD also implement
`X-Content-Type-Options: nosniff` (per SEP-1961) to prevent browsers and
intermediaries from overriding the declared media type. The combination of a
canonical MCP media type and MIME sniffing prevention closes the MIME confusion
attack vector identified in SEP-1961.

### No Privilege Escalation

The media type declaration carries no authority. Infrastructure MUST NOT grant
elevated trust to a request solely because it declares `application/mcp+json`.
Authentication, authorization, and scope validation via OAuth (per the June 2025
spec update) remain required and are unaffected by this proposal.

### Prompt Injection Boundary

Declaring a canonical media type creates a well-defined boundary that WAF rules
and content inspection systems can target for prompt injection detection — a class
of attack specific to MCP that generic `application/json` rules cannot target
without false positives from non-MCP traffic.

---

## Alternatives Considered

### A. Custom `X-MCP-*` Request Header

A custom request header (e.g., `X-MCP-Traffic: true`) could signal MCP traffic
without changing the Content-Type. This was rejected because:

- `X-` prefixed headers are deprecated per RFC 6648
- Content-Type is the semantically correct HTTP mechanism for describing payload type
- Custom headers provide no interoperability with existing infrastructure that
  already routes on Content-Type

### B. URL Path Convention

Requiring MCP endpoints to use a specific URL path (e.g., `/mcp`) was considered.
This was rejected because:

- It constrains server deployment flexibility
- It does not work for clients that cannot control server URLs (e.g., third-party
  hosted MCP servers)
- URL paths are not consistently accessible to all infrastructure layers
- SEP-1612 (closed) explored this direction and was not accepted

### C. No Change / Body Inspection

Continuing to use `application/json` and requiring infrastructure to inspect the
body to identify MCP traffic was rejected because it:

- Requires stateful body parsing at the infrastructure layer
- Imposes latency and compute overhead on every request
- Is incompatible with streaming and SSE responses where the body is not
  immediately available
- Is the status quo that has produced the documented interoperability bugs above

---

## Open Questions

1. **Charset parameter:** Should the type be `application/mcp+json` or
   `application/mcp+json; charset=utf-8`? MCP messages are always UTF-8; making
   this explicit may reduce ambiguity for some parsers, at the cost of minor
   verbosity.

2. **SSE framing:** Should individual SSE `data:` events within a
   `text/event-stream` response declare `application/mcp+json` in event metadata?
   This is out of scope for the HTTP Content-Type header but may be relevant to
   SSE-level tooling.

3. **Versioned subtypes:** Should the type include a version parameter
   (e.g., `application/mcp+json; version=2025-11-25`)? This would allow
   infrastructure to route based on protocol version, but adds complexity and may
   duplicate the role of the existing `Mcp-Protocol-Version` header.

---

## References

- RFC 6838 — Media Type Specifications and Registration Procedures
- RFC 8259 — The JavaScript Object Notation (JSON) Data Interchange Format
- RFC 6648 — Deprecating the "X-" Prefix
- RFC 7231 — HTTP/1.1 Semantics (Content-Type, Accept)
- MCP Specification 2025-11-25 — https://modelcontextprotocol.io/specification/2025-11-25
- MCP Transport Working Group Roadmap (2025-12-19) — https://blog.modelcontextprotocol.io/posts/2025-12-19-mcp-transport-future/
- SEP-1961 — Mandatory Security Headers for MCP HTTP Transport
- SEP-1960 — .well-known/mcp Discovery Endpoint

---

## Acknowledgements

This proposal was informed by observed interoperability failures across the MCP SDK
ecosystem and by the enterprise governance requirements emerging as MCP moves into
production deployments in regulated industries.
