# SEP-2596: Specification Feature Lifecycle and Deprecation Policy

- **Status**: Draft
- **Type**: Process
- **Created**: 2026-04-17
- **Author(s)**: Den Delimarsky (@localden)
- **Sponsor**: @localden
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2596

## Abstract

This SEP defines a lifecycle for individual features within the Model Context Protocol
specification, separate from the revision lifecycle of the specification document itself. It
introduces three feature states (Active, Deprecated, Removed), the criteria and procedure for
moving between them, a minimum window between deprecation and removal, and the documentation
required at each transition. The goal is a predictable timeline that SDK authors and implementers
can plan migrations against when protocol surface area is retired.

## Motivation

The specification has already retired or signaled retirement of several features, but each case
has been handled ad hoc:

- The HTTP+SSE transport is described as "deprecated" in the
  [Streamable HTTP backwards-compatibility guidance][transports-compat], with no stated removal
  date.
- The `includeContext` values `"thisServer"` and `"allServers"` are labeled "soft-deprecated" in
  [`sampling/createMessage`][sampling-includecontext] and in `schema.ts`, with the note that they
  "may be removed in future spec releases."
- JSON-RPC batching was added in revision `2025-03-26` and removed in `2025-06-18`, a single
  release later, with no deprecation period.
- Open proposals such as consolidating `Resource` and `ResourceTemplate` ([#1540][issue-1540]) and
  deprecating roots, sampling, and logging ([SEP-2577][sep-2577]) would each retire existing
  surface area but have no process to follow.

This inconsistency has costs. Implementers cannot tell whether "deprecated" and "soft-deprecated"
mean different things, or how long either state lasts before removal. Community questions such as
[discussion #2177][disc-2177] (asking when the SSE transport will actually be removed) have no
policy to point to. At the [NYC maintainer meeting][nyc-2026-03-31], large implementers described
indefinite support for past protocol versions as "corrosive tech debt." The [Stability over
velocity][design-principles] design principle observes that "removing from \[the spec\] is nearly
impossible" but offers no path for the cases where removal is warranted.

The Core Maintainers agreed at the [April 1, 2026 meeting][cm-2026-04-01] that MCP needs "a formal
versioning status and a defined deprecation cycle" with "direction agreed, mechanics TBD." This SEP
proposes those mechanics.

## Specification

### Scope

This policy governs **features** of the MCP core specification: protocol messages, capabilities,
transports, schema types, and normative behavioral requirements. It does not govern the
independent lifecycle of SDK-specific APIs, registry policies, or the revision lifecycle of the
specification document itself (Draft, Current, Final), which is defined in the [versioning
guide][versioning].

Note that "Final" is used in two senses in this document: a specification _revision_ is Final when
superseded by a later one (per the versioning guide), and a _SEP_ reaches Final when its status
advances per the [SEP guidelines][sep-guidelines]. Context disambiguates; where it does not, this
document writes "the SEP reaches Final" or "Final revision" explicitly.

### Feature states

A specification feature is in exactly one of three states:

| State          | Meaning                                                                                                                                                       | Implementer expectation                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Active**     | The feature is part of the Current specification revision with no planned removal.                                                                            | Implement per the feature's normative requirements.                                                                         |
| **Deprecated** | The feature remains in the specification but is scheduled for removal. A migration path is documented (see below).                                            | New implementations SHOULD NOT adopt the feature. Existing implementations SHOULD migrate before the earliest removal date. |
| **Removed**    | The feature has been deleted from `draft` and will be absent from the next Current revision. It remains documented in the Final revision it last appeared in. | Implementations targeting that next Current revision MUST NOT depend on the feature.                                        |

The term "soft-deprecated" is retired. Existing uses in the specification are reclassified as
Deprecated under this policy (see [Transition](#transition)).

Removal from the specification does not oblige an SDK to drop the feature from releases that
continue to support an earlier revision in which it was Active or Deprecated; that timeline is
governed by the SDK's own revision-support policy (see [Open Questions](#open-questions)).

A Deprecated feature MAY be restored to Active by a SEP that supersedes the deprecation SEP and
documents the changed circumstances. Restoration follows the same approval path as deprecation. If
the feature is later deprecated again, the minimum deprecation window in [Deprecating a
feature](#deprecating-a-feature) is measured afresh from the revision in which the new deprecation
takes effect.

### Deprecating a feature

A feature MAY be proposed for deprecation when at least one of the following holds:

- It has been superseded by another feature that covers the same use cases.
- It presents a security, privacy, or interoperability risk that cannot be mitigated in place.
- Ecosystem telemetry or SDK maintainer consensus indicates negligible adoption relative to its
  maintenance cost.

Deprecation is a specification change and therefore requires a SEP per the [SEP
guidelines][sep-guidelines]. The deprecation SEP MUST:

1. Identify the feature by name and link to its definition in `schema.ts` (where applicable) and
   the specification prose.
2. State the rationale against the criteria above.
3. Document the migration path, or state explicitly that none is required. If the migration path
   names a replacement feature, that feature MUST be Active in the revision in which the
   deprecation takes effect; the replacement and the deprecation MAY land in the same revision. A
   feature is not deprecated under this policy while its documented replacement is still only in
   `draft`.
4. Specify the **minimum deprecation window**: the number of months, at least twelve, that the
   feature MUST remain Deprecated before it is eligible for removal. The window is measured from
   the release of the specification revision in which the feature is first marked Deprecated, not
   from the date the SEP reaches Final. The feature becomes eligible for removal in the first
   specification revision released as Current on or after the window elapses; that point is the
   feature's **earliest removal**.

When the deprecation SEP reaches Final the deprecation is scheduled: the following changes land in
the draft specification (`schema/draft/` and `docs/specification/draft/`). The feature becomes
Deprecated when the revision carrying these changes is released as Current under the [versioning
guide][versioning], and the minimum deprecation window is counted from that release. Anchoring the
clock to the revision release means every feature deprecated in the same revision shares one
earliest removal rather than each carrying a date derived from when its own SEP happened to land.

- The feature's entry in `schema.ts` gains a `@deprecated` JSDoc tag referencing the deprecation
  SEP and the revision in which the deprecation takes effect.
- The specification prose for the feature gains a deprecation notice with the same information.
- The `changelog.mdx` for that revision gains an entry under a "Deprecated" heading. This SEP
  introduces "Deprecated" and "Removed" as standing changelog headings alongside the existing
  Major/Minor/Other groupings.
- The feature is added to the [deprecated registry](#the-deprecated-registry) with its deprecation
  SEP, the revision in which it became Deprecated, its migration path, and its earliest removal.

### The deprecated registry

`docs/specification/draft/deprecated.mdx` is a single page listing every feature currently in the
Deprecated state. It is the canonical answer to "what is on its way out, and by when," so that an
implementer does not have to reconstruct that picture from deprecation entries spread across
revision changelogs. Each row records the feature, its deprecation SEP, the revision in which it
became Deprecated, the documented migration path, and its earliest removal. A deprecation adds a
row; a removal moves the row to a Removed section of the same page with a link to the changelog
entry, so the page also serves as the historical record. The registry carries no normative force
of its own; it is a derived view kept consistent with the per-feature notices and changelog
entries, which are the normative records.

### Tier 1 SDK obligations

A feature lifecycle is only as effective as the implementations that surface it to consumers. The
specification artifacts above record that a feature is Deprecated; Tier 1 SDKs (per
[SEP-1730][sep-1730]) deliver that record to the implementers who would otherwise discover the
removal by breakage. Once the revision in which a feature becomes Deprecated is released as
Current, Tier 1 SDKs:

- MUST mark the corresponding API surface deprecated using the language's native mechanism (for
  example `@Deprecated` in Java, `[Obsolete]` in .NET, `@deprecated` JSDoc in TypeScript, the
  `Deprecated:` doc convention in Go) in their next release, referencing the deprecation SEP and
  the earliest removal date where the mechanism permits. The marker applies to the SDK API surface
  and is not conditioned on the specification revision a consumer targets; surfacing it to
  consumers still on an earlier revision is intentional forward signal.
- SHOULD emit a runtime warning when a deprecated feature is exercised, using the language's
  idiomatic mechanism (for example Python's `DeprecationWarning`, Node.js's
  `process.emitWarning`, or a configurable logger). A runtime warning reaches developers who never
  read API documentation and is an observable signal a conformance test can assert against.

These obligations are conformance criteria for Tier 1 status. A Tier 1 SDK that persistently fails
to surface a Deprecated feature is subject to the [Tier Relegation Process][sep-1730-relegation]
in [SEP-1730][sep-1730].

### Removing a feature

1. Once a feature is set for removal, the removal is executed at the discretion of the Core
   Maintainers after the minimum deprecation window has elapsed, during release preparation,
   under the [governance decision process][governance-decisions]. Removal does not require its
   own SEP. Before removing a feature the Core Maintainers MUST confirm that the migration target
   named in the deprecation SEP, if any, is still Active.
2. A SEP is required for any other change to a deprecation or removal, for example extending or
   shortening the timeline ([Expedited removal](#expedited-removal)) or restoring the feature to
   Active ([Feature states](#feature-states)).

Note that features may remain Deprecated, without removal, for much longer than the minimum
deprecation window.

SDKs implement deprecation as part of the [SDK Tiering System][sep-1730] (see [Tier 1 SDK
obligations](#tier-1-sdk-obligations)); removal imposes no additional requirements on SDK
maintainers.

When a removal decision is taken, the feature is deleted from `schema/draft/schema.ts` (where
present) and the draft specification prose; `changelog.mdx` for that revision gains an entry under
the "Removed" heading that links to the deprecation SEP and the last Final revision in which the
feature was present; and the feature's [registry](#the-deprecated-registry) row moves to the
Removed section with a link to that changelog entry.

### Expedited removal

The twelve-month floor MAY be shortened when the feature presents an active security risk, meaning
a vulnerability with a published security advisory or documented in-the-wild exploitation for which
no in-place mitigation exists. Shortening the window requires Core Maintainer approval under the
[governance decision process][governance-decisions], recorded in the deprecation SEP or, where the
risk surfaces after that SEP is already Final, in a short expedited-removal SEP that references it.
The shortened window MUST still provide at least ninety days between the feature becoming
Deprecated and its earliest removal.

### Roles

| Action                                         | Who                                                                           |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| Propose deprecation, extension, or restoration | Any contributor, per the SEP process                                          |
| Sponsor                                        | A Maintainer or Core Maintainer, per the SEP process                          |
| Approve a deprecation SEP                      | Core Maintainers, per the [governance decision process][governance-decisions] |
| Decide a removal during release preparation    | Core Maintainers, per the [governance decision process][governance-decisions] |
| Approve an extension or restoration SEP        | Core Maintainers, per the [governance decision process][governance-decisions] |
| Approve expedited removal                      | Core Maintainers, per the [governance decision process][governance-decisions] |

As with all Core Maintainer decisions, Lead Maintainers retain veto authority over each of the
approvals above, per the [governance roles][governance-roles] definition.

[governance-roles]: https://modelcontextprotocol.io/community/governance#roles

### Transition

Two features were already described as deprecated in the specification before this policy existed
(see [Motivation](#motivation)). When this SEP reaches Final they are classified as Deprecated and
seeded into the [registry](#the-deprecated-registry); the deprecation-SEP requirements in
[Deprecating a feature](#deprecating-a-feature) are not applied retroactively. The deprecation
decision in each case predates this policy; this section records it under the new vocabulary so the
terms "deprecated" and "soft-deprecated" carry a single defined meaning going forward.

Both features were publicly deprecated well over twelve months before this SEP, so the minimum
deprecation window has in practice already been served; re-anchoring their clock to a future
revision release would restart a window the ecosystem has already had. Each is therefore given a
three-month grace period from the date this SEP reaches Final before it is eligible for removal,
matching the floor the [Expedited removal](#expedited-removal) clause sets for the shortest
permissible window. Removal still follows [Removing a feature](#removing-a-feature): a Core
Maintainer decision at release preparation, not an automatic event when the grace period ends.

| Feature                                         | Migration target                     | Earliest removal                        |
| ----------------------------------------------- | ------------------------------------ | --------------------------------------- |
| HTTP+SSE transport                              | [Streamable HTTP][transports-compat] | Three months after this SEP is Final    |
| `includeContext: "thisServer"` / `"allServers"` | Omit the field or use `"none"`       | Follows Sampling ([SEP-2577][sep-2577]) |

`includeContext` is a parameter of `sampling/createMessage`. [SEP-2577][sep-2577] deprecates the
Sampling feature as a whole; the two affected `includeContext` values follow that feature's
deprecation schedule rather than carrying an independent removal clock, and are removed no later
than Sampling itself.

This grandfathering applies only to features the specification already described as deprecated on
the date this SEP reaches Final. Every subsequent deprecation follows [Deprecating a
feature](#deprecating-a-feature) in full, and removal of the grandfathered features follows
[Removing a feature](#removing-a-feature) without exception.

When this SEP reaches Final the following land in `draft/` directly, with no separate
implementation gate: the [versioning guide][versioning] is updated to reference this policy;
`deprecated.mdx` is created seeded with the two features above; the "Deprecated" heading is added
to `changelog.mdx` with both entries; and each feature gains the `@deprecated` schema annotation
and prose notice described in [Deprecating a feature](#deprecating-a-feature). For
`includeContext` the annotation is on the property as a whole, since per-value `@deprecated` tags
are not expressible on a string-literal union; the HTTP+SSE transport has no `schema.ts` types and
is annotated in the transport prose only.

## Rationale

### Why a separate state model from specification revisions?

The [versioning guide][versioning] already defines Draft, Current, and Final for specification
_revisions_. Those states describe the editorial maturity of a whole document and say nothing about
whether a given message or field within a Current revision is on its way out. The [Kubernetes
deprecation policy][k8s-deprecation], the [Node.js deprecation cycle][nodejs-deprecation], and IETF
practice such as [RFC 8996][rfc-8996] (which deprecates TLS 1.0 and 1.1 within the TLS protocol
family) all maintain feature-level deprecation rules alongside their release versioning for this
reason.

### Why a SEP to deprecate but not to remove?

The deliberation that needs community review is the decision to retire a feature and the choice of
migration path; that is what the deprecation SEP carries. Once it reaches Final the project has
committed to removal and fixed the earliest date, so carrying out that decision on schedule adds no
new judgment and a second SEP for it is process for its own sake. The deliberate maintainer
decision still exists as the release-preparation removal decision and its confirmations in
[Removing a feature](#removing-a-feature), mirroring the tier advancement procedure in
[SEP-1730][sep-1730] where advancement is a maintainer decision rather than a timer expiring. A SEP
is reserved for the cases that do change the committed outcome: extending the window, restoring the
feature, or shortening the floor for a security risk. This keeps the process consistent with the
[SEP guidelines][sep-guidelines] treating a change to protocol surface area as SEP-worthy while not
demanding a SEP to ratify a change already made.

### Why twelve months?

The [NYC maintainer meeting][nyc-2026-03-31] floated a "one year supported plus one year
deprecation" model and recorded reluctance to commit to longer windows given how quickly the
agentic space is moving. The same discussion flagged even that model as a possible burden on SDK
maintainers; this SEP keeps the twelve-month floor because removal is permissive rather than
automatic ([Removing a feature](#removing-a-feature)), so a feature stays Deprecated as long as the
ecosystem needs rather than the SDKs racing the calendar. Measuring the window from the
revision release rather than from the SEP date keeps it observable: it is the same clock SDK
authors and implementers already track for the revision itself. Because the deprecation only takes
effect when its revision is released, a replacement introduced in that same revision is proven over
the twelve-month window itself; a separate prior revision is not required for that purpose. The
window spans at least two of
the six-month release cycles discussed at the same meeting: one for SDK maintainers to ship
migration support and one for downstream adoption. Core Maintainers may leave a feature Deprecated
for longer; twelve months is the minimum.

### Relationship to SEP-1400 (Semantic Versioning)

[SEP-1400][sep-1400] proposes replacing date-based revision identifiers with semantic versioning.
The two proposals address different questions: SEP-1400 is about how revisions are numbered, and
this SEP is about how features within a revision are retired. This SEP measures the removal window
from a revision _release_ rather than from a revision _identifier_, so it does not depend on the
identifier scheme; it applies unchanged whether revisions are dated or semantically versioned.

### Consensus

Direction was agreed at the [NYC maintainer meeting (March 31, 2026)][nyc-2026-03-31] and confirmed
at the [April 1, 2026 Core Maintainer meeting][cm-2026-04-01], which recorded "formal versioning
status and SDK deprecation cycle (direction agreed, mechanics TBD)." Community demand is visible in
[discussion #2177][disc-2177] (asking when SSE removal will happen) and [discussion
#1980][disc-1980] (asking to sunset a backwards-compatibility requirement that has outlived its
purpose).

## Backward Compatibility

This SEP introduces a process and does not change protocol behavior. The
[Transition](#transition) section assigns a Deprecated state and an earliest removal to two
features that are already informally deprecated. Neither had a stated removal date, so making the
timeline explicit (a three-month grace period for features the ecosystem has already had more than
a year to migrate away from) does not shorten any commitment implementers were given.

## Security Implications

None identified. This is a governance change with no new protocol surface, transport,
authentication flow, or trust boundary. A defined deprecation path has an indirect security
benefit: it gives the project a predictable mechanism for retiring features that are later found to
be unsafe, which is what the [Expedited removal](#expedited-removal) clause is for.

## Reference Implementation

This SEP defines a process and has no reference implementation. The specification edits that apply
the policy to the two existing informal deprecations are described in [Transition](#transition) and
land directly in `draft/` when this SEP reaches Final.

---

## Open Questions

- **Specification revision support window.** The NYC meeting also discussed how long Tier 1 SDKs
  must support a given specification _revision_ (as distinct from a feature within one). That
  policy belongs in an amendment to [SEP-1730][sep-1730], but it determines whether the deprecation
  window in this policy is observable in practice. If a Tier 1 SDK supports only the latest
  revision, a consumer that updates the SDK between releases can move directly from one that
  predates the deprecation to one that postdates the removal, never seeing the Deprecated marker
  in [Tier 1 SDK obligations](#tier-1-sdk-obligations). Requiring Tier 1 SDKs to support all
  revisions released as Current within a trailing window at least equal to the twelve-month
  deprecation floor closes that gap. The SEP-1730 amendment should be pursued alongside this SEP.
- **Telemetry source for the "negligible adoption" criterion.** The policy permits deprecation on
  adoption grounds, but the project has no shared telemetry today. Until one exists, this criterion
  relies on SDK maintainer attestation.
- **Feature maturity tiers.** This SEP applies a uniform twelve-month floor to every Active
  feature. The [Kubernetes deprecation policy][k8s-deprecation] uses alpha/beta/GA tiers with
  shorter windows for less mature features, which would have allowed the JSON-RPC batching reversal
  cited in [Motivation](#motivation) without a year-long deprecation. Whether MCP should adopt an
  Experimental tier with a shorter or zero window is left for a follow-up SEP.
- **Wire-level deprecation signal.** [Tier 1 SDK obligations](#tier-1-sdk-obligations) puts the
  deprecation warning into official SDKs; implementers that do not use one and do not read the
  changelog still receive no warning before removal. A wire-level signal (for example a `_meta`
  deprecation field on responses, comparable to the Kubernetes `Warning` header) would close that
  gap but is a Standards Track change outside the scope of this Process SEP.

[transports-compat]: https://modelcontextprotocol.io/specification/draft/basic/transports#backwards-compatibility
[sampling-includecontext]: https://modelcontextprotocol.io/specification/draft/client/sampling
[versioning]: https://modelcontextprotocol.io/docs/learn/versioning
[design-principles]: https://modelcontextprotocol.io/community/design-principles
[sep-guidelines]: https://modelcontextprotocol.io/community/sep-guidelines
[governance-decisions]: https://modelcontextprotocol.io/community/governance#decision-process
[sep-1730]: https://modelcontextprotocol.io/seps/1730-sdks-tiering-system
[sep-1730-relegation]: https://modelcontextprotocol.io/seps/1730-sdks-tiering-system#tier-relegation-process
[sep-1400]: https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1400
[issue-1540]: https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1540
[sep-2577]: https://modelcontextprotocol.io/seps/2577-deprecate-roots-sampling-and-logging
[nyc-2026-03-31]: https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/2547
[cm-2026-04-01]: https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/2536
[disc-2177]: https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/2177
[disc-1980]: https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/1980
[k8s-deprecation]: https://kubernetes.io/docs/reference/using-api/deprecation-policy/
[nodejs-deprecation]: https://nodejs.org/api/deprecations.html
[rfc-8996]: https://www.rfc-editor.org/rfc/rfc8996
