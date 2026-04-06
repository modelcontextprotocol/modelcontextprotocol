# SEP-0000: Remote Server Deployment Guidelines

- **Status**: Draft
- **Type**: Informational
- **Created**: 2026-04-05
- **Author(s)**: Jeff Yaw jeff@yaw.sh (@jeffyaw)
- **Sponsor**: None (seeking sponsor)
- **PR**: #0000

## Abstract

This SEP documents operational guidelines and best practices for deploying MCP servers as remote HTTP services. Based on production experience running multi-tenant MCP proxy infrastructure, it addresses three areas where the current specification provides limited guidance: (1) session affinity requirements for stateful servers behind load balancers, (2) a standard server discovery mechanism via `.well-known/mcp`, and (3) proxy-layer considerations for Streamable HTTP transport.

This is an informational document. It introduces no changes to the core protocol.

## Motivation

The MCP specification defines the Streamable HTTP transport for remote server communication but provides limited guidance on how servers should be deployed and operated in production environments. As more organizations deploy MCP servers as remote services, several operational gaps have emerged:

- **Session affinity** ([#2064](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/2064)): Stateful MCP servers that use `MCP-Session-Id` require sticky routing when deployed behind load balancers. The spec defines the header but does not specify how infrastructure should handle routing. As noted in the issue discussion, this is "an important and sometimes tricky thing to get right."

- **Server discovery**: There is no standard mechanism for MCP clients to discover a remote server's metadata, transport requirements, or authentication method before establishing a session. Clients must attempt a full `initialize` handshake to learn what the server supports, which prevents building server directories or pre-validating compatibility.

- **Proxy considerations**: Reverse proxies and API gateways introduce specific challenges for Streamable HTTP -- SSE buffering, connection timeouts, DNS rebinding, and header forwarding -- that are not addressed in the transport specification. These are common stumbling blocks for anyone putting MCP servers behind infrastructure like nginx, Caddy, or cloud load balancers.

These gaps create friction for organizations deploying MCP servers as remote services and for platforms hosting MCP servers on behalf of developers. This SEP aims to collect what we have learned and share it with the community.

## Specification

### 1. Session Affinity for Stateful Servers

#### Problem

When an MCP server is deployed with multiple replicas behind a load balancer, the `MCP-Session-Id` returned during initialization must be routed to the same backend instance on subsequent requests. Standard round-robin or least-connections load balancing breaks stateful sessions, typically resulting in HTTP 404 responses on the second request.

#### Recommendation

Infrastructure operators deploying stateful MCP servers SHOULD implement session-affinity routing using the `MCP-Session-Id` header:

1. On receiving an `initialize` response from the upstream server, the proxy or load balancer SHOULD extract the `MCP-Session-Id` header and create a mapping from that session ID to the specific backend instance.

2. On subsequent requests containing an `MCP-Session-Id` header, the proxy SHOULD route the request to the mapped backend instance.

3. If the mapped backend is unavailable, the proxy SHOULD:
   - Clear the stale session mapping.
   - Return HTTP 404 (per the existing spec requirement for expired sessions).
   - The client will then re-initialize per the spec's session management rules.

4. Session mappings SHOULD have a TTL (recommended: 1 hour) to prevent unbounded growth of the mapping store.

5. The session mapping store SHOULD be shared across all proxy instances to handle proxy-level failover.

#### Implementation Notes

A minimal implementation stores `mcp_session:{sessionId} -> backendUrl` in a shared key-value store (e.g., Redis, Valkey) with a TTL. This adds roughly 1ms of latency per request for the lookup, which is negligible compared to typical MCP request latency. We have run this pattern in production serving traffic across hundreds of MCP server instances on Kubernetes, where the default Service load balancing was breaking stateful sessions on the second request.

An alternative approach, as discussed in [#2064](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/2064), is to externalize all session state so that any backend can handle any request. This eliminates the need for affinity but places a larger implementation burden on server authors. Both approaches are valid; the right choice depends on the deployment context.

### 2. Server Discovery via `.well-known/mcp`

#### Problem

MCP clients connecting to a remote server must currently attempt a full `initialize` handshake to discover the server's capabilities, supported protocol versions, and authentication requirements. This means clients cannot:

- Display server metadata before connecting.
- Pre-validate authentication requirements.
- Determine if the server supports the client's protocol version.
- Show the server's available tools in a catalog or registry.

#### Recommendation

Remote MCP servers MAY expose a discovery document at `/.well-known/mcp` on their HTTP endpoint. This document is a JSON object with the following structure:

```json
{
  "name": "My MCP Server",
  "description": "A server that provides weather data tools",
  "provider": {
    "name": "Example Corp",
    "url": "https://example.com"
  },
  "mcp": {
    "transport": "streamable-http",
    "endpoint": "https://weather.example.com/mcp",
    "protocolVersions": ["2025-11-25"]
  },
  "auth": {
    "required": true,
    "type": "bearer",
    "instructions": "Pass your API key via Authorization: Bearer <key>"
  },
  "tools": ["get_weather", "get_forecast"]
}
```

The discovery endpoint:

- MUST return `Content-Type: application/json`.
- SHOULD set `Cache-Control: public, max-age=300`.
- SHOULD set `Access-Control-Allow-Origin: *` to allow browser-based clients.
- MUST NOT require authentication.
- MUST NOT return sensitive information (secrets, internal URLs, etc.).

This is an opt-in mechanism. Servers that do not expose this endpoint are not non-compliant. The pattern follows established conventions such as `.well-known/openid-configuration` and `.well-known/webfinger` ([RFC 8615](https://www.rfc-editor.org/rfc/rfc8615)).

### 3. Proxy-Layer Considerations for Streamable HTTP

#### Problem

The Streamable HTTP transport specification defines client-server communication but does not address the behavior of intermediate proxies, load balancers, or API gateways. These intermediaries can break SSE streaming through buffering, timeout, or header manipulation. This is especially common in production deployments where MCP traffic passes through one or more reverse proxies.

#### Recommendations for Proxy Operators

1. **SSE Buffering**: Proxies MUST NOT buffer SSE events. The `X-Accel-Buffering: no` header (nginx) or equivalent SHOULD be set on SSE responses. The proxy SHOULD detect `Content-Type: text/event-stream` and switch to streaming mode.

2. **Connection Timeouts**: Proxies SHOULD set a longer timeout for SSE connections than for standard HTTP requests. A minimum of 30 seconds is recommended, with heartbeat events every 15 seconds to keep connections alive through intermediate infrastructure.

3. **Header Forwarding**: Proxies MUST forward the following headers transparently:
   - `MCP-Session-Id` (both directions)
   - `MCP-Protocol-Version` (client to server)
   - `Accept` (client to server, must include `text/event-stream`)
   - `Last-Event-ID` (client to server, for SSE resumption)

4. **Backpressure**: When streaming SSE from upstream to client, the proxy SHOULD implement backpressure handling -- pause reading from upstream when the client connection's write buffer is full, and resume on drain.

5. **SSRF Protection**: Proxies that accept user-configured backend URLs MUST validate those URLs against private IP ranges ([RFC 1918](https://www.rfc-editor.org/rfc/rfc1918)), loopback addresses, link-local addresses, and cloud metadata endpoints (e.g., `169.254.169.254`). DNS resolution SHOULD be verified on every request, not just at configuration time, to prevent DNS rebinding attacks.

6. **Payload Logging**: Proxies SHOULD NOT log request or response bodies, as MCP traffic may contain sensitive data including user context and tool outputs. Metadata logging (status codes, latency, tool names from headers) is acceptable.

## Rationale

These recommendations are based on production experience running a multi-tenant MCP proxy platform ([mcp.hosting](https://mcp.hosting)) serving traffic across hundreds of MCP servers. The specific patterns were developed iteratively in response to real failures:

- **Session affinity via Redis** was adopted after observing that Kubernetes Service load balancing broke stateful MCP sessions on the second request. Cookie-based affinity was considered but rejected because MCP clients are typically not browsers and may not handle cookies. Header-based affinity using the existing `MCP-Session-Id` is more universal and requires no protocol changes.

- **The `.well-known/mcp` discovery pattern** was motivated by the need to populate a server directory without requiring full initialization handshakes against every registered server. GraphQL-style introspection was considered but rejected because it would require changes to the core protocol; a static JSON document at a well-known URL is simpler and does not affect the protocol itself.

- **The SSRF protection recommendations** were developed after identifying that DNS rebinding could bypass URL validation performed only at server registration time. The fail-closed approach (block on DNS resolution failure) is recommended over fail-open.

- **Server-side session externalization** (storing all state in a database rather than using affinity) was considered as an alternative to session affinity. While it eliminates the routing requirement entirely, it places a significant implementation burden on every MCP server author. Both approaches are valid and may be appropriate in different contexts.

## Backward Compatibility

This SEP is purely informational and introduces no changes to the core protocol. All recommendations are opt-in. Existing MCP servers and clients are unaffected.

The `.well-known/mcp` endpoint is additive -- clients that do not support discovery continue to work via the standard `initialize` handshake. Servers that do not expose the endpoint are fully compliant.

## Security Implications

- The `.well-known/mcp` discovery endpoint MUST NOT expose sensitive information. Tool names and capability declarations are considered public metadata. The endpoint must not require authentication, so anything it returns should be safe for public consumption.

- Session affinity introduces a state store (e.g., Redis) that becomes a dependency for routing. Operators should ensure this store is highly available and consider the impact of store unavailability on session routing.

- SSRF protection is critical for any proxy or hosting platform that accepts user-defined backend URLs. DNS rebinding is the most subtle attack vector; validating the resolved IP address on every request (not just at configuration time) is essential.

- Proxies should avoid logging MCP request and response bodies, which may contain sensitive user data, tool outputs, or credentials passed as tool arguments.

## Reference Implementation

A reference implementation of all three recommendations is available at [mcp.hosting](https://mcp.hosting):

- Session affinity via Valkey-backed `MCP-Session-Id` routing in the proxy layer.
- `.well-known/mcp` discovery endpoint on all hosted servers.
- Streamable HTTP proxy with backpressure handling, SSRF protection via DNS re-validation, and transparent header forwarding.

The proxy is built on Fastify and undici, running on EKS with Caddy as the TLS termination layer. The implementation is operational and serving production traffic.
