# SEP-0000: MCP Server Identity and Tool Attestation

- **Status**: Draft
- **Type**: Extensions Track
- **Created**: 2026-02-17
- **Author(s)**: Abdel Fane (@abdelsfane)
- **Sponsor**: None (seeking sponsor)
- **PR**: TBD (will be assigned on submission)

## Abstract

This SEP proposes an optional extension for cryptographic server identity and tool attestation in MCP. It defines mechanisms for MCP servers to present verifiable identities using Ed25519 key pairs, sign tool definitions to prove provenance, and allow clients to verify server identity via challenge-response. All capabilities are optional and backward-compatible with existing MCP deployments.

## Motivation

MCP currently has no mechanism for a client to verify the identity of a server it connects to, nor can a client verify that tool definitions have not been tampered with in transit or at rest. This creates several security gaps:

**1. Server Impersonation.** An attacker can deploy an MCP server that claims to be a legitimate service (e.g., a database tool) but exfiltrates data or injects malicious instructions. Without cryptographic identity, the client has no way to distinguish the real server from the impersonator. The OWASP MCP Top 10 identifies related risks in MCP09:2025 (Shadow MCP Servers) and MCP07:2025 (Insufficient Authentication & Authorization).

**2. Tool Definition Tampering.** Tool schemas define the contract between the client and server. If an attacker modifies tool definitions (e.g., adding hidden parameters, altering descriptions to manipulate LLM behavior), the client cannot detect the change. Invariant Labs disclosed tool poisoning attacks where modified tool descriptions cause LLMs to exfiltrate sensitive data. The OWASP MCP Top 10 lists this as MCP03:2025 (Tool Poisoning).

**3. No Provenance Chain.** When tools are distributed through registries, package managers, or marketplace listings, there is no way to verify that a tool's definition matches what the original author published. The tool may have been modified at any point in the distribution chain. The OWASP MCP Top 10 identifies this as MCP04:2025 (Software Supply Chain Attacks & Dependency Tampering).

**4. Lack of Mutual Authentication.** MCP authorization (SEP-990, SEP-991, SEP-1046) focuses on client-to-server OAuth flows. There is no mechanism for a server to prove its identity to a client, nor for bidirectional trust establishment needed in multi-agent delegation scenarios. Tomasev et al. discuss the need for transitive accountability via signed attestations and trust establishment mechanisms in agent-to-agent delegation.

These gaps are not theoretical. Known MCP server vulnerabilities include missing path validation in mcp-server-git (CVE-2025-68145, CWE-22), and the broader class of tool poisoning attacks has been demonstrated by multiple security researchers.

### Why an Extension?

Server identity is an additive capability that does not modify existing protocol behavior. Servers that do not implement this extension continue to function normally. Clients that do not support this extension simply ignore the identity metadata. The MCP Extensions framework (SEP-2133) is the appropriate mechanism for optional security enhancements.

**When identity matters most:** Server identity is most valuable for remote/network servers, marketplace-distributed servers, and multi-agent deployments where the client does not control the server lifecycle. For local servers launched by the client via stdio (e.g., development tools), the client already has implicit trust through process control. Making identity an extension allows deployments to adopt it where it provides real security value.

## Specification

### Extension Metadata

- **Extension URI**: `io.modelcontextprotocol/server-identity`
- **Version**: `1.0.0`
- **Capability**: Optional, not required for basic MCP operation

Servers that support this extension MUST declare it in the `initialize` response:

```json
{
  "protocolVersion": "YYYY-MM-DD",
  "capabilities": {
    "extensions": {
      "io.modelcontextprotocol/server-identity": {
        "version": "1.0.0"
      }
    }
  },
  "serverInfo": {
    "name": "example-server",
    "version": "1.0.0"
  }
}
```

The server MUST also provide its identity via the extension-specific data mechanism. Clients that negotiate this extension can retrieve identity metadata as described below.

### 1. Server Identity

#### 1.1 Key Pair

Each MCP server that implements this extension MUST generate and maintain an Ed25519 key pair. The public key serves as the server's identity.

**Key representation** uses JWK format (RFC 7517):

```json
{
  "kty": "OKP",
  "crv": "Ed25519",
  "x": "<base64url-encoded 32-byte public key>",
  "kid": "<unique key identifier>",
  "use": "sig"
}
```

The **Key ID (`kid`)** MUST be a stable, unique identifier for the key. Implementations SHOULD derive the `kid` from the public key material (e.g., base64url-encoded SHA-256 hash of the raw public key, truncated to 16 bytes) to ensure reproducibility.

#### 1.2 Identity Metadata

The server provides identity metadata via the `identity/get` method (see Section 3). The metadata structure:

```json
{
  "publicKey": {
    "kty": "OKP",
    "crv": "Ed25519",
    "x": "lhxR4x4bHk1gVz7XJdh0WuCGnt0bJq6BsJxpx7Vmq3g",
    "kid": "srv-a1b2c3d4e5f6g7h8"
  },
  "attestations": [
    {
      "type": "self",
      "signedAt": "2026-02-17T00:00:00Z",
      "signature": "<base64url-encoded Ed25519 signature over canonical identity>"
    }
  ]
}
```

#### 1.3 Attestation Types

Attestations provide evidence about the server's identity. Each attestation is a signed statement from a specific party.

| Type        | Description                              | Signer                   | Security Value                                                                             |
| ----------- | ---------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------ |
| `self`      | Server signs its own public key metadata | Server's own Ed25519 key | Enables key pinning; proves key possession. Does NOT prove real-world identity on its own. |
| `publisher` | Organization that published the server   | Publisher's Ed25519 key  | Proves the server was signed by a known publisher.                                         |
| `dns`       | DNS TXT record confirms domain ownership | Verified via DNS lookup  | Binds server identity to a domain name.                                                    |

**Self-attestation** is REQUIRED for all servers implementing this extension. It enables clients to pin a server's key on first use (trust-on-first-use / TOFU model, similar to SSH known_hosts). Other attestation types are OPTIONAL and provide stronger identity assurance.

**Self-attestation canonical payload** is the RFC 8785 canonicalization of a JSON object containing exactly:

```json
{
  "type": "self",
  "publicKey": { <the server's full JWK public key object> },
  "signedAt": "<ISO 8601 timestamp>"
}
```

The server signs this canonical form with its own Ed25519 private key. Clients can verify the self-attestation by reconstructing this object from the identity metadata and verifying the signature.

**Publisher/DNS attestation structure:**

```json
{
  "type": "publisher",
  "issuer": {
    "name": "Example Corp",
    "publicKey": {
      "kty": "OKP",
      "crv": "Ed25519",
      "x": "<publisher public key>",
      "kid": "pub-x1y2z3"
    },
    "url": "https://example.com"
  },
  "signedAt": "2026-02-17T00:00:00Z",
  "expiresAt": "2027-02-17T00:00:00Z",
  "signature": "<base64url-encoded signature over canonical attestation payload>"
}
```

**Canonical attestation payload** for signing is the JSON Canonicalization Scheme (RFC 8785) applied to the attestation object with the `signature` field excluded.

#### 1.4 DNS Attestation

Servers MAY prove domain ownership via DNS TXT records. The record format:

```
_mcp-identity.example.com TXT "v=mcp1; kid=<key-id>; fp=<sha256-fingerprint>"
```

The `fp` value is the base64url-encoded (no padding) SHA-256 hash of the raw 32-byte Ed25519 public key. For example, if the public key bytes hash to `0xabcdef...`, the fingerprint is `base64url(sha256(public_key_bytes))`.

Clients verifying DNS attestations MUST:

1. Extract the domain from the server's transport URL
2. Query the `_mcp-identity.<domain>` TXT record
3. Verify the `kid` matches the server's declared key ID
4. Compute `base64url(sha256(raw_public_key_bytes))` from the server's public key and verify it matches the `fp` value

**Security note:** DNS attestation is vulnerable to DNS spoofing unless DNSSEC is deployed. Clients SHOULD prefer DNSSEC-validated responses when available. DNS attestation alone provides weaker assurance than publisher attestation and should be used in combination with other attestation types for high-security deployments.

#### 1.5 Key Revocation

Servers that need to revoke a compromised key SHOULD:

1. Generate a new key pair
2. Publish a revocation attestation signed by the old key (if still available) that references the new key's `kid`
3. Update DNS TXT records to reflect the new key

Clients SHOULD maintain a local key store (similar to SSH `known_hosts`). When a server presents a different key than previously seen, the client SHOULD warn the user and require explicit acceptance.

A revocation attestation has the following structure:

```json
{
  "type": "revocation",
  "revokedKid": "srv-old-key-id",
  "replacementKid": "srv-new-key-id",
  "reason": "key-compromise",
  "signedAt": "2026-02-17T00:00:00Z",
  "signature": "<base64url-encoded signature by the old key>"
}
```

**Limitations:** A revocation attestation signed by the old key does not protect against key compromise — an attacker with the old key could create their own revocation attestation pointing to a key they control. Revocation attestations are useful for planned key rotation (where the old key is still trusted), not for emergency compromise response.

For key compromise scenarios, revocation MUST be performed out-of-band: DNS TXT record update, publisher re-attestation with the new key, or registry-based revocation (see the companion SEP on PQC and Trust Registry). Clients that detect a key change should always warn the user, regardless of whether a revocation attestation is present.

### 2. Tool Attestation

#### 2.1 Signed Tool Definitions

Servers implementing this extension SHOULD sign tool definitions. The signature covers the tool schema, binding the tool's behavior contract to the server's identity.

When tool definitions are listed via `tools/list`, each tool MAY include identity metadata in the tool's `_meta` field (`Record<string, unknown>`, the standard MCP mechanism for arbitrary extension metadata):

```json
{
  "name": "query_database",
  "description": "Execute a read-only SQL query",
  "inputSchema": {
    "type": "object",
    "properties": {
      "sql": { "type": "string" }
    },
    "required": ["sql"]
  },
  "_meta": {
    "io.modelcontextprotocol/server-identity": {
      "signature": "<base64url-encoded Ed25519 signature>",
      "kid": "srv-a1b2c3d4e5f6g7h8",
      "signedAt": "2026-02-17T00:00:00Z"
    }
  }
}
```

**Signature payload** is computed by:

1. Extracting the tool's `name`, `description`, and `inputSchema` fields (these three fields MUST always be signed)
2. If the tool has `outputSchema`, it MUST also be included
3. Constructing a JSON object containing these fields
4. Canonicalizing the object using RFC 8785
5. Signing the canonical bytes with the server's Ed25519 private key

The set of signed fields is fixed (not configurable per tool) to prevent an attacker from selectively excluding fields from signing.

Clients MAY verify tool signatures to detect tampering. Clients that do not support this extension ignore `_meta` keys they do not recognize.

#### 2.2 Tool Version Binding

When a server updates a tool definition, it MUST re-sign the tool. Clients that cache tool definitions SHOULD re-verify signatures when the `signedAt` timestamp changes.

### 3. Extension Methods

This extension defines the following JSON-RPC methods. Servers that declare this extension MUST implement these methods.

#### 3.1 `identity/get`

Returns the server's identity metadata.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "identity/get",
  "params": {}
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "publicKey": {
      "kty": "OKP",
      "crv": "Ed25519",
      "x": "lhxR4x4bHk1gVz7XJdh0WuCGnt0bJq6BsJxpx7Vmq3g",
      "kid": "srv-a1b2c3d4e5f6g7h8"
    },
    "attestations": [
      {
        "type": "self",
        "signedAt": "2026-02-17T00:00:00Z",
        "signature": "<base64url-encoded signature>"
      }
    ]
  }
}
```

**Errors:**

| Code   | Message          | Description                              |
| ------ | ---------------- | ---------------------------------------- |
| -32601 | Method not found | Server does not implement this extension |

#### 3.2 `identity/challenge`

Challenge-response protocol for verifying the server controls the declared private key.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "identity/challenge",
  "params": {
    "challenge": "<base64url-encoded 32-byte random nonce>",
    "timestamp": "2026-02-17T00:00:00Z"
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "signature": "<base64url-encoded Ed25519 signature over (challenge || timestamp)>",
    "kid": "srv-a1b2c3d4e5f6g7h8"
  }
}
```

**Errors:**

| Code   | Message         | Description                                       |
| ------ | --------------- | ------------------------------------------------- |
| -32602 | Invalid params  | Challenge is malformed or too short               |
| -32001 | Stale timestamp | Timestamp is more than 5 minutes from server time |
| -32002 | Replayed nonce  | Challenge nonce has been seen before              |

**Verification procedure:**

1. Client generates 32 bytes of cryptographically random data and the current timestamp
2. Client sends `identity/challenge`
3. Server signs `(challenge_bytes || timestamp_utf8_bytes)` with its Ed25519 private key
4. Client verifies the signature using the public key from `identity/get`
5. If verification fails, the client SHOULD terminate the connection

**Freshness requirements:**

- Challenges MUST include a timestamp within 5 minutes of the current time
- Challenge nonces MUST be at least 32 bytes of cryptographically random data
- Servers MUST reject challenge nonces they have already responded to (replay protection)

#### 3.3 Mutual Authentication (Future Consideration)

Mutual authentication (server verifying client identity) is desirable for multi-agent delegation scenarios but is constrained by MCP's transport model. Over Streamable HTTP, the server cannot initiate requests to the client. Over stdio, bidirectional communication is possible.

This SEP does not define a mutual authentication mechanism. A future SEP may address this for transports that support bidirectional requests. In the interim, servers that need to verify client identity should use the existing OAuth mechanisms (SEP-990, SEP-991, SEP-1046).

## Rationale

### Why Ed25519?

Ed25519 was chosen as the signature algorithm for several reasons:

- **Performance**: Ed25519 signing and verification are among the fastest asymmetric operations available. This matters for MCP servers that may handle many concurrent connections.
- **Key size**: 32-byte public keys and 64-byte signatures are compact, keeping identity metadata lightweight.
- **Security margin**: Ed25519 provides ~128 bits of security, sufficient for the classical computing era.
- **Ecosystem support**: Ed25519 is supported in every major programming language and has prior art in agent identity protocols.
- **Deterministic signatures**: Ed25519 signatures are deterministic, eliminating a class of implementation bugs related to random number generation.

RSA was rejected due to key/signature size. ECDSA (P-256) was considered but has a history of implementation vulnerabilities related to nonce generation.

### Why TOFU for Self-Attestation?

Self-attestation (server signs its own key) does not prove real-world identity — any server can generate a key and self-attest. Its value is in enabling key pinning: a client records the key on first connection and detects if it changes (trust-on-first-use, TOFU). This is the same model SSH uses for `known_hosts`, and it is effective against server replacement attacks after the first connection.

For stronger identity assurance, servers should use publisher or DNS attestation in addition to self-attestation.

### Why an Extension, Not Core Protocol?

Identity is critical for security but not required for basic MCP operation. A developer testing a local MCP server does not need cryptographic identity. Making identity optional via the extension mechanism:

- Keeps the core protocol simple (principle from CONTRIBUTING.md)
- Allows adoption at the pace each deployment requires
- Does not force key management on deployments that don't need it
- Follows the precedent set by SEP-2133 for modular capabilities

### Alternatives Considered

**1. Reuse OAuth identity (SEP-990/991/1046):** OAuth provides client authentication to servers, not server identity to clients. The threat model is different — OAuth protects server resources from unauthorized clients; this extension protects clients from impersonating servers.

**2. TLS client certificates:** TLS provides transport-layer identity but does not bind identity to tool definitions. TLS and this extension are complementary — TLS secures the transport, this extension secures the identity and attestation layer above it.

**3. W3C DIDs:** Decentralized Identifiers provide a flexible identity framework but add significant complexity (DID methods, resolution, DID documents). For MCP's use case, a simpler JWK-based approach is sufficient.

**4. SLSA (Supply-chain Levels for Software Artifacts):** The attestation model in this extension draws conceptual inspiration from [SLSA](https://slsa.dev/), which defines signed provenance statements and verification levels for software build artifacts. However, SLSA addresses build-time supply chain integrity (proving _how_ an artifact was built), while this extension addresses runtime identity (proving _who_ a server is and that its tool definitions are authentic). The problems are complementary but structurally different — MCP servers are not build artifacts, and tool definitions are dynamic runtime metadata, not static build outputs. SLSA's leveled trust model may inform future work on attestation strength tiers.

## Backward Compatibility

This extension introduces no backward-incompatible changes:

- Servers that do not implement this extension are unaffected. No existing behavior changes.
- Clients that do not understand this extension ignore the identity metadata in the `capabilities.extensions` object.
- Tool attestation uses the existing `_meta` field (`Record<string, unknown>`), which non-aware clients already ignore.
- The `identity/get` and `identity/challenge` methods are only invoked by clients that support the extension. Non-aware clients never call these methods.
- All new fields and methods are additive.

Existing MCP authorization mechanisms (OAuth via SEP-990, SEP-991, SEP-1046) continue to work unchanged. This extension is complementary — it adds server-to-client identity verification alongside the existing client-to-server authorization.

## Security Implications

### New Attack Surfaces

- **Key compromise**: If a server's private key is compromised, an attacker can impersonate it. Mitigation: key revocation (Section 1.5), short-lived attestations, key pinning alerts.
- **TOFU vulnerability window**: On first connection, the client has no prior key to compare against. An attacker who controls the network during first contact can present their own key. Mitigation: use publisher or DNS attestation for initial trust establishment.
- **DNS spoofing**: DNS attestation is vulnerable to spoofing without DNSSEC. Mitigation: clients should prefer DNSSEC-validated responses and combine DNS attestation with other attestation types.

### Privacy Considerations

- Server public keys are stable identifiers that could be used to track servers across connections. Servers that require anonymity should not implement this extension.
- DNS attestation reveals the association between a domain and an MCP server identity.

### Authentication and Authorization

This extension provides **identity** (who is this server?) but not **authorization** (what is this server allowed to do?). Authorization decisions remain the responsibility of the client and existing OAuth mechanisms.

### Data Validation

- Clients MUST validate that public keys are well-formed Ed25519 keys (32 bytes) before using them.
- Clients MUST validate that signatures are 64 bytes (Ed25519 signature size).
- Clients MUST reject expired attestations (where `expiresAt` is in the past).
- Clients MUST validate challenge freshness (timestamp within 5 minutes, nonce not reused).

## Reference Implementation

Reference implementations are in progress and will be linked once pull requests are submitted. The implementations target:

- **TypeScript SDK** — Server identity generation, tool signing, challenge-response
- **Python SDK** — Server identity generation, tool signing, challenge-response
- **Reference server** — Example MCP server with identity enabled
- **Conformance tests** — Test suite for identity extension compliance

## Performance Implications

| Operation       | Ed25519  |
| --------------- | -------- |
| Key generation  | ~0.05ms  |
| Signing         | ~0.05ms  |
| Verification    | ~0.15ms  |
| Public key size | 32 bytes |
| Signature size  | 64 bytes |

Identity exchange occurs once per session. Tool signatures add ~64 bytes per tool definition in the `tools/list` response. Both are negligible relative to the LLM inference latency that dominates MCP interactions.

## Testing Plan

Conformance tests MUST cover:

1. **Key generation**: Ed25519 key pairs are well-formed (32-byte public key, 64-byte signature)
2. **Self-attestation**: Signature over canonical identity metadata verifies correctly
3. **Publisher attestation**: Signature by a third-party key verifies correctly
4. **Tool signing**: Signature over canonical tool definition verifies correctly
5. **Challenge-response**: Full round-trip with valid challenges succeeds
6. **Invalid challenge**: Malformed or short nonces are rejected
7. **Replay protection**: Reused nonces are rejected with error -32002
8. **Timestamp validation**: Stale challenges (>5 minutes) are rejected with error -32001
9. **Backward compatibility**: Clients without extension support connect and operate normally
10. **Key rotation**: Server rotates keys; clients detect the change and warn

## Open Questions

1. **Extension URI prefix**: Should this use `io.modelcontextprotocol/server-identity` (official) or start as an experimental extension and graduate to official via the process defined in SEP-2133?
2. **Key storage recommendations**: Should this SEP include guidance on where servers store private keys (e.g., HSM, file system, environment variable)?
3. **Attestation chain depth**: Should there be a maximum depth for attestation chains (e.g., publisher attests server, CA attests publisher), or should clients decide their own trust policy?

## Acknowledgments

- The MCP community for the Extensions framework (SEP-2133) that enables this proposal
- Invariant Labs for disclosing MCP tool poisoning attacks
- The OWASP MCP Top 10 project for categorizing MCP security risks

## References

- [OWASP MCP Top 10 (2025, Beta)](https://owasp.org/www-project-mcp-top-10/) — MCP03:2025 Tool Poisoning, MCP04:2025 Supply Chain, MCP07:2025 Auth, MCP09:2025 Shadow Servers
- [Invariant Labs, "MCP Security Notification: Tool Poisoning Attacks," April 2025](https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks)
- [Tomasev, N., Franklin, M., & Osindero, S. "Intelligent AI Delegation." arXiv:2602.11865, February 2026](https://arxiv.org/abs/2602.11865)
- [CVE-2025-68145: Path traversal in mcp-server-git](https://nvd.nist.gov/vuln/detail/CVE-2025-68145) — Missing path validation on `--repository` flag allowed access to arbitrary filesystem paths (CWE-22)
- [RFC 7517: JSON Web Key (JWK)](https://www.rfc-editor.org/rfc/rfc7517)
- [RFC 8785: JSON Canonicalization Scheme (JCS)](https://www.rfc-editor.org/rfc/rfc8785)
- [SLSA: Supply-chain Levels for Software Artifacts](https://slsa.dev/) — Prior art for attestation models in software supply chain security
- [SEP-2133: Extensions Framework for MCP](https://github.com/modelcontextprotocol/specification/blob/main/seps/2133-extensions.md)
