# SEP: Signed Capability Declarations & Trustworthy Trust Labels

| Field | Value |
|---|---|
| **SEP** | `3140` *(placeholder — set to the PR number on submission)* |
| **Title** | Signed Capability Declarations & Trustworthy Trust Labels |
| **Author** | Omkar Parkhe (Microsoft) — omkarparth@gmail.com |
| **Sponsor** | Paul Carleton (@pcarleton) and Den Delimarsky (@localden)  |
| **Status** | `draft` |
| **Type** | Standards Track |
| **Created** | 2026-07-27 |
| **Requires** | Existing capability negotiation; RFC 8707 canonical server URI; RFC 9728 Protected Resource Metadata |
| **Relates** | **Extends / complements (does not replace):** the Server Card WG, Tool Annotations IG, Tool Scopes WG, the Registry, `ext-auth`, and the [Security Best Practices](https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices). See *Rationale → Relationship to existing work*. |

---

## Abstract

This SEP proposes an **additive** mechanism for MCP servers to make their declared capabilities — the `tools/list`, `prompts/list`, and `resources/list` outputs a client feeds to a model — **authenticatable, integrity-protected, versioned, and labeled with a trustworthy, standardized risk vocabulary.**

It introduces (1) a **content hash + version** on each declaration, (2) a **signed capability manifest** (JWS) bound to a discoverable **publisher identity**, (3) a standardized, signature-covered **`trust` label block** (effect / egress / data-sensitivity / reversibility), and (4) **change semantics** for `notifications/*/list_changed` that let a client detect and re-gate material changes ("rug pulls").

A **secondary, optional** section proposes a *secure-by-default* posture for authentication.

The goal is to convert the spec's current unactionable guidance — *"clients **MUST** consider tool annotations untrusted unless they come from a **trusted server**"* — into something **any** MCP client can actually **verify and enforce**. The gap is inherent to the protocol and affects **every** client — interactive / human-in-the-loop and autonomous alike; autonomy makes it acute, but a human approver cannot verify authenticity or detect a silent change either.

---

## Motivation

### The gap

MCP tool declarations are **model-facing instructions in all but name**: a model reads a tool's `description`, `inputSchema`, and `annotations` to decide when and how to invoke it. Yet the protocol delivers these with **no authenticity, no integrity, and no trustworthy risk labeling.** The specification acknowledges the danger but delegates it without providing a mechanism:

- *"descriptions of tool behavior such as annotations should be considered **untrusted**, unless obtained from a **trusted server**."*
- *"clients **MUST** consider tool annotations to be untrusted unless they come from **trusted servers**."*

**There is no protocol mechanism to establish that a server is "trusted," to verify that a declaration is authentic, or to detect that it changed.** The `MUST` is therefore unsatisfiable: the implementer has been assigned a trust decision the protocol renders unverifiable.

Two concrete attack classes follow directly:

- **Tool poisoning** — a malicious or compromised server embeds directives in a `description`; the model treats them as instructions (indirect prompt injection).
- **Rug pull** — a server declares benign tools, is approved, then emits `notifications/tools/list_changed` and silently swaps in malicious definitions. There is no version, hash, or re-consent contract to catch this.

### Why this belongs in the protocol, not the implementer

The natural objection is "let the client/host handle it." That fails for this specific class:

- **TLS is insufficient.** TLS + a trusted-URL allow-list protect the *transport* and authenticate the *server domain*, but they do **not** establish **author/publisher provenance.** A *compromised or malicious* trusted server, a tampering **registry/marketplace**, or a **stdio/proxy** hop (no TLS-to-origin) all serve poisoned declarations that TLS then faithfully protects end-to-end.
- **Free-form `annotations` cannot back a security decision.** They are attacker-controlled and explicitly untrusted, so a host cannot use them to gate anything (reliance on them is [CWE-807](https://cwe.mitre.org/data/definitions/807.html)).
- **Interoperability requires a standard.** Without a common provenance + label format, every host invents incompatible heuristics and no server can portably declare "I am authored by X" or "this tool egresses data." A per-host solution does not compose across the open ecosystem MCP is built for.

In short: **provenance and trustworthy labeling of what a server declares is the one security property that neither the host nor OAuth can synthesize on their own** — it requires a protocol primitive.

### Who is affected: every client — a human in the loop does not close the gap

This is a **protocol-level** gap that affects **every** MCP client, not only autonomous ones:

- **Interactive / human-in-the-loop clients are exposed too.** MCP's safety model leans on a human able to deny a tool invocation (*"there **SHOULD** always be a human in the loop with the ability to deny tool invocations"*). But a human approver sees only the **rendered** `description` / `annotations`; they have **no way to verify** that the declaration is authentic, unmodified, or unchanged since they approved it. A poisoned description reads as legitimate, and a silent `list_changed` **rug pull** happens *after* approval. Human review therefore does **not** mitigate these attacks — it is the same unverified text either way.
- **Autonomy makes it acute, not different.** Removing the human removes even the chance to *notice* something odd, and the model's control flow **is** the (unverified) declaration text. Autonomous operation is the sharpest case, but it is an **amplifier** of a universal gap, not its source.

Authenticated declarations + machine-enforceable labels help **any** host: they surface verifiable provenance and risk **to a human reviewer**, *and* enable **policy** (risk-graduated approval, egress control, information-flow constraints) where there is no human. Both modes benefit from the same primitive.

### Goals and Non-Goals

**Goals**
- Let a client **cryptographically verify** the authenticity and integrity of a server's declared capabilities before exposing them to a model.
- Let a client **detect and re-gate material changes** to declarations (anti-rug-pull).
- Provide a **standardized, signature-covered risk/sensitivity vocabulary** a host can enforce policy against.
- Be **fully additive and backwards-compatible** (capability-negotiated; unsigned servers keep working).
- Reuse existing MCP/OAuth infrastructure (canonical server URI, Protected Resource Metadata, JOSE).

**Non-Goals**
- Guaranteeing a signed server is *honest*. Signing establishes **provenance, integrity, and accountability** (like code/package signing), **not** good behavior. A signed-but-malicious publisher becomes **identifiable, revocable, and attributable** — which is the point.
- Enforcing cross-server information flow at runtime — that is unavoidably the **host's** job. This SEP supplies the *labels* the host enforces against; it does not attempt enforcement in the protocol.
- Replacing the Security Best Practices guidance; this complements it.

---

## Specification

### Terminology

- **Declaration** — a single `tool`, `prompt`, or `resource` entry returned by a `*/list` method.
- **Capability manifest** — the canonicalized, complete set of a server's declarations at a point in time.
- **Publisher** — the identity that signs the manifest (may differ from the hosting operator, e.g., an open-source author whose server is self-hosted by many).
- **Trust label** — a standardized, enumerated property describing a tool's effect/egress/sensitivity, carried under the manifest signature.

### Capability negotiation

A server advertises support during initialization:

```json
{
  "capabilities": {
    "declarations": {
      "signed": true,
      "labels": true
    }
  }
}
```

- `signed` — the server can produce a signed capability manifest (see *Signed capability manifest*).
- `labels` — the server emits standardized `trust` blocks (see *Standardized trust labels*).

Clients that do not understand `declarations` ignore it (current behavior). Servers that do not advertise it are treated as **unsigned/unverified** and subject to host policy (see *Client verification and trust policy*).

### Canonicalization

To make hashes and signatures reproducible, declarations and manifests **MUST** be serialized using the **JSON Canonicalization Scheme ([RFC 8785, JCS](https://datatracker.ietf.org/doc/html/rfc8785))** before hashing or signing. All hashes are SHA-256 unless a stronger `alg` is negotiated. Hashes are encoded as `"<alg>-<base64url>"`, e.g. `"sha256-9f2b…"`.

### Per-declaration integrity and version

Each declaration gains two OPTIONAL fields (REQUIRED when `declarations.signed` is negotiated):

```json
{
  "name": "delete_resource",
  "title": "Delete a resource",
  "description": "Permanently deletes the named resource.",
  "inputSchema": { "type": "object", "properties": { "id": { "type": "string" } }, "required": ["id"] },
  "version": "3",
  "contentHash": "sha256-9f2b1c…"
}
```

- `contentHash` — SHA-256 over the JCS serialization of the declaration **excluding** the `contentHash` field itself.
- `version` — a monotonically increasing, server-assigned string per `name`.

### Signed capability manifest

When `declarations.signed` is negotiated, the server exposes a signed manifest, retrievable via a new method `declarations/manifest` (and referenced from `list` results):

```json
{
  "manifest": {
    "server": "https://mcp.example.com/mcp",
    "publisher": "https://publisher.example/mcp-publisher.json",
    "specVersion": "2025-11-25",
    "issuedAt": "2026-07-27T12:00:00Z",
    "expiresAt": "2026-08-27T12:00:00Z",
    "nonce": "b1e9…",
    "tools":     [ { "name": "delete_resource", "version": "3", "contentHash": "sha256-9f2b…" } ],
    "prompts":   [ ],
    "resources": [ ]
  },
  "signature": "eyJhbGciOiJFZERTQSIsImtpZCI6InB1Yi0xIn0..<detached-JWS>"
}
```

- `signature` is a **detached JWS ([RFC 7515](https://datatracker.ietf.org/doc/html/rfc7515))** over the JCS serialization of `manifest`.
- `server` **MUST** equal the client's canonical server URI ([RFC 8707](https://www.rfc-editor.org/rfc/rfc8707)) — binds the manifest to the audience, preventing cross-server replay.
- `issuedAt` / `expiresAt` / `nonce` bound replay and staleness.
- The manifest lists `contentHash` for every declaration, so verifying the manifest signature transitively authenticates every declaration and its `trust` block.

### Signing-key and publisher discovery

Reusing infrastructure MCP already mandates, the server's **Protected Resource Metadata** ([RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728)) is extended with:

```json
{
  "resource": "https://mcp.example.com/mcp",
  "authorization_servers": [ "https://auth.example.com" ],
  "mcp_publisher": "https://publisher.example/mcp-publisher.json",
  "mcp_signing_jwks_uri": "https://publisher.example/.well-known/jwks.json"
}
```

- `mcp_signing_jwks_uri` — JWKS containing the publisher's public signing keys (supports rotation via `kid`).
- `mcp_publisher` — a publisher metadata document (name, homepage, contact, key history) for display and trust-policy decisions.
- Clients **MUST** fetch discovery URLs subject to the SSRF protections already required for OAuth metadata discovery (block private/link-local ranges, HTTPS-only, DNS-pin).

### Standardized trust labels

When `declarations.labels` is negotiated, each tool declaration carries a `trust` block (covered by the manifest signature, therefore trustworthy for policy):

```json
"trust": {
  "effect": "destructive",          // read-only | writes-data | destructive
  "egress": "external",             // none | internal | external
  "dataSensitivity": "confidential",// public | internal | confidential | secret
  "reversible": false,
  "idempotent": false
}
```

Semantics are **enumerated and closed** (unknown values → treated as most-restrictive by the client). This is the primitive a host uses — to surface risk to a human reviewer *and* to enforce policy without one — to:

- drive **risk-graduated approval** (auto-allow `read-only` → approve `writes-data` → block/escalate `destructive`);
- enforce **egress policy** (`egress: external` tools gated separately);
- perform **information-flow labeling** across servers (the host enforces cross-server flow; the label is what it enforces against).

> Prompts and resources MAY carry a reduced label set (`dataSensitivity`, `egress`).

### Change semantics (anti-rug-pull)

`notifications/tools/list_changed` (and the prompts/resources equivalents) is extended:

```json
{
  "method": "notifications/tools/list_changed",
  "params": {
    "changed": [
      { "name": "delete_resource", "fromHash": "sha256-9f2b…", "toHash": "sha256-77aa…", "material": true }
    ],
    "manifest": "declarations/manifest"      // client re-fetches & re-verifies
  }
}
```

- A change to `inputSchema`, `description`, `annotations`, or any `trust` field is **material**. A change to `title`/`icons` is **not**.
- On a **material** change, a compliant client **MUST** re-verify the new signed manifest and **MUST** re-apply its gating/consent policy before using the changed declaration. It **MUST NOT** silently adopt it.

### Client verification and trust policy

A compliant client, when `declarations.signed` is offered:

1. Fetch `declarations/manifest`; verify the detached JWS against a key from `mcp_signing_jwks_uri` (matched by `kid`).
2. Verify `server` equals the canonical server URI; verify `issuedAt`/`expiresAt`/`nonce`.
3. For each declaration used, recompute `contentHash` (JCS + SHA-256) and confirm it matches the manifest.
4. Evaluate **trust policy** against the verified `publisher`:
   - **Pinned** publisher keys (highest assurance), or
   - **Allow-listed** publisher identities, or
   - **TOFU** (trust-on-first-use) with an alert on publisher/key change.
5. Apply **host policy** to unverified servers. RECOMMENDED default: a tool with `trust.effect` of `writes-data`/`destructive` or `egress: external` **from an unsigned or untrusted-publisher server** should require **explicit elevation** — an interactive host SHOULD prompt with a clear missing-provenance warning, and an autonomous host SHOULD **default-deny** — while `read-only` tools MAY be allowed.

### Secondary (optional): secure-by-default authentication

*This section is separable and may be split into its own SEP.* It addresses the related but distinct gap that **authorization is OPTIONAL** and a fully-compliant server may require no authentication, so a client connecting to servers inherits "whatever the server chose."

Rather than making auth unconditionally mandatory (a large backwards-compatibility break the current design deliberately avoids), this proposes a **graduated, secure-by-default** posture:

- **P-1 (recommended):** Servers **MUST declare their auth posture** in Protected Resource Metadata, e.g. `"mcp_auth_required": true|false`. Clients **MUST** surface it; interactive hosts **SHOULD** warn on unauthenticated third-party servers, and autonomous hosts **SHOULD default-deny** them (allowing them only on explicit operator opt-in). This makes "unauthenticated" a **visible, explicit** choice rather than a silent default.
- **P-2 (aspirational):** For HTTP transports, servers **SHOULD** implement OAuth 2.1 resource-server behavior by default; operating without it **MUST** be an explicit `noauth` declaration.
- **stdio** is unchanged (local, environment credentials) but remains subject to the host's pre-launch consent flow.

This composes with the primary proposal: `mcp_auth_required` and `mcp_signing_jwks_uri` live in the same metadata document, giving a host a single place to make a trust decision.

---

## Rationale

### Key design decisions

- **A signed *manifest* (JWS) rather than per-field signatures.** One signature transitively authenticates every declaration through its `contentHash`, keeping messages small and verification a single operation.
- **Reuse of RFC 9728 Protected Resource Metadata for key discovery.** No new discovery surface is introduced; the publisher JWKS and identity sit beside the existing `authorization_servers` and inherit the SSRF protections MCP already requires.
- **Binding to the RFC 8707 canonical server URI.** Prevents replay of an otherwise-valid manifest against a different server (audience confusion).
- **Closed, enumerated `trust` labels (unknown ⇒ most-restrictive).** A host can make a *deterministic* policy decision instead of parsing free text; this is what makes the labels usable for gating — whether surfacing risk to a human reviewer or enforcing policy without one.
- **Hashes in the manifest rather than full declaration bodies.** Compactness; full-body signing is offered as a stricter option (see *Open questions*).

### Alternatives considered

- **TLS + trusted-URL allow-list only.** Rejected as insufficient: covers transport and domain, not author provenance, registries, or stdio (see *Motivation → Why this belongs in the protocol*).
- **Rely on free-form `annotations`.** Rejected: untrusted and attacker-controlled; cannot back a security decision.
- **Per-host proprietary provenance.** Rejected: not interoperable; does not compose across the open ecosystem; every host reinvents it.
- **Full mandatory authentication.** Deferred to the optional secondary Specification subsection as a graduated posture, to avoid a hard backwards-compatibility break.
- **TLS client-cert / channel binding for server identity.** Complementary but does not provide portable, at-rest, transport-independent provenance the way a signed manifest does.

### Relationship to existing work

This SEP is deliberately **additive and complementary** to work already underway in several MCP groups; it **extends and composes with** them rather than replacing any. 

- **Server Card Working Group** — a "server card" is server-published identity and metadata, and is the natural carrier for this SEP's **publisher identity and signing-key discovery**. Where a server card exists, the signed capability manifest SHOULD reference/align with it rather than introduce a competing identity document; this SEP adds the *integrity / signature* layer over that identity.
- **Tool Annotations Interest Group** — the `trust` block is a **signed, standardized subset of tool annotations**. This SEP builds on the annotations model by adding cryptographic integrity and a closed, host-enforceable vocabulary; it does **not** replace free-form `annotations` (which remain untrusted-by-default).
- **Tool Scopes Working Group** — scopes describe *what a tool is authorized to do*; `trust` labels describe *the risk / sensitivity a host gates on*. The two are orthogonal and composable; this SEP aligns its label vocabulary with tool-scopes work rather than duplicating it.
- **Registry** — the MCP registry is the natural **root of trust** for publisher identity and key history; this SEP recommends registry alignment (publish / verify publisher keys) instead of a parallel trust store.
- **`ext-auth`** — identity / authorization extensions align with the secondary secure-by-default posture and the publisher-identity model.

### Alignment with MCP design principles

- *"Servers should be extremely easy to build."* Signing is **optional** and can be produced by a small SDK helper or at publish time by a registry; unsigned servers keep working unchanged.
- *"The host process enforces security boundaries."* This SEP gives the host **verifiable inputs** (authenticated declarations and labels) to enforce against; it does **not** move enforcement into the protocol.
- *"Servers should be highly composable."* A standard provenance + label format is precisely what lets independently-authored servers be composed safely by one host.

### Open questions

1. Should the manifest sign the **full declaration bodies** or only their `contentHash`es? (This SEP proposes hashes for compactness; full-body signing is an option for stricter deployments.)
2. Should `trust` labels be **extensible** (registered vocabulary) vs. strictly closed? (Proposed: closed core + a registry for additions.)
3. Should publisher identity reuse **OIDC issuer identity** or a dedicated **publisher document / DID**? (Proposed: JWKS + publisher doc; align with `ext-auth`.)
4. Minimum baseline: should **material-change re-gating** be `MUST` for all clients or `MUST` only for autonomous hosts?

---

## Backward Compatibility

Fully additive and negotiated:

- Servers that do not advertise `declarations` behave exactly as today; clients treat them as unverified.
- New fields (`contentHash`, `version`, `trust`, manifest, metadata keys) are optional and ignored by older peers.
- No existing method signature changes; `declarations/manifest` is a new method, and the `list_changed` extension adds optional `params`.
- Hosts adopt incrementally via policy (e.g., require signing only for third-party or write-capable tools first).

---

## Reference Implementation

### Prototype (required before acceptance)

Per the SEP process, a runnable prototype must demonstrate the mechanics before the proposal can be accepted. The prototype should:

- add `SignedDeclarations` (sign) and `verifyManifest()` (verify) helpers to one official SDK (TypeScript or Python), using an existing JOSE library plus a JCS ([RFC 8785](https://datatracker.ietf.org/doc/html/rfc8785)) implementation;
- ship a reference **server** that emits a signed manifest and `trust` labels, and a reference **client** that verifies the manifest, diffs on `list_changed`, and applies a sample trust policy;
- include integration tests for signature verification, `contentHash` mismatch rejection, material-change re-gating, and downgrade-to-unsigned handling;
- be runnable by reviewers (include setup instructions).

### Adoption path

1. **Schema** — add the `declarations` capability, `contentHash`/`version`/`trust` fields, the `declarations/manifest` method, and the RFC 9728 metadata extensions to the TypeScript schema.
2. **SDKs** — implement JCS canonicalization + detached JWS sign/verify in the reference TS and Python SDKs; provide the `SignedDeclarations` / `verifyManifest()` helpers above.
3. **Registry alignment** — recommend the MCP registry publish and verify publisher identities and key history.
4. **Rollout** — mark `signed`/`labels` OPTIONAL for one spec cycle; gather ecosystem adoption; revisit whether write/destructive/egress tools from third-party servers should require signing by default.

### Conformance

This is a **Standards Track** SEP with **observable protocol behavior**, so before it can reach `final` a conformance scenario must be merged into the [conformance repository](https://github.com/modelcontextprotocol/conformance), tagged with the SEP number, accompanied by a `sep-NNNN.yaml` traceability file mapping **every** MUST / MUST NOT and SHOULD / SHOULD NOT in the Specification — capability negotiation, canonicalization, the manifest-verification steps, material-change re-gating, and SSRF-guarded discovery — to a check ID or a documented exclusion.

---

## Security Implications

- **Signing ≠ honesty.** A signed manifest authenticates the **publisher** and guarantees **integrity**; it does not make the publisher trustworthy. The value is **accountability**: a malicious signed publisher is identifiable, blockable, and revocable (key revocation / allow-list removal), and its labels are attributable. This is the code-signing / package-signing trust model.
- **Downgrade attacks.** An attacker MITM/registry could strip the `declarations` capability to force "unsigned" handling. Mitigation: host policy treats unsigned third-party servers as **low-trust by default** (see *Client verification and trust policy*), so downgrade yields *less* privilege, not more. Pinned publishers make downgrade detectable.
- **Key management & rotation.** JWKS with `kid` supports rotation; `mcp_publisher` SHOULD publish key history. Compromised keys are handled by revocation + short manifest `expiresAt`.
- **Replay / staleness.** `server` (audience), `issuedAt`, `expiresAt`, and `nonce` bind a manifest to one server and window.
- **Label lying.** A server can declare `effect: read-only` for a tool that writes. Because the label is **signed**, this is now **attributable misrepresentation** (revocable), and hosts SHOULD still apply independent server-side / behavioral checks — the label reduces, not eliminates, the need for host defense in depth.
- **SSRF.** All new discovery fetches (`mcp_signing_jwks_uri`, `mcp_publisher`) inherit the existing OAuth-discovery SSRF requirements.

---

## References

- MCP spec `2025-11-25` — [Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools), [Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), [Security Best Practices](https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices), [Architecture](https://modelcontextprotocol.io/specification/2025-11-25/architecture).
- [SEP Guidelines](https://modelcontextprotocol.io/community/sep-guidelines) and [MCP Design Principles](https://modelcontextprotocol.io/community/design-principles).
- [MCP Authorization Extensions (`ext-auth`)](https://github.com/modelcontextprotocol/ext-auth).
- RFC 7515 (JWS), RFC 7517 (JWK), RFC 8785 (JCS), RFC 8707 (Resource Indicators), RFC 9728 (OAuth 2.0 Protected Resource Metadata).

---

*This proposal centers on the one security property that cannot be delegated to an implementer or to OAuth — **provenance and trustworthy labeling of what a server declares** — with secure-by-default authentication as an optional secondary posture.*
