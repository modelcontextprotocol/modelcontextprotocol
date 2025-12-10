# SEP-1932: DPoP Profile for MCP

> **Note**: This SEP defines an optional security extension for MCP that enables sender-constrained access tokens through DPoP (RFC 9449: Demonstrating Proof of Possession).

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2025-12-05
- **Author(s)**: Pieter Kasselman
- **Sponsor**: Darin McAdams
- **PR**: https://github.com/modelcontextprotocol/ext-auth/blob/pieterkas-dpop-extension/specification/draft/dpop-extension.mdx

## Abstract

This SEP defines an optional DPoP (Demonstrating Proof of Possession) extension for the Model Context Protocol to support sender-constrained access tokens. The extension binds OAuth 2.0 access tokens to cryptographic key pairs controlled by MCP clients, requiring clients to demonstrate possession of the corresponding private key with each request. To align DPoP with MCP’s single-endpoint architecture, the extension incorporates a content digest into the DPoP proof, allowing the proof to be tied to the specific JSON-RPC request body and ensuring tighter request-level binding.

## Motivation

MCP’s current authorization model uses bearer tokens, which can be reused by an unauthorized party if the token is leaked or intercepted. If an access token is intercepted—through network eavesdropping, compromised logs, or other means—an attacker can use it to access protected MCP resources until the token expires.

DPoP addresses this by making tokens "sender-constrained": even if an attacker intercepts an access token, they cannot use it without also possessing the client's private key. This significantly raises the bar for attackers.

MCP's architecture presents a unique security challenge: all JSON-RPC requests use the same HTTP endpoint and method (POST). Standard DPoP binds proofs to the endpoint and HTTP method but not to the request payload, allowing intercepted proofs to be replayed with different message bodies within the validity window. This SEP addresses this by requiring a content digest in DPoP proofs, binding each proof cryptographically to a specific request body.

This extension is particularly valuable for:

- High-security environments handling sensitive data
- Long-lived access tokens
- Deployments where token theft risk is elevated
- Compliance requirements mandating proof of possession

## Specification

The DPoP Profile for MCP adapts OAuth 2.0 sender-constrained tokens for use in the Model Context Protocol’s single-endpoint architecture. Standard DPoP binds proofs to the HTTP method and URL, but in MCP all requests use the same method (POST) and endpoint, with the specific operation conveyed in the JSON-RPC body. As a result, traditional DPoP does not distinguish between different MCP operations, since the request semantics are not reflected in the elements covered by the proof. The profile refines the content of the DPoP proof to better account for this characteristic of MCP.

To solve this, the profile adds one key requirement: DPoP proofs must include a cryptographic digest of the JSON-RPC request body (`content_digest`). This binds each proof to a specific request payload, preventing attackers from replaying valid proofs with altered bodies.

The design emphasizes:

- **Payload binding** — eliminating replay attacks without requiring server-side state.
- **Statelessness** — servers do not need to track jti values.
- **Compatibility** — minimal, targeted changes that keep DPoP and OAuth flows standard.
- **Scalability** — suitable for distributed MCP servers.

This proposal adapts DPoP for more tailored use with MCP, enabling each request to be cryptographically linked to its corresponding DPoP proof. A detailed proposal is described at https://github.com/modelcontextprotocol/ext-auth/blob/pieterkas-dpop-extension/specification/draft/dpop-extension.mdx

## Rationale

The purpose of this extension is to adapt OAuth 2.0 DPoP to the architectural realities of the Model Context Protocol (MCP), ensuring sender-constrained access tokens can be used safely in an environment where traditional DPoP protections are insufficient on their own. While RFC 9449 defines a general-purpose proof-of-possession mechanism, MCP’s single-endpoint, request-tunneled design introduces replay risks that the standard DPoP mechanism does not fully mitigate. This profile specifies targeted, minimal additions—most notably, mandatory request-payload binding—to close those gaps without introducing significant complexity or statefulness.

### 1. Single-Endpoint Architecture Increases Replay Risk

In typical RESTful APIs, DPoP proofs are inherently bound to the specific method and path of each request, limiting their replay value. MCP’s design, however, uses:

- A single HTTP endpoint, and
- A single HTTP method (`POST`),
- With all semantic variation encoded in the JSON-RPC message body.

This means the `htu` and `htm` claims in a standard DPoP proof carry little entropy—they do not meaningfully differentiate purposes or operations. As a result, an attacker who obtains a proof (and valid token) during the proof validity window could replay it with a different JSON-RPC payload, gaining unauthorized access to operations the original client never invoked.

This is a threat unique to protocols like MCP that multiplex operations within a uniform transport envelope.

### 2. Binding the Proof to the Request Payload Closes This Gap

The introduction of a `content_digest` claim binds the DPoP proof to a cryptraphic digest of the JSON-RPC request body. This elevates the binding from _endpoint only_ to _endpoint + payload_, eliminating the value of reusing proofs with modified JSON-RPC messages.

This approach was chosen because:

- It leverages existing IETF work (RFC 9530) rather than inventing a new digest syntax,
- It adds no state requirements for servers,
- It maintains compatibility with existing DPoP libraries and flows,
- It is transport-agnostic and does not require TLS extensions or multi-endpoint APIs.

### 3. Stateless Replay Protection Is Critical for MCP Deployability

MCP servers are expected to run in scalable, distributed environments. Stateful replay detection (e.g., global `jti` tracking) would impose:

- Infrastructure overhead (centralized storage or synchronization),
- Latency penalties,
- Operational coupling between nodes.

Because MCP already has a single-endpoint active attack surface, requiring `content_digest` provides strong, per-request replay defense **without** requiring server-side state. Servers may still track `jti` values for high-assurance use cases, but the protocol does not depend on it.

## Backward Compatibility

This is an optional extension with no backward compatibility concerns. Existing MCP implementations continue to work unchanged. Implementations adopting DPoP can do so incrementally:

- Authorization servers can support both bearer and DPoP tokens simultaneously
- Clients can be upgraded independently
- MCP servers can accept both token types during migration

The extension is designed for graceful coexistence with existing bearer token deployments.

## Security Implications

This extension protects against:

- **Token theft and replay**: Even if tokens are intercepted, attackers cannot use them without the private key
- **Request tampering**: Content digests prevent modification of request bodies during replay
- **Network-based attacks**: DPoP significantly reduces value of network eavesdropping

DPoP does not protect against:

- **Client compromise**: If an attacker gains full access to the client system, they can access the private key and generate valid proofs
- **Authorization-level attacks**: DPoP binds tokens to clients but doesn't address confused deputy or privilege escalation vulnerabilities

## Reference Implementation

A reference implementation will be provided demonstrating:

- Client-side DPoP proof generation
- MCP server-side proof validation
- Authorization server metadata configuration
- Example integration with existing MCP implementations

Links will be added when implementations are available.

## Performance Implications

DPoP introduces modest performance overhead:

- **Client-side**: Additional cryptographic signing operation per request
- **Server-side**: Additional signature verification and content digest validation per request
- **Network**: Slightly larger HTTP headers due to DPoP proof JWT

These costs are generally negligible compared to overall request processing time.

The stateless design minimizes server-side overhead by avoiding the need to maintain proof tracking databases.

## Testing Plan

Implementations should cover:

1. **Proof generation**: Correct formatting of all required claims including content digest
2. **Content digest calculation**: Accurate SHA-256 hashing and base64 encoding
3. **Validation logic**: All validation steps per specification
4. **Error handling**: Appropriate HTTP 401 responses with error details
5. **Time window**: Correct handling of `iat` claims at boundaries
6. **Algorithm support**: All declared algorithms work correctly

Test vectors will be provided in the reference implementation.

## Alternatives Considered

### HTTP Message Signatures

We considered RFC 9421 (HTTP Message Signatures) as an alternative to content digests. However, this would add complexity without significant benefit for MCP's use case. Content digests provide the needed payload binding with simpler implementation requirements.

### Mandatory jti Tracking

Making `jti` tracking mandatory would provide stronger replay protection but at significant operational cost. The stateless design better fits MCP's scalability goals while still providing substantial security improvements through content digest validation.

### Nonce-based Approach

Server-provided nonces (per RFC 9449 Section 9) could replace time-based validation but require additional round-trips and server state. This specification makes nonces optional, allowing implementations to choose based on their security requirements.

## Open Questions

1. **Server supplied nonces**: A server-supplied nonce mechanism is generally not recommended because it often requires servers to maintain state (e.g., tracking which nonces have been issued and used). An alternative is a stateless nonce design, where the server provides a nonce constructed from predictable values such as the current time prefixed to a salted hash of the current time and a `client_id`. This provides a freshness guarantee without requiring nonce storage. The server simply accepts any nonce within a defined time window. This could provide a significant improvement in replay protection because the nonce’s validity is tied to its short lifetime while potentially cryptographically bound to the client (or other information). This approach avoids the need for additional content-hashing requirements and would eliminate the need for MCP-specific modifications to DPoP implementations, at the cost of an extra round-trip at the start of an MCP client/server interaction. We invite discussion on whether this stateless-nonce approach could serve as a viable alternative to introducing content digests.
2. **Algorithm recommendations**: Should future revisions mandate specific algorithms (e.g., ES256 minimum)?
3. **Validity window tuning**: Should different validity windows be allowed for different security contexts?
4. **Content digest extensions**: Should we support hash algorithms beyond SHA-256?

## Acknowledgments

This specification builds upon the OAuth DPoP work done by the OAuth Working Group and adapts it for MCP's unique architectural requirements.
