# SEP-3140 reference prototype

A runnable prototype of [SEP-3140: Signed Capability Declarations & Trustworthy Trust Labels](../seps/3140-MCP-Signed-Capability-Declarations-and-Trust-Labels.md), covering the four items the SEP lists under "Reference Implementation / Prototype (required before acceptance)".

It implements the signing and verification mechanics end to end: RFC 8785 canonicalization, per-declaration `contentHash`, a detached-JWS signed manifest bound to the canonical server URI, the closed `trust` label vocabulary, material-change re-gating, and a host policy that treats unsigned servers as lower-privilege rather than equal-privilege.

## Zero dependencies, on purpose

The whole prototype runs on a stock Node install with no `npm install` step. RFC 8785 canonicalization is about sixty lines, and Node's `crypto.sign` with `dsaEncoding: 'ieee-p1363'` already emits the raw `r||s` form that JOSE ES256 requires, so neither a JCS package nor a JOSE library is needed to demonstrate the mechanism.

That matters for review: a reviewer can clone the branch and run the demo immediately, and there is no third-party crypto in the trust path to audit. A production implementation should of course use a maintained JOSE library.

## Running it

```bash
node sep-3140-poc/demo.mjs
node --test sep-3140-poc/test/conformance.test.mjs
```

The demo prints, for seven scenarios, the decision a host would reach for each tool and the reasons behind it. The test file asserts the same behaviour as 24 conformance checks.

## Layout

```text
sep-3140-poc/
  src/jcs.mjs            RFC 8785 canonicalization
  src/jws.mjs            detached JWS (ES256) sign and verify over node:crypto
  src/declarations.mjs   contentHash, manifest construction, manifest verification
  src/trust.mjs          the closed trust vocabulary and the host gating policy
  src/regate.mjs         approval snapshots and material-change review
  server.mjs             reference server, plus hooks to stage rug pulls and downgrades
  client.mjs             reference client implementing the four verification steps
  demo.mjs               end-to-end walkthrough
  test/conformance.test.mjs
```

Transport is deliberately absent. SEP-3140 changes what is declared and how it is signed, not how bytes move, so the server exposes the shapes a real implementation would return from `initialize`, `tools/list` and `declarations/manifest` and leaves framing to the SDK.

## What the prototype demonstrates

- Signature verification, including rejection of a tampered manifest, an unknown signing key, an `alg=none` downgrade, a manifest replayed against a different server, and an expired manifest.
- `contentHash` mismatch rejection, including a declaration mutated after signing, a declaration absent from the manifest, and a manifest entry the server did not serve.
- Material-change re-gating, with and without a `list_changed` notification, plus the case where only `title` changes and no re-gating is required.
- Downgrade-to-unsigned handling, for an autonomous host, for an interactive host, and for a capability stripped mid-session.

## Findings from building it

Four things surfaced during implementation that are worth folding into the SEP text or the discussion. They are recorded here rather than in the SEP so the proposal and its prototype stay separately reviewable.

1. Re-gating cannot be notification-driven alone. The SEP describes re-gating in terms of `notifications/*/list_changed`, but a malicious server can simply not send one and serve a different definition on the next listing or reconnect. The client here compares every listing against a persisted approved snapshot and treats the absence of a notification as carrying no information. See `test/conformance.test.mjs`, "a material change is detected even when no list_changed notification is sent".

2. An approval must bind to a content snapshot, not to a tool name. If it binds to the name, a rename escapes the allowlist entirely and arrives as a fresh, ungated tool. The `ApprovalStore` therefore keys on the material-field hash, and a renamed tool is reported as unapproved while the old approval is withdrawn.

3. "Unsigned" and "tampered" must produce different outcomes. Collapsing them into one failure looks safe but breaks the property the SEP relies on in its Security Implications section, that a downgrade yields less privilege rather than more. An unsigned server is handled by policy, so read-only tools still work and sensitive ones are denied or elevated; a broken signature on a server that claimed to be signed is a hard deny. This was an actual bug in the first draft of the client, caught by the downgrade tests.

4. A quietly widened `trust` label is itself a material change and has to re-enter the gate at its new severity. A tool approved as `read-only` that later relabels itself `destructive` with `egress: external` must not keep its old decision. The prototype treats every `trust` field as material, and the demo shows a tool moving from `allow` to `approve` after its label widens.

## Limitations

- Only `tools` are exercised. The manifest carries `prompts` and `resources` and the code paths are generic, but no prompt or resource declarations are seeded.
- Publisher discovery is simulated in process. A real client fetches `mcp_publisher` and `mcp_signing_jwks_uri` over HTTPS and must apply the SSRF protections the authorization specification already requires for OAuth metadata discovery.
- Trust-on-first-use is modelled simply: the publisher's key is remembered and an unexpected key change downgrades trust to unknown. Key rotation, key history and revocation are not implemented.
- This is the runnable prototype, not the conformance artifact. SEP-2484 additionally requires a scenario merged into the conformance repository with a `sep-3140.yaml` traceability file mapping each MUST and SHOULD to a check ID.
