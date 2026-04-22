# SEP-2484: Require Conformance Tests for Standards Track SEPs to Reach Final Status

- **Status**: Draft
- **Type**: Process
- **Created**: 2026-03-27
- **Author(s)**: Paul Carleton (@pcarleton)
- **Sponsor**: None
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2484
- **Supersedes**: SEP-1627 (Conformance Testing)

## Abstract

This SEP adds a conformance test requirement to the `Accepted → Final` transition for Standards Track SEPs. Before a Standards Track SEP that changes observable protocol behavior can be marked `Final`, a conformance scenario covering its normative requirements must be merged into the conformance repository, accompanied by a structured traceability file mapping each MUST/MUST NOT and SHOULD/SHOULD NOT to a check or a documented exclusion. This keeps the conformance suite synchronized with the specification as it evolves, gives SDK maintainers an executable target for implementation, and makes SEP-1730's tier percentages a meaningful measure of spec coverage. Process and Informational SEPs are exempt, as are Standards Track SEPs with no observable protocol behavior.

## Motivation

### The gap between specification and implementation

The MCP specification is written in English. SDK maintainers translate that English into code, and every translation is an opportunity for drift. SEP-1730 (SDK Tiering) already depends on conformance tests (Tier 1 requires 100% pass rate, Tier 2 requires 80%), but there is no mechanism keeping the suite synchronized with the spec. When a SEP reaches `Final`, SDK maintainers implement from prose and hope they interpreted it the same way every other SDK did. Conformance tests arrive later, if at all, and when they do they sometimes reveal that two "compliant" SDKs disagree.

### Why the existing reference implementation requirement is insufficient

A **reference implementation** proves the feature can be built: one valid interpretation. A **conformance test** defines what every implementation must do: the normative requirements as executable assertions. A TypeScript reference implementation tells a Rust maintainer little about whether their code is correct. A conformance test tells them precisely, and when it doesn't, the disagreement surfaces an ambiguity in the spec itself.

### Keeping the conformance suite alive

The conformance suite is the yardstick SEP-1730's tier percentages measure against. If it falls behind, an SDK could be "100% compliant" while missing major specification features. Tying tests to the SEP lifecycle creates a forcing function: the suite grows exactly as fast as the spec does.

## Specification

### Scope

This requirement applies **only** to Standards Track SEPs that introduce or modify **observable protocol behavior**: behavior a conformant peer can detect by inspecting messages on the wire, transport-observable side effects (HTTP status codes, headers, connection lifecycle, OAuth redirects), or process-observable side effects for local transports (stdio stream content, exit codes).

The following are **exempt**:

- **Process SEPs** (governance, workflow, community structure)
- **Informational SEPs** (guidelines, best practices without normative force)
- **Standards Track SEPs with no observable protocol behavior**, for example:
  - Documentation-only clarifications of existing behavior
  - Schema annotations that do not change validation or runtime behavior
  - Security recommendations describing implementation hardening rather than wire-level requirements

The conformance suite itself is not restricted to official SDKs. Any implementation (official SDK, community SDK, or custom deployment) may run it and report a compliance percentage.

### The requirement

For a Standards Track SEP in scope to transition from `Accepted` to `Final`:

1. **A conformance scenario** tagged with the SEP number is merged into the conformance repository, targeting the date-prefixed draft spec version the SEP is slated for (e.g. `YYYY-MM-draft`).
2. **A traceability file** accompanies the scenario. See below.
3. **The scenario passes** against the SEP's reference implementation.

When that spec version is released, the scenario's spec-version tag is updated from `YYYY-MM-draft` to the dated version as part of the normal release process. The conformance harness and the SDK under test must both recognize the draft tag as a negotiable protocol version so that the new requirements are actually exercised.

### Traceability file

The traceability file is a structured file (`sep-NNNN.yaml`) co-located with the scenario in the conformance repository. It maps each normative requirement in the SEP's Specification section to the check that exercises it, or documents why it is excluded:

```yaml
sep: 1234
spec_url: https://modelcontextprotocol.io/specification/draft/section#anchor
requirements:
  - text: "MUST include `foo` in the response"
    check: sep-1234-foo-present
  - text: "MUST NOT send `bar` before initialization"
    check: sep-1234-bar-absent
  - text: "SHOULD include `qux` when available"
    check: sep-1234-qux-present
  - text: "MUST reject requests with invalid `baz`"
    check: sep-1234-baz-rejected
  - text: "MUST retry on 503"
    excluded: "Requires fault injection; not currently supported by framework"
    issue: https://github.com/modelcontextprotocol/conformance/issues/N
  - text: "MUST be rendered in a monospace font"
    excluded: "Client rendering; not observable at the protocol level"
```

Structured data lets tooling link check failures back to spec sections and lets the conformance CLI report coverage per SEP.

Exclusions come in two flavors. **Framework gaps** (the behavior is observable but the framework can't express it yet) should link a tracking `issue`. **Not protocol-observable** (the requirement governs client rendering, implementation internals, or similar) needs only the `excluded` reason. A SEP whose requirements are all the second kind is exempt and doesn't need a scenario at all.

The sponsor verifies the traceability file is complete: every MUST, MUST NOT, SHOULD, and SHOULD NOT (and RFC 2119 equivalents: SHALL, REQUIRED, RECOMMENDED) in the SEP's Specification section has a row. Checks for SHOULD-level requirements report as warnings rather than failures. MAY requirements do not need rows. The sponsor does not review test code; that is the conformance repository's normal PR review. What counts as a normative requirement is the sponsor's call.

### Who writes the tests

The **sponsor** is responsible for ensuring a conformance scenario is written. Scenarios are authored in TypeScript; contributors unfamiliar with the conformance repository should start with its [CONTRIBUTING guide](https://github.com/modelcontextprotocol/conformance/blob/main/CONTRIBUTING.md). In practice the SEP author is often best positioned, since writing the test surfaces ambiguities in the normative language that are cheaper to fix before `Final` than after.

### Specification text is authoritative

Conformance tests are derived from and **subordinate to** the specification text. Where a test and the spec disagree, the spec is authoritative and the test is a bug.

### Conformance test disputes

If an implementer believes a merged conformance test contradicts the spec, they open an issue in the conformance repository citing the specific spec text. A test is considered disputed once a conformance maintainer applies the `disputed` label; disputed tests do not affect SEP-1730 tier assessments until resolved.

Most disputes resolve through normal issue triage: the test is fixed, the spec is clarified, or the dispute is closed with rationale. If the disagreement is fundamental (the disputing party and the conformance maintainers cannot agree on what the spec means), either party may escalate unilaterally to Core Maintainers for a ruling, though joint escalation is preferred since the goal is to resolve ambiguity rather than win an argument. The same escalation path is available to a sponsor if a scenario PR is blocked on non-technical grounds.

### Test stability and tiering

SEP-1730 tier assessments are run against a **pinned conformance release version**, not the tip of the conformance repository. New checks added to a SEP's scenario after the SEP is `Final` (whether additional edge cases or coverage of previously-excluded requirements) land in the conformance repository's main branch but only affect tier percentages when the next tiering assessment adopts a newer conformance release.

This means SDK maintainers have a stable target between tiering waves, and the conformance suite can evolve continuously without surprise regressions in tier status.

### Sponsor responsibilities

SEP-1850 makes the sponsor responsible for tracking reference implementation progress before marking a SEP as `Final`. This SEP extends that responsibility: for Standards Track SEPs in scope, the sponsor also confirms that a conformance scenario tagged with the SEP number is merged with a complete traceability file, or that an exemption is documented in the SEP.

### Relationship to SEP-1730 (SDK Tiering)

This SEP strengthens SEP-1730's foundation without changing its tier definitions or thresholds. Tier assessments use pinned conformance releases, so new checks do not retroactively affect tier status. Disputed tests do not count toward tier percentages until resolved.

Scenario contributions covering existing spec behavior (not tied to a new SEP) remain welcome and are not required to carry a traceability file.

### Relationship to SEP-1627 (Conformance Testing)

This SEP **supersedes** SEP-1627 by accepting the conformance repository as the canonical home for conformance tests and formalizing its role in the SEP lifecycle. SEP-1627's golden-trace approach was not carried forward; the scenario-and-checks model trades language-neutral fixtures for runtime expressiveness. SEP-1627's protocol-debugger ideas remain valuable future work.

## Rationale

### Why gate `Final` rather than `Accepted`?

Gating `Accepted` would require tests before Core Maintainers have agreed the feature belongs in the spec, wasting effort on rejected SEPs.

That said, writing a conformance test _during_ SEP drafting is often valuable: it forces precision in MUST/MUST NOT language and surfaces edge cases the prose glosses over. Authors are **encouraged** to draft a conformance scenario before Core Maintainer review, especially for SEPs with complex behavioral requirements. It is not required, because small SEPs may not justify the upfront effort, and a rejected SEP's test is wasted work.

Gating `Final` places the hard requirement where the reference implementation requirement already sits: the SEP has consensus, and the remaining work is implementation.

### Why a traceability file?

Without a defined coverage bar, "has a conformance test" would be relitigated on every SEP: does one check suffice, or must every MUST be covered? The traceability file makes coverage auditable: every normative statement has a row, and every row is either a check or a documented exclusion. "Sufficient" becomes "the file is complete."

The file also makes gaps visible. A SEP with ten MUSTs and eight exclusions is a signal: either the SEP is genuinely hard to test (the tracking issues say why) or the test author stopped early (the sponsor should push back).

### Why put the authorship obligation on the sponsor?

The sponsor already shepherds the SEP through review, tracks the reference implementation, and manages status transitions. Adding "ensure a conformance test is written" is a small marginal addition to an existing role, with a clear owner.

### Alternatives considered

**Require conformance tests in the SEP PR itself.** Rejected: couples two independent review processes with different maintainers and CI.

**Gate only "major" SEPs.** Rejected: "major" is subjective. The observable-behavior scope is objective: either a conformant peer can detect the change, or it cannot.

**Make conformance maintainers the sufficiency judges.** Rejected: concentrates veto power in a group not elected to approve spec changes. The traceability-file model lets the sponsor verify completeness without reading test code.

## Backward Compatibility

This SEP is **not retroactive**. SEPs that reached `Final` before this SEP takes effect are not required to add conformance tests, though contributions are welcome.

## Security Implications

None directly. Conformance tests that exercise security-relevant behavior (auth flows, input validation, transport security) improve the ecosystem's security posture by catching regressions, but this SEP does not mandate security-specific coverage beyond what the underlying SEP's MUSTs require.

## Reference Implementation

The conformance repository already demonstrates the scenario-tagging pattern this SEP formalizes:

- [`JsonSchema2020_12Scenario`](https://github.com/modelcontextprotocol/conformance/blob/main/src/scenarios/server/json-schema-2020-12.ts) — SEP-1613
- [`ElicitationDefaultsScenario`](https://github.com/modelcontextprotocol/conformance/blob/main/src/scenarios/server/elicitation-defaults.ts) — SEP-1034
- [`ServerSSEPollingScenario`](https://github.com/modelcontextprotocol/conformance/blob/main/src/scenarios/server/sse-polling.ts) — SEP-1699
- [`ElicitationEnumsScenario`](https://github.com/modelcontextprotocol/conformance/blob/main/src/scenarios/server/elicitation-enums.ts) — SEP-1330

The structured traceability file format and the scenario scaffolding tool (`npx @modelcontextprotocol/conformance new-scenario --sep <number>`) will be added to the conformance repository before this SEP reaches `Final`.

The process change is implemented by updating `docs/community/sep-guidelines.mdx` to add the conformance check to the `Accepted → Final` transition (see the accompanying changes in this PR).

## Prerequisites for Final status

Before this SEP itself can be marked `Final`, the following conformance-repository work must be complete:

- Structured traceability file format (`sep-NNNN.yaml`) and schema
- Scenario scaffolding tool
- Conformance harness supports date-prefixed draft versions (e.g. `YYYY-MM-draft`) as negotiable protocol versions
- `MAINTAINERS.md` published and the repository listed in MCP governance documentation

These are this SEP's own reference implementation checklist, not ongoing process requirements.
