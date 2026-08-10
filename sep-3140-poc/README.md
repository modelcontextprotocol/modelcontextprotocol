# SEP-3140 reference prototype

A runnable prototype of [SEP-3140: Signed Capability Declarations & Trustworthy Trust Labels](../seps/3140-MCP-Signed-Capability-Declarations-and-Trust-Labels.md), covering the items the SEP lists under "Reference Implementation / Prototype (required before acceptance)".

It implements the signing and verification mechanics end to end: RFC 8785 canonicalization, per-declaration `contentHash`, a detached-JWS signed manifest bound to the canonical server URI, the closed `trust` label vocabulary, material-change re-gating, and a host policy that treats unsigned servers as lower-privilege rather than equal-privilege.

It also demonstrates the second pillar the SEP adds on top of signing, **capability conformance**: signing proves a declaration is authentic, but not that the server behaves the way the declaration says. A signed `capabilities` block is loaded as a host sandbox policy that blocks undeclared network, filesystem, subprocess and environment access, and an independent verifier issues a signed attestation, using its own key, that a server's observed behaviour stayed inside what it declared.

## Zero dependencies, on purpose

The whole prototype runs on a stock Node install with no `npm install` step. RFC 8785 canonicalization is about sixty lines, and Node's `crypto.sign` with `dsaEncoding: 'ieee-p1363'` already emits the raw `r||s` form that JOSE ES256 requires, so neither a JCS package nor a JOSE library is needed to demonstrate the mechanism.

That matters for review: a reviewer can clone the branch and run the demo immediately, and there is no third-party crypto in the trust path to audit. A production implementation should of course use a maintained JOSE library.

## Running it

```bash
# End-to-end signing, labelling and re-gating (seven scenarios)
node sep-3140-poc/demo.mjs

# Capability conformance: sandbox enforcement and verifier attestation (three scenarios)
node sep-3140-poc/conformance-demo.mjs

# All checks. Run from inside sep-3140-poc/ as `node --test`, or use the glob from the repo root:
node --test "sep-3140-poc/test/**/*.test.mjs"
```

The two demos print, for each scenario, the decision a host would reach and the reasons behind it. The test files assert the same behaviour as 41 checks, split between `test/conformance.test.mjs` (signing, labels, re-gating, downgrade) and `test/capability-conformance.test.mjs` (sandbox enforcement, reconciliation, verifier attestation).

## Layout

```text
sep-3140-poc/
  src/jcs.mjs            RFC 8785 canonicalization
  src/jws.mjs            detached JWS (ES256) sign and verify over node:crypto
  src/declarations.mjs   contentHash, manifest construction, manifest verification
  src/trust.mjs          the closed trust vocabulary and the host gating policy
  src/regate.mjs         approval snapshots and material-change review
  src/conformance.mjs    capability vocabulary, sandbox enforcement, reconciliation, attestation
  server.mjs             reference server, plus hooks to stage rug pulls and downgrades
  client.mjs             reference client implementing the four verification steps
  demo.mjs               end-to-end signing and re-gating walkthrough
  conformance-demo.mjs   capability-conformance walkthrough
  test/conformance.test.mjs
  test/capability-conformance.test.mjs
```

Transport is deliberately absent. SEP-3140 changes what is declared and how it is signed, not how bytes move, so the server exposes the shapes a real implementation would return from `initialize`, `tools/list` and `declarations/manifest` and leaves framing to the SDK.

## What the prototype demonstrates

- Signature verification, including rejection of a tampered manifest, an unknown signing key, an `alg=none` downgrade, a manifest replayed against a different server, and an expired manifest.
- `contentHash` mismatch rejection, including a declaration mutated after signing, a declaration absent from the manifest, and a manifest entry the server did not serve.
- Material-change re-gating, with and without a `list_changed` notification, plus the case where only `title` changes and no re-gating is required.
- Downgrade-to-unsigned handling, for an autonomous host, for an interactive host, and for a capability stripped mid-session.

And for capability conformance, the second pillar:

- Host sandbox enforcement: a signed `capabilities` block loaded as an allow-list, blocking and logging an undeclared filesystem read, network egress and environment read while the manifest signature stays valid throughout.
- Third-party behavioural attestation: a verifier-signed attestation over a distinct key, bound to the canonical server URI and to the exact manifest hash, rejected when checked against the publisher key, when replayed against another server, when stale after a rug pull, when expired, when the verifier is untrusted, and when it honestly reports the server as nonconformant.
- Continuous host cross-check: reconciling a session's observed access against the declared capabilities and surfacing the drift.
- Integrity of the capability contract: widening a `capabilities` block after signing breaks its `contentHash`, so the sandbox policy a host loads is the one the publisher signed.

## Findings from building it

Five things surfaced during implementation that are worth folding into the SEP text or the discussion. They are recorded here rather than in the SEP so the proposal and its prototype stay separately reviewable.

1. Re-gating cannot be notification-driven alone. The SEP describes re-gating in terms of `notifications/*/list_changed`, but a malicious server can simply not send one and serve a different definition on the next listing or reconnect. The client here compares every listing against a persisted approved snapshot and treats the absence of a notification as carrying no information. See `test/conformance.test.mjs`, "a material change is detected even when no list_changed notification is sent".

2. An approval must bind to a content snapshot, not to a tool name. If it binds to the name, a rename escapes the allowlist entirely and arrives as a fresh, ungated tool. The `ApprovalStore` therefore keys on the material-field hash, and a renamed tool is reported as unapproved while the old approval is withdrawn.

3. "Unsigned" and "tampered" must produce different outcomes. Collapsing them into one failure looks safe but breaks the property the SEP relies on in its Security Implications section, that a downgrade yields less privilege rather than more. An unsigned server is handled by policy, so read-only tools still work and sensitive ones are denied or elevated; a broken signature on a server that claimed to be signed is a hard deny. This was an actual bug in the first draft of the client, caught by the downgrade tests.

4. A quietly widened `trust` label is itself a material change and has to re-enter the gate at its new severity. A tool approved as `read-only` that later relabels itself `destructive` with `egress: external` must not keep its old decision. The prototype treats every `trust` field as material, and the demo shows a tool moving from `allow` to `approve` after its label widens.

5. Signing proves authenticity, not behaviour, so a signed label needs a second enforcement pillar. A correctly signed manifest can still describe a `read-only`, no-egress tool whose implementation reads `~/.aws/credentials` and POSTs it out, and the mismatch never disturbs the signature. The prototype answers this with the `capabilities` block, which maps one-to-one onto sandbox primitives: locally it becomes a host-enforced allow-list, and remotely it becomes the subject of an independent verifier's signed attestation. The attestation is signed with the verifier's key rather than the publisher's, so a publisher cannot vouch for its own conformance, and it is bound to the manifest hash so it cannot survive a rug pull.

## Limitations

- Only `tools` are exercised. The manifest carries `prompts` and `resources` and the code paths are generic, but no prompt or resource declarations are seeded.
- Sandbox enforcement is modelled at a method-call boundary, not a real isolation mechanism. `EnforcingSandbox` makes the same allow-or-block decision that a seccomp filter, a network namespace or a filesystem jail would and records the same violation log, but a production host must wire the `capabilities` block to an actual OS sandbox. The behavioural attestation likewise assumes a verifier whose dynamic analysis has coverage limits.
- Publisher discovery is simulated in process. A real client fetches `mcp_publisher` and `mcp_signing_jwks_uri` over HTTPS and must apply the SSRF protections the authorization specification already requires for OAuth metadata discovery.
- Trust-on-first-use is modelled simply: the publisher's key is remembered and an unexpected key change downgrades trust to unknown. Key rotation, key history and revocation are not implemented.
- This is the runnable prototype, not the conformance artifact. SEP-2484 additionally requires a scenario merged into the conformance repository with a `sep-3140.yaml` traceability file mapping each MUST and SHOULD to a check ID.
