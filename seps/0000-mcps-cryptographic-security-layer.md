# SEP-0000: MCPS — Cryptographic Security Layer for MCP

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-03-13
- **Author(s)**: Raza Sharif (@razashariff)
- **Sponsor**: None (seeking sponsor)
- **PR**: #2395

## Abstract

This SEP proposes MCPS (MCP Secure), a cryptographic security layer for the Model Context Protocol. MCPS adds agent identity verification, per-message signing, tool definition integrity, and replay protection to MCP communications — without modifying the core protocol.

MCPS operates as an envelope around existing JSON-RPC messages, similar to how TLS wraps HTTP. It introduces four primitives: (1) Agent Passports for cryptographic identity, (2) signed message envelopes for integrity and non-repudiation, (3) tool definition signatures for detecting poisoning and tampering, and (4) nonce-plus-timestamp replay protection.

The design is fully backward-compatible. MCPS-unaware clients and servers continue to function normally. MCPS-aware endpoints progressively negotiate security capabilities through trust levels L0 (no verification) through L4 (full mutual authentication with revocation checking).

All cryptographic operations use ECDSA P-256 (NIST FIPS 186-4). The Trust Authority component is self-hostable with no external service dependency. Reference implementations exist for both Node.js and Python with zero additional dependencies (Node.js) or one dependency (Python: `cryptography`).

## Motivation

### The Problem

MCP defines a powerful protocol for connecting AI agents to external tools and data sources. However, the current specification lacks cryptographic guarantees for three critical security properties:

1. **Identity**: There is no built-in mechanism for an MCP client or server to cryptographically verify the identity of its counterpart. A malicious actor can impersonate a legitimate MCP server, serving modified tool definitions or intercepting sensitive data.

2. **Integrity**: JSON-RPC messages between client and server are unsigned. There is no way for a recipient to verify that a message has not been tampered with in transit, or to prove after the fact that a particular message was sent by a particular party (non-repudiation).

3. **Tool Authenticity**: Tool definitions (name, description, input schema) are served unsigned. A compromised or malicious server can modify tool descriptions to inject instructions into agent prompts (tool poisoning), or silently change tool behavior between sessions (rug pulls).

### Evidence of Real-World Risk

These are not theoretical concerns:

- **41% of MCP servers have zero authentication** ([TapAuth research](https://tapauth.ai/blog/518-mcp-servers-scanned-41-percent-no-auth), scanning 518 production servers).
- **CVE-2025-6514** (CVSS 9.6) demonstrated remote code execution via MCP tool poisoning.
- **CVE-2025-49596** (CVSS 9.4) demonstrated RCE in MCP Inspector via malicious tool descriptions.
- An independent scan of 39 AI agent frameworks against the OWASP Top 10 for Agentic Applications found that **13 frameworks had no MCP security controls**, 17 had partial controls, and only 9 implemented adequate protections.

### Why Existing MCP Auth is Insufficient

The current MCP authorization work (OAuth 2.1 via SEP-1046, SEP-1299, SEP-985) addresses **session-level** authentication — establishing that a client is authorized to connect to a server. This is necessary but not sufficient.

MCPS addresses a different layer: **message-level** and **artifact-level** cryptographic guarantees. The distinction is analogous to:

| Layer              | HTTP Analogy               | MCP Analogy        | Addressed By        |
| ------------------ | -------------------------- | ------------------ | ------------------- |
| Session auth       | OAuth bearer token         | Client credentials | Existing OAuth SEPs |
| Transport security | TLS                        | (missing)          | **MCPS (this SEP)** |
| Message integrity  | HTTP Signatures (RFC 9421) | (missing)          | **MCPS (this SEP)** |
| Artifact signing   | Code signing               | (missing)          | **MCPS (this SEP)** |

MCPS complements existing OAuth-based authorization. A server may require both OAuth credentials (for access control) and MCPS signatures (for integrity and non-repudiation).

### Alignment with MCP 2026 Roadmap

The [2026 MCP Roadmap](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/) identifies "deeper security and authorization work" as a priority. MCPS provides the cryptographic foundation for this work.

## Specification

### 1. Cryptographic Primitives

All MCPS operations use:

- **Key Algorithm**: ECDSA with P-256 curve (NIST FIPS 186-4, RFC 6979)
- **Hash Algorithm**: SHA-256
- **Signature Encoding**: Base64url (RFC 4648 §5), no padding
- **Key Format**: JSON Web Key (JWK, RFC 7517)
- **Canonical Serialization**: JSON with lexicographically sorted keys, no whitespace

The choice of P-256 provides 128-bit security strength, broad platform support (Web Crypto API, OpenSSL, Java KeyStore), and hardware security module compatibility.

### 2. Agent Passports

An Agent Passport is a signed credential that binds a cryptographic key pair to an agent identity.

#### 2.1 Passport Structure

```json
{
  "mcps_version": "1.0",
  "passport": {
    "id": "ap_<uuid-v4>",
    "agent_name": "string",
    "agent_version": "string (semver)",
    "issuer": "string (Trust Authority identifier)",
    "issued_at": "string (ISO 8601 UTC)",
    "expires_at": "string (ISO 8601 UTC)",
    "public_key": {
      "kty": "EC",
      "crv": "P-256",
      "x": "string (base64url)",
      "y": "string (base64url)"
    },
    "capabilities": ["string"],
    "trust_level": 0
  },
  "signature": "string (base64url, ECDSA signature over canonical passport JSON)"
}
```

#### 2.2 Passport Fields

| Field                    | Type     | Required | Description                                                                            |
| ------------------------ | -------- | -------- | -------------------------------------------------------------------------------------- |
| `mcps_version`           | string   | Yes      | Protocol version. MUST be "1.0".                                                       |
| `passport.id`            | string   | Yes      | Unique identifier. MUST begin with "ap\_" followed by UUID v4.                         |
| `passport.agent_name`    | string   | Yes      | Human-readable agent name.                                                             |
| `passport.agent_version` | string   | Yes      | Semantic version of the agent.                                                         |
| `passport.issuer`        | string   | Yes      | Identifier of the issuing Trust Authority.                                             |
| `passport.issued_at`     | string   | Yes      | ISO 8601 UTC timestamp of issuance.                                                    |
| `passport.expires_at`    | string   | Yes      | ISO 8601 UTC timestamp of expiry.                                                      |
| `passport.public_key`    | JWK      | Yes      | Agent's public key in JWK format.                                                      |
| `passport.capabilities`  | string[] | No       | List of capability identifiers.                                                        |
| `passport.trust_level`   | integer  | No       | Assigned trust level (0-4). Default: 0.                                                |
| `signature`              | string   | Yes      | Base64url-encoded ECDSA signature over the canonical JSON serialization of `passport`. |

#### 2.3 Passport Lifecycle

1. **Generation**: Agent generates an ECDSA P-256 key pair locally.
2. **Issuance**: Agent submits its public key to a Trust Authority. The Trust Authority validates the agent, assigns capabilities and trust level, and signs the passport.
3. **Self-Signing**: Alternatively, an agent MAY self-sign its passport for Trust Level L0 (no third-party verification).
4. **Verification**: A receiving party verifies the passport signature against the Trust Authority's public key (or the agent's own key for self-signed passports).
5. **Expiry**: Passports MUST be rejected after `expires_at`. Implementations SHOULD allow a configurable clock skew tolerance (default: 60 seconds).
6. **Revocation**: Trust Authorities MAY publish revocation lists. See Section 7.

### 3. Signed Message Envelopes

Every JSON-RPC message exchanged between MCPS-aware endpoints is wrapped in a signed envelope.

#### 3.1 Envelope Structure

```json
{
  "mcps": {
    "version": "1.0",
    "passport_id": "ap_<uuid>",
    "timestamp": "string (ISO 8601 UTC)",
    "nonce": "string (UUID v4)",
    "signature": "string (base64url)"
  },
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": { ... },
  "id": 1
}
```

#### 3.2 Signing Process

1. Construct the JSON-RPC message without the `mcps` field.
2. Generate a fresh UUID v4 nonce.
3. Record the current UTC timestamp in ISO 8601 format.
4. Construct the signing payload by canonically serializing:
   ```json
   {
     "jsonrpc_message": "<canonical JSON of the JSON-RPC message>",
     "nonce": "<nonce>",
     "passport_id": "<passport_id>",
     "timestamp": "<timestamp>"
   }
   ```
5. Compute SHA-256 hash of the canonical signing payload.
6. Sign the hash with the agent's private key using ECDSA P-256.
7. Attach the `mcps` field to the JSON-RPC message.

#### 3.3 Verification Process

1. Extract the `mcps` field from the received message.
2. Reconstruct the signing payload using the received JSON-RPC message (without `mcps`), nonce, passport_id, and timestamp.
3. Verify the timestamp is within the acceptable window (default: 300 seconds).
4. Verify the nonce has not been seen before (replay protection).
5. Look up the passport by `passport_id` and verify it is valid and not expired.
6. Verify the ECDSA signature against the passport's public key.
7. Store the nonce to prevent replay.

If any step fails, the message MUST be rejected with an appropriate error code (see Section 8).

### 4. Tool Definition Signing

Tool definitions MAY be signed by their author to prevent poisoning and detect unauthorized modifications.

#### 4.1 Signed Tool Structure

```json
{
  "tool": {
    "name": "read_file",
    "description": "Read contents of a file at the given path",
    "inputSchema": {
      "type": "object",
      "properties": {
        "path": { "type": "string", "description": "File path to read" }
      },
      "required": ["path"]
    }
  },
  "tool_signature": {
    "author_passport_id": "ap_<uuid>",
    "signed_at": "string (ISO 8601 UTC)",
    "signature": "string (base64url)",
    "schema_hash": "string (hex SHA-256 of canonical inputSchema)"
  }
}
```

#### 4.2 Signing Process

1. Canonically serialize the `tool` object (sorted keys, no whitespace).
2. Compute SHA-256 hash.
3. Sign with the tool author's private key.
4. Record the `schema_hash` for efficient change detection.

#### 4.3 Verification and Pinning

Clients SHOULD maintain a local pin store mapping `(server_id, tool_name)` to the last known `schema_hash`. On subsequent connections:

1. Verify the tool signature against the author's passport.
2. Compare `schema_hash` against the pinned value.
3. If the hash has changed, alert the user or reject the tool (configurable policy).

This detects "rug pull" attacks where a tool's behavior silently changes between sessions.

### 5. Replay Protection

MCPS uses a dual mechanism for replay protection:

1. **Nonce Uniqueness**: Each message includes a UUID v4 nonce. Recipients MUST maintain a nonce store and reject any previously seen nonce.
2. **Timestamp Window**: Messages with timestamps older than the configurable window (default: 300 seconds) MUST be rejected.

#### 5.1 Nonce Store Requirements

- Implementations MUST store nonces for at least the duration of the timestamp window.
- Implementations SHOULD periodically garbage-collect expired nonces.
- The nonce store MAY be in-memory for single-process deployments or shared (e.g., Redis) for distributed deployments.

### 6. Trust Levels

MCPS defines five trust levels for progressive security adoption:

| Level | Name     | Requirements                                                             |
| ----- | -------- | ------------------------------------------------------------------------ |
| L0    | None     | No MCPS verification. Equivalent to current MCP behavior.                |
| L1    | Signed   | Messages are signed. Passport may be self-signed.                        |
| L2    | Verified | Messages are signed. Passport is signed by a recognized Trust Authority. |
| L3    | Strict   | L2 plus tool definition signatures required.                             |
| L4    | Full     | L3 plus mutual authentication and real-time revocation checking.         |

Servers SHOULD declare their minimum required trust level. Clients connecting at a trust level below the server's minimum MUST be rejected with error code `-32002` (see Section 8).

### 7. Trust Authority

A Trust Authority (TA) is a service that issues and manages Agent Passports. The TA role is analogous to a Certificate Authority in the TLS/PKI ecosystem.

#### 7.1 Self-Hosting

Any organization MAY operate its own Trust Authority. The Trust Authority is defined by:

1. An ECDSA P-256 key pair (the TA's signing key).
2. A public key distribution mechanism (HTTPS endpoint, JWK Set, or static configuration).
3. Optional: A revocation endpoint (HTTP GET returning a JSON revocation list).

There is no requirement to use any specific Trust Authority service. Implementations MUST support configuring custom TA public keys.

#### 7.2 Revocation

Trust Authorities MAY publish revocation information via:

1. **Revocation List (CRL-style)**: HTTP GET endpoint returning:
   ```json
   {
     "revoked": ["ap_<uuid>", "ap_<uuid>"],
     "updated_at": "string (ISO 8601 UTC)"
   }
   ```
2. **Per-Passport Check (OCSP-style)**: HTTP GET endpoint at `/{passport_id}/status` returning:
   ```json
   {
     "passport_id": "ap_<uuid>",
     "status": "active" | "revoked" | "expired",
     "checked_at": "string (ISO 8601 UTC)"
   }
   ```

Clients at Trust Level L4 MUST check revocation status before accepting a message. Clients at lower trust levels MAY check revocation status.

If the revocation endpoint is unreachable, implementations SHOULD default to **fail-open** for L1-L3 and **fail-closed** for L4.

### 8. Error Codes

MCPS defines the following JSON-RPC error codes:

| Code   | Name                            | Description                                          |
| ------ | ------------------------------- | ---------------------------------------------------- |
| -32001 | `MCPS_INVALID_SIGNATURE`        | Message signature verification failed.               |
| -32002 | `MCPS_TRUST_LEVEL_INSUFFICIENT` | Client trust level below server minimum.             |
| -32003 | `MCPS_PASSPORT_EXPIRED`         | Passport has expired.                                |
| -32004 | `MCPS_PASSPORT_REVOKED`         | Passport has been revoked.                           |
| -32005 | `MCPS_REPLAY_DETECTED`          | Nonce has been seen before.                          |
| -32006 | `MCPS_TIMESTAMP_EXPIRED`        | Message timestamp outside acceptable window.         |
| -32007 | `MCPS_TOOL_INTEGRITY_FAILED`    | Tool definition signature invalid or schema changed. |

Error responses MUST include the standard JSON-RPC error format:

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32001,
    "message": "MCPS_INVALID_SIGNATURE",
    "data": {
      "passport_id": "ap_<uuid>",
      "reason": "Signature does not match message content"
    }
  },
  "id": 1
}
```

### 9. Capability Negotiation

MCPS capabilities are negotiated during the MCP `initialize` handshake.

#### 9.1 Client Announces MCPS Support

```json
{
  "jsonrpc": "2.0",
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-03-26",
    "capabilities": {
      "mcps": {
        "version": "1.0",
        "trust_level": 2,
        "passport": { ... }
      }
    },
    "clientInfo": { "name": "my-agent", "version": "1.0.0" }
  },
  "id": 1
}
```

#### 9.2 Server Responds with MCPS Requirements

```json
{
  "jsonrpc": "2.0",
  "result": {
    "protocolVersion": "2025-03-26",
    "capabilities": {
      "mcps": {
        "version": "1.0",
        "min_trust_level": 2,
        "passport": { ... },
        "revocation_endpoint": "https://ta.example.com/revocation"
      }
    },
    "serverInfo": { "name": "secure-server", "version": "2.0.0" }
  },
  "id": 1
}
```

If the client's trust level is below the server's `min_trust_level`, the server MUST reject the connection with error code `-32002`.

### 10. OWASP Risk Mitigation

MCPS addresses the following risks from the OWASP Top 10 for Agentic Applications (2026) and the OWASP MCP Top 10:

| Risk                               | Mitigation                                           |
| ---------------------------------- | ---------------------------------------------------- |
| Inadequate Agent Identity (ASI02)  | Agent Passports provide cryptographic identity       |
| Inadequate Tool Validation (ASI03) | Tool definition signing prevents poisoning           |
| Delegated Trust Boundaries (ASI04) | Trust levels enforce minimum security per connection |
| Tool Poisoning (MCP03)             | Signed tool definitions with change detection        |
| Server Impersonation               | Passport-based mutual authentication                 |
| Message Tampering                  | Per-message ECDSA signatures                         |
| Replay Attacks                     | Nonce + timestamp window                             |
| Insufficient Authorization (MCP07) | Trust level gating with capability lists             |

## Rationale

### Why a Separate Envelope (Not Modifying JSON-RPC)

MCPS wraps existing JSON-RPC messages rather than modifying the protocol schema. This ensures:

1. **Backward compatibility**: Non-MCPS endpoints ignore the `mcps` field.
2. **Transport independence**: Works over stdio, HTTP SSE, WebSocket, or any future transport.
3. **Composability**: MCPS can be layered with existing OAuth authorization.

This approach follows the precedent of HTTP Signatures (RFC 9421), which add signatures alongside existing HTTP headers rather than modifying the HTTP message format.

### Why ECDSA P-256 (Not Ed25519 or RSA)

- **P-256** is mandated by FIPS 186-4, required for government and enterprise compliance.
- **P-256** is supported by Web Crypto API (browser environments), enabling future browser-based MCP clients.
- **Ed25519** has superior performance but lacks FIPS certification and Web Crypto support in some environments.
- **RSA** key sizes (2048+ bits) create unacceptable overhead for per-message signing in high-throughput agent scenarios.

Implementations MAY support additional algorithms in future versions via algorithm negotiation.

### Why Self-Hostable Trust Authority (Not a Central Service)

A centralized Trust Authority would create a single point of failure and a trust dependency that many organizations cannot accept. The self-hostable design ensures:

1. **No vendor lock-in**: Any organization can operate its own TA.
2. **Air-gapped deployments**: Enterprises can run MCPS in isolated environments.
3. **Regulatory compliance**: Data sovereignty requirements are met when the TA runs on-premises.
4. **Resilience**: No dependency on external service availability.

This follows the precedent of TLS Certificate Authorities: the protocol defines the interface, not a specific provider.

### Alternatives Considered

1. **Extend OAuth SEPs with message signing**: OAuth operates at the session level. Adding per-message signing to OAuth would conflate authorization (who can access) with integrity (has this message been tampered with). These are distinct concerns.

2. **Use JWS (RFC 7515) for message signing**: JWS adds significant overhead (headers, protected/unprotected distinction) that is unnecessary for the MCP use case. MCPS uses a minimal envelope optimized for JSON-RPC.

3. **Rely on transport-layer security (TLS) alone**: TLS provides confidentiality and integrity at the transport level but does not provide non-repudiation or artifact signing. A malicious server operator can still serve poisoned tool definitions over a valid TLS connection.

## Backward Compatibility

MCPS is fully backward-compatible with existing MCP implementations.

- **Non-MCPS clients connecting to MCPS servers**: The server operates at Trust Level L0 (no verification). The `mcps` capability is not present in the `initialize` handshake, so no MCPS processing occurs.
- **MCPS clients connecting to non-MCPS servers**: The client detects the absence of `mcps` capability in the server's `initialize` response and operates without MCPS verification.
- **Mixed deployments**: Trust levels allow gradual adoption. Organizations can start at L1 (signed but self-issued) and progressively move to L4 (full mutual auth with revocation).

No changes to existing MCP message schemas, methods, or transport mechanisms are required.

## Security Implications

### New Attack Surfaces

1. **Trust Authority compromise**: If a TA's signing key is compromised, an attacker can issue fraudulent passports. Mitigation: TA key rotation, revocation lists, and key ceremony procedures (documented in reference implementation).
2. **Nonce store exhaustion**: An attacker could flood a server with unique nonces to exhaust memory. Mitigation: nonce store garbage collection based on timestamp window, and rate limiting.
3. **Clock skew attacks**: Manipulating system clocks could bypass timestamp windows. Mitigation: configurable skew tolerance, NTP synchronization requirements for L3+ deployments.

### Privacy Considerations

- Agent Passports contain an agent name and public key. These are not personally identifiable information.
- Passport IDs are pseudonymous (UUID-based). They do not reveal the agent operator's identity without Trust Authority cooperation.
- Message signatures enable non-repudiation, which may conflict with privacy requirements in some jurisdictions. Operators should consider data retention policies for signed message logs.

### Authentication and Authorization Changes

MCPS does not replace existing MCP authorization mechanisms. It adds a cryptographic identity and integrity layer that operates independently. Servers MAY require both OAuth tokens (authorization) and MCPS signatures (integrity) for defense in depth.

## Reference Implementation

Working implementations are available in two languages:

### Node.js

- **Package**: [`mcp-secure`](https://www.npmjs.com/package/mcp-secure) (v1.0.1)
- **Source**: [github.com/razashariff/mcps](https://github.com/razashariff/mcps)
- **Dependencies**: Zero (uses Node.js built-in `crypto` module)
- **Tests**: 28 passing (key generation, passport signing/verification, message signing/verification, tool signing, replay protection)

### Python

- **Package**: [`mcp-secure`](https://pypi.org/project/mcp-secure/) (v1.0.0)
- **Source**: [github.com/razashariff/mcp-secure-python](https://github.com/razashariff/mcp-secure-python)
- **Dependencies**: `cryptography>=41.0.0`
- **Tests**: 15 passing

### Full Specification

The complete 2,603-line specification is available at [SPEC.md](https://github.com/razashariff/mcps/blob/main/SPEC.md).

### Interactive Demo

A live registry showing OWASP scan results for 39 agent frameworks is available at [mcp-secure.dev](https://mcp-secure.dev).

## Acknowledgments

- The OWASP GenAI Security Project for the Top 10 for Agentic Applications framework.
- TapAuth for their research on MCP server authentication gaps.
- The MCP community for feedback on earlier drafts.
