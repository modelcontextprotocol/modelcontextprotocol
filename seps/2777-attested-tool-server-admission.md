# SEP-2777: Attested Tool-Server Admission (ATSA)

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-05-22
- **Author(s)**: Alfredo Metere (@metereconsulting) &lt;alfredo.metere@enclawed.com&gt;, Enclawed LLC
- **Sponsor**: None (seeking)
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2777
- **Preprint**: doi:10.5281/zenodo.20349263
- **Requires**: RFC 2119, RFC 8174, RFC 8615 (Well-Known URIs), RFC 8032 (Ed25519)

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHOULD**,
**SHOULD NOT**, **MAY**, and **OPTIONAL** are to be interpreted as in RFC 2119
and RFC 8174.

## Abstract

MCP standardizes how a host and a tool server exchange messages, but not _trust_:
a host reads a server's self-declared tool list and dispatches calls with no
notion of which servers it may use, at what sensitivity, or which of a server's
tools are in bounds. This SEP adds an **optional, purely additive** admission
layer: a server publishes a small, offline-signed _clearance assertion_ at a
well-known URI; a host verifies it against a locally pinned trust root before any
tool dispatch; admitting a server is kept distinct from authorizing its tools via
a closed per-server tool allow-list; and every admission decision is auditable.
No existing MCP message changes shape, and an unextended host ignores the
mechanism and behaves exactly as today.

## Motivation

A host today takes a server's identity (beyond its TLS certificate) and its
advertised tool list on faith. A prompt-injected model can therefore drive a
destructive tool on any server it connects to. This is exploitable in **every**
deployment; for a single operator it is a risk they absorb, but for a regulated
operator it is disqualifying — and, lacking any admission record, unauditable.
NIST SP 800-53 expects least-privilege access enforcement (AC-3/AC-6),
information-flow enforcement between sensitivity levels (AC-4), and an audit
record of access decisions (AU-2/AU-9); none can be satisfied if the host has no
notion of which server is which, at what level, or which tools are in bounds.

The existing specification provides no place to express any of this. TLS proves
the host reached the named endpoint; MCP's authorization profile proves the user
may use the server; neither answers the missing third question — _is this server
one the host is authorized to use as a tool provider, and at what sensitivity?_

## Specification

### Discovery

A server **MAY** advertise an attestation two interoperable ways:

1. **Well-known resource.** The server **SHOULD** serve a _Server Attestation
   Document_ (SAD) at `/.well-known/mcp-attestation` on the same origin as its
   MCP endpoint, over TLS.
2. **In-band.** A server **MAY** return the SAD in the `initialize` result under
   an experimental capability key.

A conforming host **MUST** attempt (1), **MAY** attempt (2), and **MUST** treat
the absence of both as _unattested_, applying its configured posture (see
_Backward Compatibility_).

### Server Attestation Document (SAD)

A JSON object. **REQUIRED** fields: `v` (integer `1`); `id` (stable server
identity); `publisher`; `version`; `clearance` (a canonical name or alias of a
level in a named, totally ordered classification scheme); `capabilities` (string
array that **MUST** contain `"mcp-server"`); `signerKeyId` (identifies a key in
the host trust root); `signature` (base64 detached signature over the canonical
body). **OPTIONAL**, and part of the signed body when present: `netAllowedHosts`
(string array — when non-empty, binds the SAD to those origins) and
`verification` (string, e.g. `"tested"`). Verifiers **MUST** ignore unknown
fields and **MUST NOT** include them in the canonical body until a future `v`
registers them. (Formal JSON Schema: see the reference implementation.)

### Canonicalization and signature

The canonical body is the deterministic JSON serialization of every registered
field except `signature`, with object keys in sorted order, array members
sorted, and an absent `signerKeyId` serialized as `null`. Signer and verifier
**MUST** compute the signature over exactly these bytes. The reference profile
uses Ed25519; a profile **MAY** substitute another suite if signer and verifier
agree.

### Host verification rules

Before treating a connection as _admitted_, a host **MUST** evaluate the
following in order and **MUST** deny on the first failure:

1. the SAD parses and its `capabilities` contain `"mcp-server"`;
2. `signerKeyId` and `signature` are present;
3. `signerKeyId` resolves to a key in the trust root;
4. that key's validity window (`notAfter`, if set) includes now;
5. the key is approved for the asserted `clearance`;
6. the `signature` verifies over the canonical body;
7. `clearance` dominates the host's required level (numeric rank comparison);
8. if `netAllowedHosts` is non-empty, the connected origin is a member.

A host in a deny-by-default (high-assurance) posture **MUST** reject an
unattested or failing server; a permissive host **SHOULD** surface the failure
and **MUST NOT** silently treat it as success.

### Tool authorization

Admitting a server **MUST NOT** be read as authorizing all its tools. A host
**SHOULD** keep a per-server allow-list and **MUST** deny a `tools/call` for any
tool absent from it _before_ any network dispatch, regardless of what
`tools/list` advertises. Per-tool `clearance` **MAY** be added in a future `v`.

### Audit

A conforming host **SHOULD** append a tamper-evident record for every admission
decision (allow / deny / warn) and every tool-authorization denial, carrying the
resolved `signerKeyId`/`clearance` or the denial reason.

### Trust establishment

How the trust root is provisioned, pinned, and sealed is **deployment policy and
out of scope of this wire format**. Profiles **MAY** anchor it in a pinned key
set, X.509 chains, SPIFFE SVIDs, or a sigstore-style transparency log; the
verification rules are independent of the choice.

### Error signalling

When a host rejects a server for an attestation reason and surfaces it in-band,
it **SHOULD** carry a machine-readable `data.reason`, one per verification rule:
`not_mcp_server` (1), `unsigned` (2), `signer_not_trusted` (3), `signer_expired`
(4), `signer_not_approved` (5), `bad_signature` (6), `below_required` (7),
`host_not_bound` (8), and `tool_not_admitted` (tool authorization).

### Compatibility, versioning, negotiation

`v` versions the document; a verifier **MUST** reject versions it does not
understand. The extension is purely additive: an unextended host never fetches
the SAD, an unextended server never sees the host-side allow-list, and a host
**MUST** interoperate with unattested servers under its posture — enabling
incremental rollout.

## Rationale

### Why a spec extension rather than a per-vendor layer

The mechanism can be implemented above MCP today — but _additive_ is not
_interoperable_. Bolted on by one vendor, attestation secures only that vendor's
island; a server's signed clearance document is meaningful only to hosts that
already agreed, out of band, on its shape and verification order. The payoff
("this server is attested" as a claim any host can check; servers publishing one
document instead of N vendor dialects; SDKs shipping the gate on by default) only
materializes once a single format is agreed, and only the spec owner can mint
that Schelling point. That the mechanism rides entirely above MCP is what makes
adoption cheap and low-risk, not a reason to defer it.

### Design decisions

- **Offline, detached signature.** Admission requires no online call to a third
  party; the host verifies against a locally pinned trust root. This keeps
  admission available and fast and avoids a runtime dependency on the signer's
  infrastructure.
- **Well-known URI for discovery.** A host can evaluate admission _before_
  committing to a session, and the mechanism rides the established RFC 8615
  pattern instead of inventing a new one.
- **Admission separated from tool authorization.** Admitting a server says
  nothing about which of its tools are in bounds. The closed per-server
  allow-list is enforced before any network dispatch, defeating a prompt-injected
  model that requests a tool the server advertises but the host never approved.
- **Numeric clearance ranks in a named, totally ordered scheme.** Dominance is a
  single comparison; naming the scheme lets different sensitivity vocabularies
  (government, healthcare, finance) coexist and interoperate.
- **Canonicalization fixes the signed bytes.** Sorted keys, sorted arrays, absent
  `signerKeyId` as `null`, `signature` excluded — so signer and verifier agree on
  exactly what was signed regardless of JSON serializer.

### Alternatives considered

- **Leave it to each vendor / keep it an extension only.** Rejected: additive ≠
  interoperable (above). Extensions are the right place to _experiment_; this
  pattern has finished experimenting (production + evaluation), and its remaining
  value is gated on a single agreed format that only the spec can supply.
- **In-band capability only, no well-known document.** Rejected: discovery must be
  possible _before_ a connection is trusted, but `initialize` already implies a
  session. The well-known fetch lets a host decide admission before it commits.
- **mTLS / client certificates.** Rejected: TLS answers "did I reach the named
  endpoint," not "is this server cleared to operate at this sensitivity, and which
  of its tools are in bounds." Orthogonal; ATSA composes with it.
- **OAuth-style bearer token.** Rejected: that is _user_-authorization ("may this
  user use this server"), a different question from host admission ("may this host
  use this server as a tool provider, at what level"). ATSA composes with MCP's
  authorization profile.
- **Trusting `clearance` embedded in `tools/list`.** Rejected: the tool list is
  unsigned and self-declared; trust cannot rest on it. The signed SAD is the
  anchor; the allow-list is host-side state.
- **Online (OCSP-style) revocation as a v1 requirement.** Deferred: it adds an
  availability dependency at admission time. v1 enforces per-signer `notAfter`;
  online revocation is future work (see _Open questions_).

### Related work

- **Artifact attestation.** sigstore, The Update Framework (TUF), and in-toto
  apply "verify a signed claim against a trusted root before use" to software
  supply chains. ATSA applies the same discipline to MCP server admission.
- **Well-known discovery precedent.** OAuth 2.0 Authorization Server Metadata
  (RFC 8414), `security.txt` (RFC 9116), and OpenID Connect Discovery all ride
  RFC 8615 without forking the base protocols they extend.

### Design-principles alignment

This proposal is written against the MCP [design
principles](https://modelcontextprotocol.io/community/design-principles):

- **Demonstration over deliberation.** The mechanism is in production in the open
  `enclawed-oss` distribution, with a JSON Schema, conformance vectors, 48
  hermetic tests, an LLM-driven adversarial campaign (27,025 tool-name evasions +
  14,378 forged assertions, all denied), and a live Google Workspace end-to-end
  run. The SEP is written from what the prototype taught, not from theory.
- **Standardization over innovation.** ATSA codifies a pattern already proven in a
  shipping host/server pair; it invents no new primitive. The
  signed-document-at-a-well-known-URI shape is the one OAuth metadata,
  `security.txt`, and OpenID discovery already use.
- **Convergence over choice.** One signed-attestation format, one verification
  ordering — so "this server is attested" becomes a claim _any_ host can check and
  a server publishes _once_, instead of N mutually unintelligible vendor dialects.
  Only the spec owner can mint that single path.
- **Interoperability over optimization.** It degrades gracefully: capability
  negotiation gates in-band discovery, an unextended host never fetches the SAD,
  an unextended server never sees the allow-list, and a conforming host **MUST**
  still interoperate with unattested servers under its configured posture. Nothing
  requires every participant to be equally capable.
- **Composability over specificity** _(objection addressed)._ A reviewer may ask
  whether this can be built from existing primitives. It can — and is, today,
  above MCP — which is exactly why adoption is cheap. But composability gives each
  vendor an island, not interoperability: a server cannot publish one document
  every host understands until the shape and verification order are agreed in one
  place. The SEP adds exactly one document and one ordering — the minimum that
  turns a per-vendor capability into an ecosystem one.
- **Stability over velocity** _(objection addressed)._ Because the addition is
  permanent, it is deliberately small: one well-known document, one optional
  `initialize` capability, zero changes to any existing message. An unextended
  implementation is byte-for-byte unaffected, so the permanent cost to client
  implementers is bounded to those who opt in.
- **Capability over compensation.** ATSA does not compensate for a temporary model
  weakness. A more capable model that is prompt-injected is _more_ dangerous, not
  less; the trust and authorization gap it closes is independent of model quality
  and does not fade as models improve.
- **Pragmatism over purity.** Trust-root provisioning is left to deployment policy
  rather than mandated, because operators' PKI realities differ. The wire format
  is fixed; the anchoring is not.

## Backward Compatibility

None broken. The SAD lives at a well-known URI (RFC 8615); the tool allow-list is
host-side state; no existing MCP message changes shape. This is the additive
discipline that let OAuth, `security.txt`, and OpenID discovery ride the
well-known mechanism without forking the protocols they extended. A host with no
required level and an empty allow-list policy behaves exactly as a host does
today.

## Security Implications

The design resists confused-deputy tool invocation (tool authorization), server
impersonation and cross-origin replay (rules 3/6/8), level escalation (the level
is inside the signed body), and signer-key aging (rule 4). Out of scope and
delegated to other layers: content inspection of admitted connections, and the
behavior of a correctly-admitted, correctly-cleared server within its allowed
tools. The trust root is the root of all guarantees; its provisioning and sealing
are deployment policy (see _Trust establishment_), and a compromised signer key
is bounded by `notAfter` until online revocation (future work) lands.

## Reference Implementation

A production reference implementation ships in the open `enclawed-oss`
distribution — [github.com/enclawed/enclawed-oss](https://github.com/enclawed/enclawed-oss) — at
`extensions/mcp-attested` (with a first-party Google Workspace bridge at
`extensions/mcp-google-workspace`). It includes a JSON Schema, an error registry,
and machine-checkable conformance vectors.

### Prototype and evaluation

Per the SEP process (explore → prototype → write the SEP from what the prototype
taught): the mechanism is implemented and in production, and is evaluated in the
companion preprint. Every stated guarantee is backed by an executable test driven
by an LLM-generated adversarial corpus:

- **48 hermetic tests** (44 under `vitest`, 4 under `node:test`) exercise every
  verification rule and the tool-authorization rule.
- A local-LLM (Ollama) **coverage campaign** generated **27,025 unique tool-name
  evasions** (case/Unicode/whitespace/separator/path/near-miss tricks) — all
  denied, zero leaked network writes — and **14,378 unique forged clearance
  assertions** — all rejected.
- A **live end-to-end** run drove a real Google Workspace MCP endpoint through the
  gate: the allow-listed tool was admitted and dispatched; out-of-allow-list tools
  were denied before any network call.

### Conformance (prerequisite for Final)

Per [SEP-2484](https://modelcontextprotocol.io/seps/2484-conformance-tests-required-for-final-seps),
a Standards Track SEP with observable protocol behavior must, before reaching
`Final`, land a conformance scenario in the
[conformance repository](https://github.com/modelcontextprotocol/conformance)
plus a `sep-NNNN.yaml` traceability file mapping every MUST/MUST NOT and
SHOULD/SHOULD NOT in this _Specification_ to a check ID. This SEP is written to
make that mechanical: each verification rule (1–8), the tool-authorization rule,
and the audit and versioning requirements are already enumerated as
machine-checkable conformance vectors in the reference implementation. The
traceability file and scenario will be supplied against the draft spec-version tag
once a sponsor is engaged and the SEP number is assigned.

## Open questions / future work

- Per-tool (vs. per-server) clearance.
- A short-lived `notBefore`/expiry on the assertion itself and an online
  (OCSP-style) revocation channel for compromised signer keys, beyond the
  per-signer `notAfter` already enforced.
- Reconciling the `clearance` field with MCP's evolving authorization profile and
  capability-negotiation handshake.

## References

- Companion preprint: _Attested Tool-Server Admission: A Security Extension to the
  Model Context Protocol_ — archived at Zenodo, doi:10.5281/zenodo.20349263
  (arXiv ID forthcoming; PDF in this package).
- RFC 2119 / RFC 8174 (requirement keywords), RFC 8414 (OAuth AS Metadata),
  RFC 8615 (Well-Known URIs), RFC 8032 (Ed25519), RFC 9116 (`security.txt`).
- Reference implementation: [github.com/enclawed/enclawed-oss](https://github.com/enclawed/enclawed-oss) —
  `extensions/mcp-attested`.
