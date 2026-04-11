# SEP-1932: DPoP Profile for MCP

> **Note**: This SEP defines an optional security extension for MCP that enables sender-constrained access tokens through DPoP (RFC 9449: Demonstrating Proof of Possession).

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2025-12-05
- **Author(s)**: Pieter Kasselman
- **Sponsor**: Darin McAdams
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1932

## Abstract

This SEP defines DPoP (Demonstrating Proof of Possession) as an optional extension for the Model Context Protocol to support sender-constrained access tokens. The extension binds OAuth 2.0 access tokens to cryptographic key pairs controlled by MCP clients, requiring clients to demonstrate possession of the corresponding private key with each request. The proposal uses OAuth 2.0 Demonstrating Proof-of-Possession at the Application Layer (DPoP) ([RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449)).

## Motivation

MCP’s current authorization model uses bearer tokens, which can be reused by an unauthorized party if the token is leaked, intercepted or exfiltrated. If an access token is intercepted, through network eavesdropping, compromised logs, or other means, an attacker use the token from a MCP client under its control to access protected MCP resources until the token expires.

DPoP addresses this by making tokens "sender-constrained" so that even if an attacker obtains an access token, they cannot use it without also possessing or controlling the correspondiong client's private key. This significantly raises the bar for attackers.

This extension is particularly valuable for:

- High-security environments handling sensitive data
- Long-lived access tokens
- Deployments where token theft risk is elevated
- Compliance requirements mandating proof of possession or sender constrained tokens

## Specification

This extension requries OAuth 2.0 Demonstrating Proof-of-Possession at the Application Layer (DPoP) ([RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449)) for use in the Model Context Protocol. This proposal does not define extensions to ([RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449)) to maximise interoperability, simplify implementation and accelerate deployment while preserving the security properties to minimise the risks that arise from token exfiltration and replay required for MCP clients and servers. It does not preclude the use of the extension mechanisms defined in [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449).

### Stateless DPoP Proof Replay Protection

[RFC 9449 Section 11.1](https://www.rfc-editor.org/rfc/rfc9449.html#name-dpop-proof-replay) provides specific guidance on replay protection mechanisms that adress the risks of a DPoP Proofs being replayed.

MCP servers that is not capable of keeping state or perform global `jti` tracking provides DPoP proof replay protection by enforcing short `iat` acceptance windows of +/- 5 minutes and standard RFC 9449 claim validation. A stateless MCP server may provide additional replay protection by using a server supplied nonce as defined in [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) (e.g. by using an encrypted timestamp as the nonce value which can be decrypted, parsed and verified to be within an acceptable time window when returned in DPoP Proof) (e.g. by encrypting a timestamp using an Authenticated Encryption with Associated Data (AEAD) scheme which can be decrypted, parsed and verified to be within an acceptable time window when returned in DPoP Proof).

## Rationale

The purpose of this extension is to define a mechanism to sender constrain OAuth Access Tokens in MCP deployments using OAuth 2.0 Demonstrating Proof-of-Possession at the Application Layer (DPoP) ([RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449)).

This SEP intentionally adopts DPoP as defined in RFC 9449, without introducing MCP-specific claims, request body digests, or additional proof material. This design choice reflects a deliberate trade-off in favor of interoperability, deployability, and alignment with existing OAuth 2.0 security models.

[RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) already provides the core security properties for sender constraining OAuth Access Tokens. When combined with TLS transport-layer security and appropriate token and proof lifetimes, these mechanisms are sufficient to significantly reduce the risks associated with token exfiltration and replay in MCP deployments, even if the MCP server is not capable of maintaining global state.

## Backward Compatibility

This is an optional extension with no backward compatibility concerns. Existing MCP implementations continue to work unchanged. [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) is designed for graceful coexistence with existing bearer token deployments. Implementations adopting DPoP can do so incrementally:

- Authorization servers can support both bearer and DPoP tokens simultaneously
- Clients can be upgraded independently
- MCP servers can accept both token types during migration

## Security Implications

This extension protects against:

- **Token theft and replay**: Even if tokens are intercepted, attackers cannot use them without access or control over the private key
- **Proof theft and replay**: DPoP Proof replay mechanisms protect against proof replay. If an MCP server is unable to maintain state, short-lived DPoP proofs limits the exposure window while the server supplied nonce provides the MCP server to force the generation of a fresh DPoP proof to further limit the risk that a DPoP proof is being replayed.
- **Network-based attacks**: DPoP significantly reduces value of network eavesdropping.

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
- **Server-side**: Additional cryptographic signature verification per request
- **Network**: Slightly larger HTTP headers due to DPoP proof JWT
- **Latency**: An extra round-trip for the first MCP server supplied nonce.

These costs are generally negligible compared to overall request processing time.

## Testing Plan

Implementations should cover:

1. **Proof generation**: Correct formatting of all required claims including content digest.
2. **Content digest calculation**: Accurate SHA-256 hashing and base64 encoding.
3. **Validation logic**: All validation steps per specification.
4. **Error handling**: Appropriate HTTP 401 responses with error details.
5. **Time window**: Correct handling of `iat` claims at boundaries.
6. **Algorithm support**: All declared algorithms work correctly.

Test vectors will be provided in the reference implementation.

## Alternatives Considered

### HTTP Message Signatures

We considered RFC 9421 (HTTP Message Signatures) as an alternative. However, the use of HTTP Message signatures for sender constraining tokens have not been standardised by the OAuth community.

### Custom content signing extension

An earlier draft of this SEP proposed a custom extension using the mechanisms defined in [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) that cryptographically bound the request body to the DPoP proof. This approach was not selected because it significantly increased implementation and operational complexity without providing sufficient additional security benefit. The final design therefore adopts DPoP as defined in [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) to maximize interoperability, simplicity, and deployability.

## Open Questions

1. **Algorithm recommendations**: Should future revisions mandate specific algorithms (e.g., ES256 minimum)?
2. **Validity window tuning**: Should different validity windows be allowed for different security contexts?

## Acknowledgments

This specification builds upon the OAuth 2.0 Demonstrating Proof-of-Possession at the Application Layer (DPoP) ([RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449)) and was refined based on input from Brian Campbell, one of the authors of ([RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449)).

## Additional details

A more detailed proposal can be viewed here: https://github.com/modelcontextprotocol/ext-auth/blob/pieterkas-dpop-extension/specification/draft/dpop-extension.mdx
