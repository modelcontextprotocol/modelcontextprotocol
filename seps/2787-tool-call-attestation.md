# SEP-2787: Tool Call Attestation

- **Status**: Draft
- **Type**: Extensions Track
- **Created**: 2026-05-23
- **Author(s)**: heysoup.co Team
- **AI Disclosure**: Developed with AI-assisted drafting under strict human intervention and review
- **Sponsor**: None (seeking sponsor)
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2787
- **Extension Identifier**: `attestation/tool-call` (to be assigned upon acceptance as an official extension)
- **Working Group**: Security Interest Group (proposed)

## Abstract

This SEP proposes an optional **Tool Call Attestation** capability for MCP that allows clients to attach a signed, self-contained envelope to `tools/call` requests. The envelope cryptographically binds the agent's identity, the tool name and arguments, and a human-readable intent justification into a verifiable payload that MCP servers can check before execution.

The attestation is opaque to the MCP transport — it travels as metadata on existing requests and requires no new RPC methods, no breaking changes, and no mandatory server-side processing. Each deploying organization maps the attestation primitive to its own regulatory obligations — the SEP provides the mechanism, not the compliance posture.

Two signing modes are defined:

- **HS256** (HMAC-SHA256 with a shared secret): Simple, suitable for self-hosted or single-tenant deployments where the client and server share a trust domain.
- **ES256 / RS256** (asymmetric): Allows the attestation to be verified without a shared secret. The verifier only needs the issuer's public key.

## Specification of Requirements

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) when, and only when, they appear in all capitals, as shown here.

## Motivation

### Regulatory Gap

Some organizations deploying MCP in regulated environments have determined that cryptographic attestation of tool calls is a necessary part of their compliance strategy — particularly under frameworks such as the EU AI Act (Regulation 2024/1689), the AI Liability Directive, or sector-specific audit requirements. These organizations need a standard mechanism to bind each tool call to an agent's identity, documented intent, and the arguments that were executed, in a way that can be verified by the MCP server and retained for audit.

MCP today provides transport and an Authorization framework, but no standard way to attach a verifiable attestation to a tool call. Without a shared mechanism, each regulated deployment builds a proprietary solution, fragmenting the ecosystem. This SEP fills that gap by defining a minimal, composable attestation envelope.

The attestation is a protocol primitive — it enables audit and verification, but does not itself assert compliance. Each deploying organization maps the mechanism to its own regulatory obligations.

### Existing Practice

Several MCP implementations already carry agent identity or session tokens in `_meta`. However, none standardize:

- The schema of the signed attestation payload.
- The verification rules (nonce replay protection, TTL enforcement, key selection).
- The transport encoding for attestations across HTTP and JSON-RPC.

This SEP fills that gap by defining a minimal, composable attestation envelope that can be adopted incrementally.

## Specification

### Capability Negotiation

MCP servers that support attestation advertise it in their `serverCapabilities` during initialization using the `extensions` field (per SEP-2133):

```typescript
interface ServerCapabilities {
  // ... existing fields
  extensions?: {
    "attestation/tool-call"?: {
      /** Supported signing algorithms */
      algorithms: Array<"HS256" | "ES256" | "RS256">;
      /** Server requires attestation on all tool calls */
      required?: boolean;
      /** Server can find its entry in a multi-server array */
      multiServer?: boolean;
    };
  };
}
```

Clients that wish to use attestation include a matching extension in `clientCapabilities`:

```typescript
interface ClientCapabilities {
  // ... existing fields
  extensions?: {
    "attestation/tool-call"?: {
      algorithms: Array<"HS256" | "ES256" | "RS256">;
    };
  };
}
```

If a server advertises `required: true`, clients MUST include a valid attestation on every `tools/call` request or the server MUST reject the call with an error. If a server advertises `required: true` and the client's capabilities do not include the `attestation/tool-call` extension, the client MUST NOT call tools on that server.

### Attestation Envelope

The attestation is a signed JSON object sent as part of the `tools/call` request metadata. It is self-contained: the verifier does not need a connection to the issuer.

Fields are grouped by trust surface to clarify which layer asserts each fact — see the Rationale section for the security model.

```typescript
/** @meta/_meta/attestation — sent alongside tools/call */
interface Attestation {
  /** Fields asserted by the issuer: cryptographic material,
   *  identity, and timing. The issuer's signature covers the
   *  entire envelope, but these fields originate from the
   *  issuer's authority.
   */
  issuerAsserted: {
    /** Signing algorithm.
     *  "HS256": HMAC-SHA256 (shared secret).
     *  "ES256": ECDSA P-256 SHA-256.
     *  "RS256": RSASSA-PKCS1-v1_5 SHA-256.
     */
    alg: "HS256" | "ES256" | "RS256";

    /** Issuer identifier. Opaque string meaningful to verifier.
     *  Example: "issuer://a1b2c3d4-e5f6-7890-abcd-ef1234567890"
     */
    iss: string;

    /** Subject identifier. The agent or entity making the call.
     *  Example: "agent:deploy-bot"
     */
    sub: string;

    /** Version of the signing key. Enables key rotation without
     *  invalidating in-flight attestations. Verifiers MUST use
     *  this value to select the correct key for verification.
     */
    secretVersion: string;

    /** ISO 8601 UTC timestamp of when the attestation was issued. */
    iat: string;

    /** Seconds from iat until this attestation expires.
     *  Verifiers MUST reject expired attestations.
     *  RECOMMENDED maximum: 300 (5 minutes).
     */
    expSeconds: number;

    /** Cryptographic nonce unique to this attestation.
     *  Verifiers MUST reject previously seen nonces within
     *  the TTL window. RECOMMENDED: 16+ cryptographically
     *  random bytes base64url-encoded.
     */
    nonce: string;
  };

  /** Fields declared by the client or agent planner upstream of
   *  the issuer. The issuer attests these values were presented
   *  at signing time but does not assert their truthfulness —
   *  only that they are bound.
   */
  plannerDeclared: {
    /** Human-readable justification for the tool call(s).
     *  MUST be non-empty when present.
     */
    intent: string;

    /** Optional capability requested by the planner
     *  (e.g., "audit", "privileged"). Semantics defined by
     *  the deployment.
     */
    requestedCapability?: string;
  };

  /** Fields computed deterministically from the tool call
   *  payload. The issuer attests the commitments match the
   *  arguments at signing time.
   */
  payloadDerived: {
    /** One or more tool calls signed by this attestation.
     *  Each MCP server verifies only the entry where
     *  serverFingerprint matches its own identity.
     */
    toolCalls: Array<{
      name: string;
      /** Content-addressed reference: a retrieval URI alongside
       *  the digest. The verifier fetches the content, hashes it,
       *  and compares against the digest to confirm integrity.
       *  Encoding: JSON object with `uri` (string) and
       *  `digest` (base64url-encoded SHA-256) fields.
       */
      argsRef?: { uri: string; digest: string };
      /** Redacted, transformed, or identity projection of the
       *  arguments. Useful when the full arguments contain PII or
       *  trade secrets but a reviewed summary can be recorded for
       *  audit. For self-contained audit records, the identity
       *  projection (all arguments unchanged) is a valid use of
       *  this field — the attestation signature covers the
       *  projection, so integrity is guaranteed without a separate
       *  digest.
       *  Encoding: JSON-stringified projection of the arguments.
       */
      argsProjection?: string;
      serverFingerprint: string;
    }>;
  };

  // --- Signature (covers all three blocks above) ---
  /** HMAC or public-key signature computed over the canonical
   *  JSON representation (RFC 8785) of all the above fields.
   *  Encoding depends on the signing algorithm:
   *  - HS256: hex-encoded HMAC-SHA256 output (64 hex chars).
   *  - ES256: hex-encoded raw r||s concatenation (128 hex chars).
   *    Implementations MUST NOT use DER encoding.
   *  - RS256: hex-encoded RSASSA-PKCS1-v1_5 output.
   */
  signature: string;
}
```

### Canonical JSON for Signing

The signature is computed over the bytes of a deterministic JSON representation:

1. Start with all fields of the `Attestation` object EXCEPT `signature`.
2. Serialize using the JSON Canonicalization Scheme [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) (JCS). JCS produces a stable byte representation: sorted keys, deterministic number formatting, and consistent Unicode encoding and escaping.
3. Verifiers MUST reject inputs containing IEEE-754 special values (NaN, Infinity, -0) before canonicalization — these have ambiguous representations across parsers and would break signature stability.
4. The resulting UTF-8 byte string is the signing input.

### Transport Encoding

#### HTTP Transport

For HTTP transports, the attestation is carried in a request header:

```
X-MCP-Attestation: <base64url(canonicalJSON(attestation))>
```

The server decodes the header, verifies the signature, checks the nonce and TTL, then processes the tool call. The attestation header MUST be transmitted over HTTPS to prevent interception and replay.

#### JSON-RPC Transport

For JSON-RPC (STDIO, SSE), the attestation is carried in the `_meta` field of the `tools/call` request:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "delete_file",
    "arguments": { "path": "/archive/2024-Q3.md" },
    "_meta": {
      "attestation": {
        /* Attestation object */
      }
    }
  }
}
```

### Verification Rules

MCP servers that negotiate the `attestation/tool-call` extension MUST implement the following verification:

1. **Signature verification**: Decode the canonical JSON (RFC 8785), verify the signature using the key identified by `issuerAsserted.alg` and `issuerAsserted.secretVersion`. For HS256, the shared secret must be pre-configured or derived. For ES256/RS256, the issuer's public key must be retrievable (e.g., from a key server, pre-shared, or published at a well-known URL matching `issuerAsserted.iss`).

2. **Nonce replay check**: Reject attestations whose `issuerAsserted.nonce` has been seen within `issuerAsserted.iat + issuerAsserted.expSeconds`. RECOMMENDED: an in-memory bloom filter with background GC, or a bounded cache with the TTL window as the eviction horizon.

3. **TTL check**: Reject if `now < issuerAsserted.iat - 30000ms` (attestation from the future, beyond clock skew) or `now > issuerAsserted.iat + issuerAsserted.expSeconds + 30000ms` (expired, beyond clock skew).

4. **Tool call match**: Find the entry in `payloadDerived.toolCalls` where `serverFingerprint` matches the receiving server's identity. If no such entry exists, reject with `server_mismatch`. Then verify that the entry's `name` matches the `name` parameter of the `tools/call` request. If not, reject with `tool_mismatch`. This prevents cross-server replay and tool-substitution in a single step.

5. **Argument commitment verification**: If the entry in `payloadDerived.toolCalls` uses `argsRef`, resolve the URI, compute SHA-256 over the fetched content, and compare against the stored digest. Confirm the resolved content corresponds to the `arguments` being executed. If the entry uses `argsProjection`, compare it against the canonicalized runtime `arguments` (RFC 8785) and classify the result:
   - **Identity projection**: the canonical forms match exactly. The verifier confirms the attested projection is identical to the runtime arguments. This provides a self-contained audit trail.
   - **Redacted projection**: the canonical forms differ. The verifier accepts the attestation but records the mismatch — the issuer may have legitimately redacted sensitive fields, or the projection may represent a subset of the runtime arguments. The verifier makes no claim about completeness relative to the runtime arguments.

   The projection carries no declaration of intent; the verifier determines the classification by comparing canonical forms. If neither field is present, or if the content cannot be resolved and matched, reject with `args_commitment_mismatch`.

Servers that do not advertise `multiServer: true` MAY reject attestations where `payloadDerived.toolCalls.length > 1`.

If any check fails, the server MUST return a tool result with `isError: true` and a structured error payload in the content:

```typescript
{
  result: {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify({
          attestationError: true,
          reason: "signature_invalid" | "nonce_replay" | "expired" |
                  "tool_mismatch" | "server_mismatch" | "key_unavailable" |
                  "attestation_required" | "args_commitment_mismatch"
        })
      }
    ]
  }
}
```

Attestation failures are tool execution errors (the tool was not executed due to a failed security check), not protocol errors. They MUST be communicated as tool results, not JSON-RPC errors. This preserves the distinction MCP makes between protocol-level issues (malformed request, unknown method) and execution-level issues (policy rejection, security check failure).

### Error Reasons

Attestation failures are communicated as tool results with `isError: true`. The structured error payload in the content text uses the following `reason` values:

| Reason                     | Description                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| `signature_invalid`        | Signature does not match the canonical payload                                             |
| `nonce_replay`             | Nonce has been seen within the TTL window                                                  |
| `expired`                  | `issuerAsserted.iat + issuerAsserted.expSeconds` has passed                                |
| `tool_mismatch`            | Tool name does not match the `tools/call` request                                          |
| `server_mismatch`          | No `payloadDerived.toolCalls` entry matches the receiving server's fingerprint             |
| `key_unavailable`          | Key identified by `issuerAsserted.alg` and `issuerAsserted.secretVersion` is not available |
| `attestation_required`     | Server requires attestation but none was provided                                          |
| `args_commitment_mismatch` | Attested args commitment does not match runtime arguments                                  |

## Rationale

### Why Optional Capability

Making attestation optional rather than mandatory ensures backward compatibility. Existing MCP clients and servers continue to work unchanged. New deployments can opt-in gradually. This follows the same pattern as MCP's existing Authorization framework — defined in the spec but negotiated at initialization.

### Why Two Signing Modes

**HS256** (symmetric HMAC) is the simplest deployment: the client and server share a secret. It is appropriate for self-hosted OSS deployments where both sides are in the same trust domain. No public key infrastructure is needed.

**ES256/RS256** (asymmetric) supports deployments where the client and server are in different trust domains. The verifier only needs the issuer's public key, which can be published, pre-shared as a fingerprint, or retrieved from a registry. This is the mode required for multi-tenant or enterprise scenarios where the issuer is a separate service (notary, compliance gateway, credential authority).

### Why Trust-Surface Grouping

Every field in the envelope originates from one of three sources: the issuer (cryptographic material, identity, timing), the planner (intent, requested capability), or the tool call payload (argument commitments, server target). Grouping fields under `issuerAsserted`, `plannerDeclared`, and `payloadDerived` makes the provenance of each field explicit at the schema level — a verifier can determine who asserted what without relying on documentation comments.

This prevents ambiguity about which layer is responsible for which claim. For example, `intent` is planner-declared: the issuer attests it was presented, but the issuer does not vouch for its truthfulness. The grouping makes this contract self-documenting and machine-checkable.

### Why Nonce + TTL Instead of Prevents-Replay

A nonce cache bounded by the attestation TTL is simpler and more robust than relying on monotonically increasing counters across potentially unreliable clients. The TTL prevents unbounded nonce storage. Thirty-second clock skew tolerance covers typical NTP drift margins.

### Why toolCalls Array

Using an array (`payloadDerived.toolCalls`) instead of a single top-level `name`/`args*`/`serverFingerprint` entry handles two use cases without protocol bloat. First, the common case is a single call — `toolCalls` has one entry, the server verifies against it, done. Second, multi-step workflows where an agent orchestrates across several MCP servers get a single attestation for the entire plan. Each server finds its own entry via `serverFingerprint`, and the shared nonce prevents partial replay. The signature covers the whole array — no entry can be inserted or removed after issuance.

Planned multi-server orchestration is a common pattern in agentic MCP deployments. A single attestation covering all servers in the plan prevents hop-by-hop audit fragmentation — each server sees only its own `serverFingerprint` entry, but the shared nonce and signature bind the entire plan together.

### Why Two-Way Args Shape

Tool call arguments vary widely in size and sensitivity. A single args field forces every deployment into one approach. The two-way shape (`argsRef`, `argsProjection`) covers the two natural patterns without overloading:

- **Reference (content-addressed)**: A retrieval URI alongside its digest. The verifier fetches, hashes, and confirms. Useful when arguments are large, stored externally (file contents, image data), or must not cross the attestation wire for privacy reasons.
- **Projection (redacted or self-contained audit)**: A transformed, summarized, or identity-copied version of the arguments, carried inline. Useful when the full payload is manageable and a self-contained audit record is needed. For privacy- or size-sensitive cases, the projection may be a redacted subset or a hash commitment rather than the full arguments. The attestation signature covers the projection, so no separate digest is needed.

The projection carries no intent flag. The verifier classifies it as identity or redacted by comparing the canonicalized projection against the canonicalized runtime arguments (see Rule 5). A match means the attested projection equals what was executed; a mismatch means the projection is a subset or transformation — acceptable for audit, but incomplete by design.

At least one of the two MUST be present per `payloadDerived.toolCalls` entry.

### Why Tool Calls (Not All MCP Requests)

This SEP scopes attestation to `tools/call` — MCP's only operation with side effects. Resources (`resources/read`) and prompts (`prompts/get`) are read-only; sampling (`sampling/createMessage`) is inference. Tool calls are the write path, making them the highest-risk surface for audit and the natural starting point for attestation.

Reads may also warrant attestation in some deployments (e.g., accessing PII through `resources/read`). The current envelope structure is transport-agnostic — the `payloadDerived` block could be generalized beyond tool calls in a future extension. This SEP intentionally keeps v1 focused on the destructive path, where the compliance need is clearest and the design space is most constrained.

### Relationship to JWT

The attestation envelope is structurally similar to a JWT — a signed payload with explicit `alg`, `iss`, `sub`, `iat`, and `expSeconds` fields grouped under `issuerAsserted`. The key differences are intentional:

1. **No base64 encoding**: The envelope lives in `_meta`, which is already JSON. Wrapping JWT's three-part base64 encoding inside `_meta` adds a decode step with no security benefit. Parsing native JSON is one step fewer.

2. **Canonical JSON enforcement**: Standard JWT verification compares the exact base64-encoded payload string. This SEP requires the verifier to re-serialize and verify, which catches accidental or malicious non-canonical encodings that standard JWT would accept. This SEP uses RFC 8785 (JCS) rather than JWT's base64url approach.

3. **Structured args commitment**: JWT carries claims as flat base64-encoded JSON. This SEP defines typed argument commitments (reference, projection) that JWT has no native concept of. A JWT profile could approximate this with custom claims, but the SEP's structured approach makes the commitment semantics explicit and machine-checkable.

A standard JWT would work with a custom claim definition and no canonical JSON enforcement. This SEP deviates where the `_meta` transport and compliance use case demand it, and aligns with JWT everywhere else.

### Relationship to Authorization

Attestation is orthogonal to MCP's existing Authorization framework. Authorization proves _who_ is allowed to call a tool. Attestation binds _what_ was requested, _why_, and by _whom_ — it proves the request, not the outcome. A deployment may use both: OAuth for transport-level auth and attestation for pre-execution audit.

## Backward Compatibility

**Fully backward compatible.** The attestation extension is negotiated at initialization via the `extensions` field. Servers that do not advertise `attestation/tool-call` never receive attestation metadata. Clients that do not support it never send it. Existing MCP implementations are completely unaffected.

Attestation errors are returned as tool execution errors (`isError: true`), not JSON-RPC protocol errors. This is consistent with how MCP handles other security-related tool execution failures and introduces no new JSON-RPC error codes.

## Security Implications

### Attestation Replay

The nonce + TTL mechanism prevents replay within the validity window. However, if the verifier's nonce cache is lost (e.g., process restart), previously valid attestations could be replayed until their TTL expires. Servers SHOULD persist nonce state for the maximum expected TTL if crash recovery is a concern.

### Key Compromise

If the issuer's signing key (HS256 shared secret or ES256/RS256 private key) is compromised, an attacker can forge attestations. Recovery requires key rotation — the `issuerAsserted.secretVersion` field allows verifiers to distinguish attestations signed with the old key from those signed with the new key during the rotation window.

### Clock Skew Attacks

Verifiers allow up to 30 seconds of clock skew. An attacker who can skew the verifier's clock can extend the replay window. Servers SHOULD monitor clock drift and reject attestations if system time diverges from NTP by more than 30 seconds.

### Privacy Considerations

The `plannerDeclared.intent` field is human-readable and signed. It is visible to both the client and the MCP server in plaintext. Deployments handling sensitive intent descriptions SHOULD consider whether additional encryption of the intent field is required — this is out of scope for the current SEP but could be addressed in a future extension.

The `serverFingerprint` field identifies which MCP server was the target of a tool call. In multi-tenant or cross-org deployments, the set of servers an agent calls may reveal deployment topology, vendor relationships, or internal tooling choices. Deployments SHOULD evaluate whether the fingerprint alone constitutes sensitive metadata in their regulatory context.

The `issuerAsserted.iss` field identifies the attestation issuer. In deployments where the issuer is a dedicated notary or compliance service, the issuer's identity is public by design — the attestation is meant to be verifiable by third parties. However, the issuer's request volume (inferred from attestation issuance rate) may leak operational metadata. Issuers concerned about traffic analysis MAY consider deploying behind a privacy-preserving relay.

### Execution Acknowledgement (Deferred)

An earlier draft of this SEP included an `ack` field for server-signed post-execution acknowledgement of tool results. Reviewers recommended deferring execution receipts to a follow-up extension, keeping this SEP focused on the core request-attestation primitive. Execution acknowledgement — closing the loop from "this was requested" to "this actually happened and here was the result" — composes naturally on top of the request attestation envelope and will be addressed separately.

## Reference Implementation

A JavaScript/TypeScript reference implementation will be provided as part of soup-oss, an MIT-licensed project. The implementation will include:

- Payload construction and RFC 8785 canonicalization
- Signing and verification for all defined algorithms (HS256, ES256, RS256)
- Nonce generation and TTL enforcement
- Server fingerprint matching
- An MCP server adapter that verifies attestations before forwarding to tool handlers

## Extension-Defined Values

The following identifiers and conventions are defined as part of this extension, scoped to implementations that negotiate `attestation/tool-call`.

### Signing Algorithm Identifiers

The following algorithm identifiers are used in the `issuerAsserted.alg` field of the `Attestation` envelope:

| Identifier | Algorithm                       | Reference     |
| ---------- | ------------------------------- | ------------- |
| `HS256`    | HMAC-SHA256                     | RFC 7518 §3.2 |
| `ES256`    | ECDSA using P-256 and SHA-256   | RFC 7518 §3.4 |
| `RS256`    | RSASSA-PKCS1-v1_5 using SHA-256 | RFC 7518 §3.1 |

These identifiers are drawn from the JSON Web Signature (JWS) registry [RFC 7518](https://www.rfc-editor.org/rfc/rfc7518). No new algorithm registrations are required.

## Open Questions

### Normative

- **Asymmetric key discovery**: For ES256/RS256 mode, how should the verifier discover the issuer's public key? Options include: well-known URL under the `iss` domain, a DHT-based key registry, or out-of-band distribution. This SEP leaves key discovery unspecified for now and expects a follow-up SEP or extension to standardize discovery.
- **URI-based key discovery**: Should the envelope carry a `keyUri` field that tells the verifier where to fetch the issuer's public key (e.g., `https://issuer.example.com/.well-known/mcp-attestation-key`)? This would eliminate out-of-band key distribution for many deployments. Trade-off: adds a fetch dependency to verification, introduces availability and trust-on-first-use concerns.
- **JSON Schema**: Should the attestation envelope be defined as a formal JSON Schema in addition to the TypeScript interface? A JSON Schema would improve cross-language portability for conformance testing.
- **Nonce cache operational guidance**: Should the spec recommend concrete bloom filter parameters (e.g., 1M entry capacity, 0.1% FP rate, 300s eviction) or leave cache sizing to implementation?
- **Conformance test suite location**: Should the attestation conformance tests live in the MCP conformance repository or in the reference implementation's repository?
- **`serverFingerprint` format**: Should the spec define a standard format for the server fingerprint (e.g., `sha256$<hex>` of the server's public key or TLS certificate), or leave it as an opaque string defined by each deployment?

- **Generalize beyond tools**: Should attestation cover all MCP request types (`resources/read`, `prompts/get`, `sampling/createMessage`) rather than only `tools/call`? Tool calls are the only destructive operations and the natural v1 scope, but read-side attestation may be relevant for PII access or audit completeness. The current envelope could generalize the `payloadDerived` block to accept any request shape. A separate SEP could extend the mechanism, or this SEP could widen scope before acceptance. Feedback from the enterprise and financial-services working groups is invited on the priority of this extension.

### Non-Normative

- **EU AI Act compliance mapping**: A companion document mapping each field of the attestation envelope to specific requirements in EU AI Act Articles 12, 13, 14, and 26(6) would aid enterprise procurement teams. Should this be included as an appendix or published separately?
- **Privacy classification of `serverFingerprint`**: The fingerprint identifies which MCP server received the call, which may be PII-adjacent or commercially sensitive in some deployments. Should the spec include a privacy consideration for this field, or is it out of scope?
- **Credential binding in attestations**: In strict compliance scenarios, the attestation should ideally bind which credential authorized the tool call, so the server can confirm the agent did not inject an unauthorized credential outside the attested intent. This SEP deliberately omits credential delivery (wrapping and transporting secrets). A lighter alternative would be an optional `credentialRef` on `payloadDerived.toolCalls` entries — the attestation carries a key or reference to a pre-registered credential, not the credential itself. The server resolves the credential internally and rejects if the agent supplies a different one. This preserves the audit trail (credential provenance) without the transport or decryption complexity of wrapped secrets. Should a future extension define this pattern?
