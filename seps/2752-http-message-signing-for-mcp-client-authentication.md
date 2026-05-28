# SEP-2752: HTTP Message Signing for MCP Client Authentication

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-05-19
- **Author(s)**: Neeraj Prasad (@njdawn)
- **Sponsor**: None (seeking sponsor)
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2752

## Abstract

This SEP defines an optional, additive client-authentication mechanism for MCP based on [RFC 9421 HTTP Message Signatures](https://www.rfc-editor.org/rfc/rfc9421.html). It enables MCP servers to authenticate clients with cryptographic proof-of-possession of a private key — without requiring the client to ever transmit a long-lived secret over the wire and without modifying any existing OAuth or `MCP-Session-Id` flow.

The proposal is a refinement of the now-dormant SEP-1415, incorporating the technical feedback from that thread:

- Signed-component list and signature parameters corrected to comply with RFC 9421 §2 and §3.
- The `alg` signature parameter is **prohibited**; algorithm is derived from key material (per RFC 9421 §3.2 and the security considerations of §7).
- Algorithm negotiation uses the standard `Accept-Signature` response field, not a custom JSON-RPC error envelope.
- Replay protection uses RFC 9421's `nonce` + `created` mechanism rather than mandatory server-side signature caching.
- Key distribution supports both an `initialize`-bound flow and an init-less flow compatible with [SEP-1372](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1372) (`MCP-Protocol-Version`-header bootstrap), via the `Signature-Agent` header from [draft-meunier-http-message-signatures-directory](https://datatracker.ietf.org/doc/draft-meunier-http-message-signatures-directory/).
- A signature `tag` is defined as the stable client identifier so that keys can be rotated without losing identity continuity.

## Motivation

### Why MCP needs cryptographic client authentication

Today MCP authenticates clients with bearer tokens (OAuth access tokens, API keys, `MCP-Session-Id`). A bearer is, by definition, _whoever holds the string is the client._ That model has well-understood structural weaknesses that the rest of the web stack has been migrating away from:

1. **Secrets are continuously re-exposed to the server.** Every request hands the full credential back. A compromised, malicious, or merely curious server endpoint sees the material the client uses to authenticate everywhere it presents that token. Cryptographic authentication inverts this: the **private key never leaves the client.** The server only ever sees signatures over specific requests — values that cannot be replayed or repurposed.

2. **No protection against man-in-the-middle / intermediary trust.** Bearer tokens rely entirely on TLS for confidentiality. Anything that legitimately terminates TLS along the path — CDNs, reverse proxies, corporate egress inspection, logging middleware — sees the bearer in plaintext and can act as the client until rotation. A signed request is verifiable end-to-end: an intermediary can read the request but cannot mint a new signed request without the private key. This is the property mTLS provides at the transport layer, achievable above TLS termination, which is where most production deployments actually need it.

3. **No request integrity.** Bearer auth says nothing about the body. A signature over `(@method, @target-uri, content-digest, mcp-session-id, mcp-protocol-version)` binds the credential to _this specific request_: changing the body, method, URI, session ID, or protocol version invalidates the signature. Tampering by a compromised proxy or malicious middlebox is detectable rather than silent.

4. **No replay protection.** A captured bearer can be replayed indefinitely until rotation, against any endpoint, with any payload. Signatures with `created` + `nonce` constrain each signed request to a freshness window (default 300s) and a single use, collapsing the leak blast radius from "until rotated" to single-digit minutes.

5. **No verifiable client identity.** The bearer model gives the server no cryptographic way to answer "is this the same client instance I talked to before?" The signature `tag` (this SEP) and `keyid` (RFC 9421) give a stable, unforgeable client identifier without requiring a heavyweight OAuth dance — enabling per-client rate limits, scoped permissions, audit logs, and anomaly detection.

6. **Principle of least exposure.** Current OAuth flows leave MCP clients in possession of access tokens really intended for server↔resource-server communication. Proof-of-possession lets the spec stop handing clients credentials they didn't need in the first place.

The same arguments drove the web's adoption of WebAuthn over passwords, DPoP over bare bearer tokens in OAuth 2.1, and HTTP Message Signatures in payment and federation protocols. MCP is currently the outlier.

### Where this matters most: wallet-based and high-stakes authentication

A growing class of MCP servers brokers access to **wallets and other high-value credentials** on behalf of agents — signing EVM/Solana transactions, executing swaps, retrieving API keys, performing on-chain transfers, writing to production databases. For these servers the gaps above stop being theoretical:

- A leaked bearer drains a wallet or exfiltrates secrets up to whatever policy limit exists. There is no recovery — the operation is on-chain or the data is out.
- Without request-body binding, an intercepted approval for `swap 100 USDC → ETH` is indistinguishable from an attacker minting a fresh `transfer everything → attacker` against the same token.
- Per-client policies (code or LLM-based) are predicated on "this is client X" — which today reduces to "whoever holds the bearer."

Proof-of-possession solves all three: the request body is signed, the client is the keyholder, the bearer becomes worthless on its own. As a corollary, the **wallet key itself becomes the natural MCP client credential** — the agent's authenticator is the same key material it already uses to sign on-chain.

This generalizes to any MCP server fronting non-revocable side effects: payments, on-chain operations, production writes, secret stores. As more financial and agentic infrastructure integrates over MCP (e.g. via Grok and Claude.ai connectors), the spec needs a proof-of-possession story that ships.

### Relationship to existing proposals

| Proposal                                                                             | Status    | Mechanism       | Relationship                                                          |
| ------------------------------------------------------------------------------------ | --------- | --------------- | --------------------------------------------------------------------- |
| [SEP-1415](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1415) | Dormant   | RFC 9421        | **This SEP supersedes 1415** with technical-feedback fixes            |
| [SEP-1932](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1932)   | Open (PR) | RFC 9449 (DPoP) | Complementary — sits inside an OAuth flow. This SEP is OAuth-agnostic |
| [SEP-1036](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1036) | Final     | URL elicitation | Orthogonal — concerns user data; this concerns client identity        |
| [SEP-1372](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1372) | Open      | Init-less MCP   | This SEP must work in both initialized and init-less modes            |
| ext-auth (OAuth Client Credentials)                                                  | Final     | OAuth 2.0 CC    | Bearer-based; this SEP can layer on top to add PoP                    |

This SEP is **additive**. Servers and clients that do not implement it are unaffected.

## Specification

### 1. Conformance language

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, **MAY** are to be interpreted as described in [BCP 14](https://www.rfc-editor.org/info/bcp14) when, and only when, they appear in all capitals.

### 2. Profile of RFC 9421

#### 2.1 Signed components

Every signed MCP request **MUST** sign the following components (RFC 9421 §2):

| Component              | Source     | Notes                                                                                                                                                                               |
| ---------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@method`              | Derived    | HTTP method                                                                                                                                                                         |
| `@target-uri`          | Derived    | Full request URI                                                                                                                                                                    |
| `content-digest`       | HTTP field | SHA-256 of body per [RFC 9530](https://www.rfc-editor.org/rfc/rfc9530.html). Required even for empty bodies (digest of empty input).                                                |
| `mcp-protocol-version` | HTTP field | **MUST** be included when present (per SEP-1372 init-less mode).                                                                                                                    |
| `mcp-session-id`       | HTTP field | **MUST** be included for all post-`initialize` requests. **MUST NOT** be included on the `initialize` request itself or on init-less first requests, since no session is bound yet. |

Servers **MUST** reject signatures whose `Signature-Input` does not cover all applicable components above.

#### 2.2 Signature parameters

The following RFC 9421 signature parameters **MUST** be present:

- `created`: Unix epoch seconds at signature creation time. Servers **MUST** reject signatures whose `created` is more than `300` seconds in the past or more than `60` seconds in the future, accounting for clock skew.
- `nonce`: A per-request unique value. **MUST** be at least 96 bits of cryptographic randomness, base64url-encoded.
- `keyid`: The JWK Thumbprint per [RFC 7638](https://www.rfc-editor.org/rfc/rfc7638.html) of the public verification key.
- `tag`: The stable client identifier (see §2.5). For first contact, equals `keyid`; thereafter remains stable across key rotation.

The `alg` parameter **MUST NOT** be sent and **MUST** be ignored if present. The signature algorithm is derived from the public key material (see §2.4), in line with RFC 9421 §7.3.5's guidance against `alg`-substitution attacks.

#### 2.3 Replay protection

Servers **MUST** maintain a `nonce` cache scoped to `(tag, time-window)` and **MUST** reject any request whose `(tag, nonce)` tuple has been seen within `2 × max_clock_skew + freshness_window` (default: 660 seconds).

Servers **SHOULD NOT** cache full signature values; the `nonce`-based check is sufficient and is constant-size per client.

#### 2.4 Key material

Public keys are conveyed as JWKs per [RFC 7517](https://www.rfc-editor.org/rfc/rfc7517.html). Implementations **MUST** support at least the following curve/algorithm pairing:

- **Ed25519** (`kty: "OKP", crv: "Ed25519"`) — RECOMMENDED default. Algorithm: `ed25519` per RFC 9421 §3.3.6.

Implementations **MAY** additionally support:

- **ECDSA P-256** (`kty: "EC", crv: "P-256"`) with `ecdsa-p256-sha256`.
- **ECDSA P-384** (`kty: "EC", crv: "P-384"`) with `ecdsa-p384-sha384`.

The signature algorithm is determined by the JWK `kty` + `crv` combination. Servers **MUST NOT** accept a signature whose computed algorithm does not match the algorithm registered for the presented `keyid`.

The `keyid` value **MUST** equal the JWK Thumbprint (RFC 7638) of the presented JWK; servers **MUST** reject any mismatch.

#### 2.5 Stable client identity via `tag`

The `tag` parameter (RFC 9421 §2.3) carries a stable client identifier. It is opaque to the protocol and **MUST** be:

- Generated by the client on first contact (one-time, persistent per logical client instance).
- Cryptographically bound to the initial key by being signed in the first request that introduces the key.
- Stable across key rotations (a rotation request signs a new key under the old key + same `tag`; see §3.4).

This separates **identity** (the `tag`) from **proof material** (the key), letting servers retain audit trails, rate-limit buckets, and per-client policies through key changes.

#### 2.6 Key distribution

Two methods for the server to learn the client's public key, in priority order:

##### 2.6.1 `Signature-Agent` header (RECOMMENDED, works in all modes)

Per [draft-meunier-http-message-signatures-directory](https://datatracker.ietf.org/doc/draft-meunier-http-message-signatures-directory/), clients **MAY** include a `Signature-Agent` header on any signed request:

```http
Signature-Agent: "data:application/http-message-signatures-directory+json;base64,<base64url(JWKS)>"
```

For desktop / local clients that cannot host a JWKS URL, the `data:` form is REQUIRED. For hosted clients, the URL form (`Signature-Agent: "https://client.example/.well-known/http-message-signatures-directory"`) is permitted.

This is the **only** key-distribution method that works for init-less first contact (SEP-1372).

##### 2.6.2 `cnf` claim in `clientInfo` (initialize-bound mode)

Clients that perform `initialize` **MAY** additionally bind a key by including a `cnf` (confirmation) claim in `clientInfo`:

```json
{
  "method": "initialize",
  "params": {
    "clientInfo": {
      "name": "example-client",
      "version": "1.0.0",
      "cnf": {
        "jwk": {
          "kty": "OKP",
          "crv": "Ed25519",
          "x": "3TQjAzEPW-sE81J4eWUuI2ZQCRJKELwdco_cJa7e9pM"
        }
      }
    }
  }
}
```

The `initialize` request itself **MUST** be signed with the corresponding private key. The server binds `(mcp-session-id, jwk-thumbprint, tag)` for the lifetime of the session.

### 3. Server behavior

#### 3.1 Capability advertisement

Servers that accept signed requests **MUST** declare it in `ServerCapabilities`:

```typescript
interface ServerCapabilities {
  // ... existing fields ...
  authentication?: {
    httpMessageSignatures?: {
      /** Algorithms accepted, in server preference order. */
      algorithms: Array<"ed25519" | "ecdsa-p256-sha256" | "ecdsa-p384-sha384">;
      /** Whether unsigned requests are accepted alongside signed ones. */
      requiresSignature?: boolean;
    };
  };
}
```

Servers that set `requiresSignature: true` **MUST** reject unsigned requests with HTTP `401 Unauthorized` and an `Accept-Signature` header (§3.3).

#### 3.2 Verification flow

On receiving a signed request, the server **MUST**:

1. Parse `Signature-Input` and `Signature` headers (RFC 9421 §4.2).
2. Resolve the public key for the `keyid`:
   - First, consult the session-bound key (if a session exists).
   - Otherwise, parse `Signature-Agent`.
   - Otherwise, reject with `401`.
3. Verify the `keyid` equals the JWK Thumbprint of the resolved key.
4. Verify `created` is within `[now - 300s, now + 60s]`.
5. Verify `(tag, nonce)` has not been seen.
6. Verify all required components from §2.1 are present in `Signature-Input`.
7. Verify the signature cryptographically using the algorithm derived from the key (§2.4).
8. Record `(tag, nonce)` in the replay cache before responding.

Failures in steps 1–7 **MUST** produce HTTP `401 Unauthorized` with `Accept-Signature` (§3.3) and, optionally, a JSON-RPC error body describing which check failed.

#### 3.3 Algorithm and component negotiation via `Accept-Signature`

When rejecting a signed request for protocol-level reasons (missing component, unsupported algorithm, unsigned-but-required), the server **MUST** include an `Accept-Signature` header (RFC 9421 §5.1) describing what it expects:

```http
HTTP/1.1 401 Unauthorized
Accept-Signature: sig1=("@method" "@target-uri" "content-digest" "mcp-protocol-version" "mcp-session-id");created;nonce;tag="mcp-server.example"
```

This replaces the custom JSON-RPC error envelope proposed in SEP-1415, keeping signature-layer negotiation at the signature layer.

When **multiple** algorithms are acceptable, the server **MUST** advertise them via the capabilities mechanism (§3.1) and **MAY** repeat the `Accept-Signature` header per algorithm.

#### 3.4 Key rotation

A client rotates its key by sending a `signatures/rotateKey` request signed with both the old and new keys (two `Signature` entries: `sig-old` and `sig-new`):

```json
{
  "method": "signatures/rotateKey",
  "params": {
    "newKey": { "kty": "OKP", "crv": "Ed25519", "x": "..." }
  }
}
```

The server **MUST** verify both signatures, that the `tag` matches, and that the new `keyid` equals the new JWK's thumbprint. On success the server replaces the bound key and **SHOULD** retain audit history.

### 4. Client behavior

#### 4.1 Signer abstraction

This SEP does **not** constrain where signing happens. RFC 9421 only requires that the request carries a valid `Signature` under the public key the server has bound for the client. Conforming client implementations **SHOULD** treat signing as an abstract operation that can be satisfied by any of the following, interchangeably:

- **In-process key material** held in a non-extractable form (e.g. WebCrypto `SubtleCrypto` with `extractable: false`).
- **OS-managed key store** (macOS Keychain, Windows DPAPI / CNG, Linux Secret Service / kernel keyring).
- **An out-of-process local signer** following an `ssh-agent`-style pattern — the agent process delegates signing to a separate process over a Unix socket or named pipe, and never sees the private key itself. Reference instantiations include `ssh-agent`, `gpg-agent`, hardware-backed wallet daemons, and projects like [authsome](https://github.com/agentrhq/authsome).
- **Hardware tokens** (YubiKey, Ledger, TPM, Secure Enclave).
- **A remote KMS** (AWS KMS, GCP KMS, HashiCorp Vault Transit) reached over an authenticated channel.

The out-of-process variants are explicitly recommended for deployments where the surrounding agent process executes untrusted LLM-generated code, since the model cannot exfiltrate key material it never held. PoP at the protocol layer does not by itself defend against an attacker who can coerce the agent process to print env vars or shell history; pairing PoP with an out-of-process signer does.

#### 4.2 Requirements

Clients **SHOULD**:

- Generate one keypair per `(MCP server origin, logical client identity)`.
- Persist private key material in one of the storage classes above; never in plaintext config.
- Generate a fresh `nonce` per request from a CSPRNG.
- Implement the `Accept-Signature` negotiation loop (single retry on `401` if the server's requirements were unmet).

Clients **MUST NOT**:

- Reuse `nonce` values.
- Send the `alg` signature parameter.
- Send the private key over the wire under any circumstances.

### 5. Schema changes

A draft change to `schema/draft/schema.ts` adds:

```typescript
export interface ClientCapabilities {
  // ... existing ...
  authentication?: {
    httpMessageSignatures?: JSONObject;
  };
}

export interface ServerCapabilities {
  // ... existing ...
  authentication?: {
    httpMessageSignatures?: {
      algorithms: Array<string>;
      requiresSignature?: boolean;
    };
  };
}

export interface Implementation extends BaseMetadata, Icons {
  // ... existing ...
  cnf?: {
    jwk: JSONObject; // RFC 7517 public-key JWK
  };
}
```

New method: `signatures/rotateKey` (request/response shapes defined in the spec section).

### 6. Example signed request

```http
POST /mcp HTTP/1.1
Host: server.example.com
Content-Type: application/json
Content-Digest: sha-256=:X48E9qOokqqrvdts8nOJRJN3OWDUoyWxBf7kbu9DBPE=:
MCP-Protocol-Version: 2026-03-26
MCP-Session-Id: sess_abc123
Signature-Agent: "data:application/http-message-signatures-directory+json;base64,eyJrZXlzIjpbey4uLn1dfQ=="
Signature-Input: sig1=("@method" "@target-uri" "content-digest" "mcp-protocol-version" "mcp-session-id");created=1747641600;nonce="V8wA3pX2qF7nL1cR";keyid="7CECy79zsOm80SK3EgvHmsLM39PfUmbfSTxqOLhfgsM";tag="agent-instance-9f3e"
Signature: sig1=:LAH8BjcfcOcLojiuOBFWBo0hWDdMOGvAdEBM0h/MIRoNfj6Ae5OOKlEOUcKTOvXsyHkC5bV9D6m9QQDnR3QxDw==:

{"jsonrpc":"2.0","id":"req_42","method":"tools/call","params":{"name":"wallet_sign_swap","arguments":{}}}
```

Note that `alg` is absent (derived from the Ed25519 JWK), `created` and `nonce` are parameters (not components), and `tag` provides the stable client identity.

## Rationale

### Why RFC 9421 and not DPoP (SEP-1932)

DPoP (RFC 9449) and HTTP Message Signatures (RFC 9421) solve overlapping but distinct problems:

| Concern                                              | DPoP                  | RFC 9421 (this SEP)                         |
| ---------------------------------------------------- | --------------------- | ------------------------------------------- |
| Bind credential to a specific request                | Yes                   | Yes                                         |
| Requires OAuth flow                                  | Yes (sits inside one) | No                                          |
| Works for non-OAuth MCP servers (API key, anonymous) | No                    | Yes                                         |
| Signs full request including body                    | Optional, often not   | Yes (`content-digest` required)             |
| Industry adoption beyond OAuth                       | Low                   | Higher (federation, payments, Web Bot Auth) |
| Layered above TLS termination                        | Yes                   | Yes                                         |

These should ship together: DPoP for the OAuth-bound case (where SEP-1932 already specifies it), RFC 9421 for the broader case where MCP servers want PoP without dragging in an OAuth dependency. Most wallet/payment use cases fall in the latter bucket.

### Why fix SEP-1415 rather than replace it

The original 1415 proposal is fundamentally correct in mechanism — RFC 9421 is the right tool — but the discussion thread surfaced a series of small but blocking RFC-compliance bugs (incorrect signed-component lists, `alg` parameter usage, custom error envelopes, missing init-less story). This SEP keeps the mechanism and fixes each one explicitly, with citations to the underlying RFCs and the original thread comments.

### Alternative: signed JSON-RPC envelopes

Considered and rejected. Signing the JSON-RPC payload alone misses HTTP-layer integrity (headers, URI, method), is incompatible with existing HTTP signing tooling and proxies, and forces every transport (stdio, WebSocket, Streamable HTTP) to re-invent a parallel scheme. RFC 9421 is HTTP-specific by design; stdio-only deployments are out of scope for this SEP and can be addressed in a follow-up if needed.

### Alternative: mTLS

Considered and rejected as primary mechanism. mTLS is incompatible with the vast majority of MCP deployments that terminate TLS at a CDN or load balancer, and is impractical for local desktop clients. mTLS remains a valid additional layer where the deployment supports it.

## Backward compatibility

Fully additive:

- Servers that do not implement this SEP ignore unknown headers (`Signature`, `Signature-Input`, `Signature-Agent`, `Content-Digest`) and continue to function on existing bearer/OAuth auth.
- Clients that do not implement this SEP send unsigned requests; servers that do not set `requiresSignature: true` accept both.
- The `cnf` field on `clientInfo` is optional; servers that don't understand it ignore it per the general capabilities-negotiation rules.
- No existing message format changes.

## Security considerations

### Threat coverage

| Threat                              | Without this SEP       | With this SEP                                       |
| ----------------------------------- | ---------------------- | --------------------------------------------------- |
| Bearer-token theft                  | Full client compromise | Bearer alone insufficient; signature still required |
| Request replay                      | Full replay surface    | Bounded by 300s + nonce cache                       |
| Request tampering by proxy          | Undetectable           | Detected (content-digest covered)                   |
| Session-ID hijack                   | Full takeover          | Hijacker lacks private key                          |
| Server-side credential exfiltration | Token usable anywhere  | Only past signatures observable; key never exposed  |
| TLS-terminating intermediary        | Sees bearer            | Sees signed requests it cannot forge                |

### New attack surface

- **Compromised client key store.** Same residual risk as any PoP scheme; mitigated by OS keychain / HSM storage and key rotation (§3.4).
- **Nonce cache exhaustion / DoS.** Bounded by per-`tag` rate limiting and the small per-entry cost (a single `(tag, nonce)` tuple per accepted request, evicted after the freshness window).
- **`alg` substitution.** Explicitly prevented by §2.2's prohibition of the `alg` parameter and algorithm derivation from key material.
- **`keyid` confusion.** Prevented by §2.4 requiring `keyid == JWK Thumbprint` and a single canonical thumbprint computation.

### What this SEP does **not** address

- **Authorization.** Message signing proves the request came from the keyholder; it says nothing about what that keyholder is allowed to do. Authorization is the job of OAuth scopes, ext-auth, or per-tool policy.
- **User identity.** A signed request proves a specific _client instance_ sent the request. Tying that to a human user remains the job of OAuth / OIDC.
- **Server-side authentication of the server to the client.** TLS / OOB pinning continues to handle this. A future SEP could profile RFC 9421 signed _responses_ if there is demand.

## Reference implementation

A reference implementation is planned in two parts:

1. **Server-side (Rust):** an `axum::middleware` layer wrapping the `rmcp` Streamable-HTTP transport, verifying RFC 9421 signatures per §2 and emitting `Accept-Signature` per §3.3.
2. **Client-side (TypeScript):** a fetch wrapper for the official `@modelcontextprotocol/sdk` that signs outbound requests using `@waqas-shoukat/http-message-signatures` or equivalent, with Ed25519 keys held in the browser's `SubtleCrypto` non-extractable form or a desktop OS keychain.

Both implementations will be linked from this SEP once `Draft` → `In-Review` transitions and a sponsor is assigned.

## Open questions

1. Should `signatures/rotateKey` be its own RPC method, or should rotation reuse `initialize` with `cnf`?
2. Should the spec mandate Ed25519, or only RECOMMEND it (current text)?
3. Should the freshness window (300s) be server-configurable and advertised in capabilities, or fixed by the spec?
4. Is a future signed-response counterpart in scope for a separate SEP, or should we leave that to mTLS / TLS pinning indefinitely?

## References

- [RFC 9421](https://www.rfc-editor.org/rfc/rfc9421.html) — HTTP Message Signatures
- [RFC 9530](https://www.rfc-editor.org/rfc/rfc9530.html) — Digest Fields
- [RFC 9449](https://www.rfc-editor.org/rfc/rfc9449.html) — DPoP
- [RFC 7517](https://www.rfc-editor.org/rfc/rfc7517.html) — JSON Web Key
- [RFC 7638](https://www.rfc-editor.org/rfc/rfc7638.html) — JWK Thumbprint
- [draft-meunier-http-message-signatures-directory-03](https://datatracker.ietf.org/doc/draft-meunier-http-message-signatures-directory/03/)
- [SEP-1415](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1415) — original (dormant) proposal
- [SEP-1932](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1932) — DPoP profile
- [SEP-1372](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1372) — init-less MCP
