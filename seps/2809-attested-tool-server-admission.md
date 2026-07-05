# SEP-2809: Attested Tool-Server Admission (ATSA)

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-05-22
- **Author(s)**: Alfredo Metere (@metereconsulting) &lt;alfredo.metere@enclawed.com&gt;, Enclawed LLC
- **Sponsor**: None (seeking)
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2809
- **Preprint**: [arXiv:2605.24248](https://arxiv.org/abs/2605.24248); archived record: doi:10.5281/zenodo.20349263
- **Requires**: RFC 2119, RFC 8174, RFC 8615 (Well-Known URIs), RFC 8032 (Ed25519)
- **Contributor(s)**: Maaz (@maaz-interlock), Interlock; Christopher Hopley (@chopmob), AlgoVoi

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

The critical failure modes of this trust gap are empirically demonstrable. Adversarial testing against unprotected production multi-server MCP deployments reveals three exploitable runtime behaviors that bypass standard post-invocation defenses:

1. **Tool-Name Shadowing (`/tool-name-shadow`):** An untrusted or injected server registers a tool name that collides with a co-loaded, legitimate tool surface, causing the host to route execution calls silently to the malicious server.
2. **Dynamic Schema Drift (`/tool-schema-drift`):** A malicious server advertises an entirely benign schema during the initial `tools/list` handshake to pass static filters, but mutates parameter constraints or semantic requirements before the subsequent `tools/call` invocation.
3. **Registry Poisoning (`/tool-registry-poison`):** Direct manipulation of the host's tool cache via downstream prompt injection or unvetted secondary discovery layers.

Baseline evaluations show that relying on the model layer to detect these exploits creates a brittle, non-deterministic boundary. Under standard model profiles, permissive personas completely fail to identify active schema drift, while catching tool-name shadowing imposes a severe reasoning load that degrades rapidly under context-window exhaustion. ATSA moves the security boundary from probabilistic, post-invocation reasoning to deterministic, cryptographic admission-time gating—preventing the prompt-injected model from ever accessing or driving an unvetted tool surface.

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

A conforming host **MUST** append a tamper-evident record for every admission
decision (allow / deny / warn) and every tool-authorization denial, carrying the
resolved `signerKeyId`/`clearance` or the denial reason. _Tamper-evident_ means
the record is committed to an append-only construction in which each record is
cryptographically chained to its predecessor, such that removal, reordering, or
mutation of any record is detectable by chain verification. An unrecorded
admission decision is unauditable and therefore non-conforming.

Such records **SHOULD** conform to the `admission-control` extension profile of
the Tamper-Evident Audit Record Contract
([SEP-3004](https://modelcontextprotocol.io/seps/3004-tamper-evident-audit-record-contract)),
whose canonical form, shared integrity chain, and `C-REC-1`…`C-REC-7` conformance
vectors give the tamper-evidence an interoperable, independently verifiable shape
across implementations. SEP-3004 §2.2 names this extension and defers its
registration to this SEP; the profile is defined immediately below. Conformance to
SEP-3004 is a **SHOULD**, not a **MUST**: a host **MAY** satisfy the requirement
above with any tamper-evident construction (for example, its own hash-chained
audit log) and adopt the SEP-3004 profile to gain cross-implementation audit
interoperability.

### Audit record profile: `admission-control`

This defines the `admission-control` extension named by SEP-3004 §2.2, which
cross-references this SEP for the definition. A host that conforms its admission
records to SEP-3004 (the **SHOULD** above) carries the admission decision under
this type id. Every value defined here is a JSON string, keeping the extension
body within SEP-3004's string-only canonical form (§2.3); enumerated fields are
closed string vocabularies. Keys are serialized in the every-level lexicographic
sort SEP-3004 §2.3 mandates.

**Type id:** `admission-control`

**Required fields**

| Field                | Type          | Description                                                                                                                                                                                                                                                                                                           |
| -------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server_id`          | string        | Stable identifier of the tool server whose admission was evaluated (its discovery identity, §Discovery).                                                                                                                                                                                                              |
| `clearance_decision` | string (enum) | The gate verdict: `admitted` (the clearance assertion verified and all verification rules passed), `denied` (a verification rule failed, the server is outside the trust root, or the requested tool is outside the allow-list), or `deferred` (admission requires an out-of-band decision, e.g. a first-use prompt). |

**Optional fields**

| Field                  | Type   | Description                                                                                                                                                                                                                                                                                    |
| ---------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clearance_level`      | string | The resolved `clearance` sensitivity classification from the Server Attestation Document.                                                                                                                                                                                                      |
| `trust_root_id`        | string | Identifier of the trust root against which the assertion was verified (§Trust establishment).                                                                                                                                                                                                  |
| `assertion_uri`        | string | The well-known URI (RFC 8615) the clearance assertion was retrieved from (§Discovery).                                                                                                                                                                                                         |
| `assertion_serial`     | string | Version/serial of the clearance assertion, for correlating admission across rotations.                                                                                                                                                                                                         |
| `requested_tool`       | string | The specific tool the recorded event attempted to invoke.                                                                                                                                                                                                                                      |
| `tool_allowlist_scope` | string | The tools admitted for this server, encoded as a single canonical string: the allow-listed tool names normalized and lexicographically sorted (per SEP-3004 §2.3 ordering), joined by a single U+0020 space. The empty string denotes deny-by-default. Tool identifiers contain no whitespace. |

**`event_type` vocabulary** (§2.9)

| `event_type`        | Emitted when                                                                         |
| ------------------- | ------------------------------------------------------------------------------------ |
| `tool_call`         | A tool invocation is evaluated against the admission gate.                           |
| `server_discovery`  | A server's clearance assertion is evaluated for the first time.                      |
| `admission_recheck` | An already-admitted server is re-verified (assertion rotation or trust-root update). |

**Outcome binding** (SEP-3004 §2.1.1)

The `clearance_decision` is decision _evidence_ that informs the record's base
`outcome`; the base `outcome` states the enforcement result. The binding is:

- `clearance_decision: admitted` → `outcome: allowed`
- `clearance_decision: denied` → `outcome: denied`
- `clearance_decision: deferred` → `outcome: deferred`

A record whose base `outcome` is `allowed` **MUST NOT** carry `clearance_decision:
denied`, and vice versa.

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
- **Admission separated from tool authorization.** Admitting a server says
  nothing about which of its tools are in bounds. The closed per-server
  allow-list is enforced before any network dispatch, defeating a prompt-injected
  model that requests a tool the server advertises but the host never approved.
  _Empirical validation:_ Independent defender-side benchmarks confirm that
  runtime reasoning fails to contain dynamic exploits like schema drift under
  non-stringent model personas. Enforcing a strict host-side allow-list at the
  admission layer isolates the model from unvetted execution vectors entirely.

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

## Composition with Runtime Drift Monitoring

### The Admission/Runtime Boundary

ATSA establishes trust strictly at the point of admission: it verifies an
unforgeable server identity and evaluates a pinned signer key before any network
dispatch. This is a point-in-time guarantee that structurally answers whether a
host is authorized to communicate with a specific server at a designated sensitivity
level at the moment of connection.

By design, the wire format does not address whether a tool's internal behavior
or exposed schema schema-drift occurs over the lifetime of an active session. An
admitted server may pass verification successfully but subsequently mutate its
tool surface: a tool declared as read-only during an initial handshake could later
advertise mutating side-effects, inject new sensitive data parameters (e.g., PII),
escalate network externalities, or trigger dynamic schema modifications between
polling intervals. Because the underlying server identity remains unchanged, the
cryptographic admission guarantee holds, but the capability surface has drifted.

This operational boundary is where a downstream runtime drift-monitoring
layer composes with ATSA.

### Expectations of the Downstream Drift Layer

A downstream continuous-monitoring framework requires a stable, cryptographically
verified anchor to bind its behavioral baselines to. ATSA provides this structural
dependency via two primitives:

1. **Verified Server Identity (`id`):** The unforgeable identity string that the
   runtime monitor utilizes as the primary indexing key for its tool schema baseline.
   Without this cryptographic constraint, a drift monitor can be spoofed into
   baselining an adversarial substitute server.
2. **Pinned Signer Key (`signerKeyId`):** The cryptographic guarantee that the entity
   producing tool definitions at execution time matches the entity that was admitted.
   This ensures an attacker cannot bypass drift telemetry by impersonating an admitted
   origin.

The downstream monitor anchors each tool baseline to the unique tuple `(id, toolName)`
at the first observation post-admission, checking subsequent `tools/list` or `tools/call`
envelopes against that baseline.

### Explicit Non-Requirements of the Wire Format

To prevent protocol scope creep and maintain structural minimalism, the following
boundaries are enforced:

- **State Isolation:** The wire format **MUST NOT** carry drift state, baseline
  histories, or schema versioning metadata. Baseline persistence and delta-evaluations
  are strictly implementationconcerns of the runtime monitor.
- **Telemetry Isolation:** The wire format is not responsible for detecting or
  signaling structural mutations. It provides the authenticated identity context;
  detecting change is
  the monitor's responsibility.
- **Frequency Decoupling:** ATSA is **NOT REQUIRED** to execute full cryptographic
  re-attestation on every individual message frame. Admission remains an edge gate;
  continuous runtime verification lives in the downstream monitoring layer.

### Systemic Synergy

Admission control without drift monitoring risks trusting a modified capability
surface indefinitely. Conversely, drift monitoring without a verified admission
anchor operates in the dark—its baselines remain completely vulnerable to origin
spoofing. Composed, they provide a complete security posture: ATSA guarantees
_who_, while the drift layer guarantees that the _who_ hasn't silently changed
_what_.

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
and machine-checkable conformance vectors. This SEP was reverse-derived from that
implementation; the mechanism existed and ran in production before the wire format
was written down. Every admission decision (allow / deny / warn) and every
tool-authorization denial is appended to a hash-chained, append-only audit log
with chain verification, satisfying the §Audit **MUST** with an ATSA-native record
shape (SEP-3004 profile conformance is the remaining **SHOULD**).

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
  assertions** — all rejected. This attacker-side validation is complemented
  by independent defender-side baselines (e.g., the _AlgoVoi Agent-Trust-Bench_
  differential profiles across 29-tool surfaces), confirming that unprotected
  deployments remain uniformly vulnerable to runtime routing and session exploits.
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

## Acknowledgements

Special thanks to:

- **Maaz (@maaz-interlock)** from Interlock for his critical contributions to the architectural framing of the runtime boundary and for drafting the normative composition language for downstream continuous drift-monitoring frameworks.
- **Christopher Hopley and the AlgoVoi team** for deploying their production adversarial testing suites (`agent-trust-bench.algovoi.co.uk`) to empirically validate the threat taxonomy closed by ATSA, providing critical defender-side baseline data for the protocol's motivation section.

## References

- Companion preprint: _Attested Tool-Server Admission: A Security Extension to the
  Model Context Protocol_ — [arXiv:2605.24248](https://arxiv.org/abs/2605.24248);
  archived record: doi:10.5281/zenodo.20349263.
- RFC 2119 / RFC 8174 (requirement keywords), RFC 8414 (OAuth AS Metadata),
  RFC 8615 (Well-Known URIs), RFC 8032 (Ed25519), RFC 9116 (`security.txt`).
- Tamper-Evident Audit Record Contract:
  [SEP-3004](https://modelcontextprotocol.io/seps/3004-tamper-evident-audit-record-contract)
  (in progress; PR #3004) — the record contract the `admission-control` profile
  above conforms to.
- Reference implementation: [github.com/enclawed/enclawed-oss](https://github.com/enclawed/enclawed-oss) —
  `extensions/mcp-attested`.
