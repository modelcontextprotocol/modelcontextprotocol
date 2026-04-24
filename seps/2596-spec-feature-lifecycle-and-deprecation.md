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
independent lifecycle of SDK-specific APIs, registry policies, extensions (which are versioned
independently per [SEP-2133][sep-2133]), or the revision lifecycle of the specification document
itself (Draft, Current, Final), which is defined in the [versioning guide][versioning].

Note that "Final" is used in two senses in this document: a specification _revision_ is Final when
superseded by a later one (per the versioning guide), and a _SEP_ reaches Final when its status
advances per the [SEP guidelines][sep-guidelines]. Context disambiguates; where it does not, this
document writes "the SEP reaches Final" or "Final revision" explicitly.

### Feature states

A specification feature is in exactly one of three states:

| State          | Meaning                                                                                                                                                       | Implementer expectation                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Active**     | The feature is part of the Current specification revision with no planned removal.                                                                            | Implement per the feature's normative requirements.                                                                         |
| **Deprecated** | The feature remains in the specification but is scheduled for removal. A migration path is documented (see below).                                                        | New implementations SHOULD NOT adopt the feature. Existing implementations SHOULD migrate before the earliest removal date. |
| **Removed**    | The feature has been deleted from `draft` and will be absent from the next Current revision. It remains documented in the Final revision it last appeared in. | Implementations targeting that next Current revision MUST NOT depend on the feature.                                        |

The term "soft-deprecated" is retired. Existing uses in the specification are reclassified as
Deprecated under this policy (see [Transition](#transition)).

A Deprecated feature MAY be restored to Active by a SEP that supersedes the deprecation SEP and
documents the changed circumstances. Restoration follows the same approval path as deprecation. If
the feature is later deprecated again, the minimum removal window in [Deprecating a
feature](#deprecating-a-feature) is measured afresh from the new deprecation.

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
   names a replacement feature, that feature MUST already be Active in a specification revision
   that has been released as Current. Where the migration path leads outside the core
   specification, the equivalent bar applies: for an extension under [SEP-2133][sep-2133], its
   Extensions Track SEP MUST have reached Final and the extension MUST be published in an `ext-*`
   (not `experimental-ext-*`) repository; for an SDK convention, it MUST be available in a stable
   release of every Tier 1 SDK. A feature is not deprecated under this policy while its documented
   replacement is still pending.
4. Specify the **earliest removal date**: a calendar date (`YYYY-MM-DD`) on or after which the
   feature may be removed. This date MUST be at least twelve months after the date the deprecation
   SEP reaches Final and MAY be adjusted before Final to maintain that floor. The feature is
   eligible for removal in the first specification revision released as Current on or after this
   date.

The feature is Deprecated from the date the deprecation SEP reaches Final; the state transition
does not wait for the next specification revision. At that point the following changes land in the
draft specification (`schema/draft/` and `docs/specification/draft/`) and surface in the next
revision when it is promoted to Current under the [versioning guide][versioning]:

- The feature's entry in `schema.ts` gains a `@deprecated` JSDoc tag referencing the deprecation
  SEP and the earliest removal date.
- The specification prose for the feature gains a deprecation notice with the same information.
- The `changelog.mdx` for the next revision gains an entry under a "Deprecated" heading. This SEP
  introduces "Deprecated" and "Removed" as standing changelog headings alongside the existing
  Major/Minor/Other groupings.
- Tier 1 SDKs (per [SEP-1730][sep-1730]) SHOULD mark the corresponding API surface deprecated using
  their language's native mechanism (for example `@Deprecated` in Java, `[Obsolete]` in .NET, the
  `Deprecated:` doc convention in Go) in their next release after the revision is released as
  Current.

### Removing a feature

Removal requires a second SEP. The removal SEP MAY be opened at any time after the deprecation SEP
reaches Final, but MUST NOT itself reach Final before the earliest removal date. This allows the
removal SEP to be drafted and reviewed during the deprecation window so that the deletion can land
in the first revision released on or after that date.

The removal SEP MUST:

1. Reference the deprecation SEP.
2. Confirm that the earliest removal date has been reached.
3. Confirm that the migration target named in the deprecation SEP, if any, remains Active in the
   revision from which removal is proposed. (It was Active when the deprecation landed per
   [Deprecating a feature](#deprecating-a-feature); this re-checks that it has not itself been
   deprecated in the interim.) Where the migration target is outside the core specification,
   confirm instead that it still meets the bar in item 3 of [Deprecating a
   feature](#deprecating-a-feature).
4. Confirm that all Tier 1 SDKs (per [SEP-1730][sep-1730]) have shipped a stable release in which a
   user can complete the documented migration without depending on the deprecated feature. This
   does not require the SDK to have removed the feature; it requires the replacement (or the
   ability to operate without the feature, where no replacement is specified) to be available in a
   stable SDK release. Core Maintainers may waive this confirmation under the [governance decision
   process][governance-decisions], with rationale recorded in the removal SEP.

A feature MAY remain Deprecated indefinitely if no removal SEP is opened. The earliest removal date
sets the point at which removal becomes permissible; it does not oblige removal to happen. This
accommodates cases where ecosystem migration is slower than anticipated; the deprecation notice and
earliest removal date remain as the planning signal even if removal is deferred.

When the removal SEP reaches Final, the feature is deleted from `schema/draft/schema.ts` (where
present) and the draft specification prose, and `changelog.mdx` gains an entry under the "Removed"
heading that links to both SEPs and the last Final revision in which the feature was present.

### Relocating a feature to an extension

A feature that sees low usage in core but remains valuable to some implementers MAY be relocated to
an optional extension under [SEP-2133][sep-2133] rather than retired outright. Relocation follows
the same two-SEP procedure:

- The deprecation SEP names the extension as the migration target. Per item 3 of [Deprecating a
  feature](#deprecating-a-feature), the extension's Extensions Track SEP MUST have reached Final
  and the extension MUST be published in an `ext-*` repository before the deprecation lands.
- The removal SEP deletes the feature from core. The changelog entry under "Removed" records the
  relocation and links the extension so that implementations that still need the feature can
  obtain it there.

This is the expected path for the cases in [Motivation](#motivation) where surface area is moved
out of core rather than abandoned, such as [SEP-2577][sep-2577].

### Expedited removal

The twelve-month floor MAY be shortened when the feature presents an active security risk, meaning
a vulnerability with a published security advisory or documented in-the-wild exploitation for which
no in-place mitigation exists. Shortening the window requires Core Maintainer approval under the
[governance decision process][governance-decisions], recorded in the deprecation SEP or, where the
risk surfaces after that SEP is already Final, in the removal SEP. The shortened window MUST still
provide at least ninety days between the date the deprecation SEP reaches Final and the earliest
removal date.

### Roles

| Action                                       | Who                                                                           |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| Propose deprecation, removal, or restoration | Any contributor, per the SEP process                                          |
| Sponsor                                      | A Maintainer or Core Maintainer, per the SEP process                          |
| Approve deprecation or removal SEP           | Core Maintainers, per the [governance decision process][governance-decisions] |
| Approve restoration to Active                | Core Maintainers, per the [governance decision process][governance-decisions] |
| Approve expedited removal                    | Core Maintainers, per the [governance decision process][governance-decisions] |
| Waive Tier-1 SDK confirmation (removal)      | Core Maintainers, per the [governance decision process][governance-decisions] |

As with all Core Maintainer decisions, Lead Maintainers retain veto authority over each of the
approvals above, per the [governance roles][governance-roles] definition.

[governance-roles]: https://modelcontextprotocol.io/community/governance#roles

### Transition

Two features were already described as deprecated in the specification before this policy existed
(see [Motivation](#motivation)). When this SEP reaches Final they are classified as Deprecated, and
the deprecation-SEP requirements in [Deprecating a feature](#deprecating-a-feature) are not
applied retroactively. The deprecation decision in each case predates this policy; this section
records it under the new vocabulary so the terms "deprecated" and "soft-deprecated" carry a single
defined meaning going forward.

For the purposes of [Removing a feature](#removing-a-feature), the migration target and earliest
removal date for each are recorded below. Unless a feature-specific SEP sets a different date, the
earliest removal date is twelve months after this SEP reaches Final.

| Feature                                         | Migration target                     | Earliest removal                      |
| ----------------------------------------------- | ------------------------------------ | ------------------------------------- |
| HTTP+SSE transport                              | [Streamable HTTP][transports-compat] | Twelve months after this SEP is Final |
| `includeContext: "thisServer"` / `"allServers"` | Omit the field or use `"none"`       | Twelve months after this SEP is Final |

This grandfathering applies only to features the specification already described as deprecated on
the date this SEP reaches Final. Every subsequent deprecation follows [Deprecating a
feature](#deprecating-a-feature) in full, and removal of the grandfathered features follows
[Removing a feature](#removing-a-feature) without exception.

The [versioning guide][versioning] is updated to reference this policy.

## Rationale

### Why a separate state model from specification revisions?

The [versioning guide][versioning] already defines Draft, Current, and Final for specification
_revisions_. Those states describe the editorial maturity of a whole document and say nothing about
whether a given message or field within a Current revision is on its way out. The [Kubernetes
deprecation policy][k8s-deprecation], the [Node.js deprecation cycle][nodejs-deprecation], and IETF
practice such as [RFC 8996][rfc-8996] (which deprecates TLS 1.0 and 1.1 within the TLS protocol
family) all maintain feature-level deprecation rules alongside their release versioning for this
reason.

### Why two SEPs (deprecate, then remove)?

Requiring a second SEP for removal creates an explicit checkpoint after the ecosystem has had time
to react. The approach mirrors the tier advancement procedure in [SEP-1730][sep-1730], where
advancement requires a deliberate maintainer decision rather than a timer expiring, and is
consistent with the [SEP guidelines][sep-guidelines] already treating removal of a protocol feature
as SEP-worthy.

### Why twelve months?

The [NYC maintainer meeting][nyc-2026-03-31] floated a "one year supported plus one year
deprecation" model and recorded reluctance to commit to longer windows given how quickly the
agentic space is moving. The same discussion flagged even that model as a possible burden on SDK
maintainers; this SEP keeps the twelve-month floor because the
removal SEP's Tier-1 SDK confirmation (item 4) is the relief valve for that burden, allowing
removal to wait on the SDKs rather than the SDKs racing the calendar. It spans at least two of the
six-month release cycles discussed at the same meeting: one for SDK maintainers to ship migration
support and one for downstream adoption. Core Maintainers may leave a feature Deprecated for
longer; twelve months is the minimum.

### Relationship to SEP-1400 (Semantic Versioning)

[SEP-1400][sep-1400] proposes replacing date-based revision identifiers with semantic versioning.
The two proposals address different questions: SEP-1400 is about how revisions are numbered, and
this SEP is about how features within a revision are retired. This SEP uses a calendar earliest
removal date specifically so that it does not depend on the revision identifier scheme; it applies
unchanged whether revisions are dated or semantically versioned.

### Consensus

Direction was agreed at the [NYC maintainer meeting (March 31, 2026)][nyc-2026-03-31] and confirmed
at the [April 1, 2026 Core Maintainer meeting][cm-2026-04-01], which recorded "formal versioning
status and SDK deprecation cycle (direction agreed, mechanics TBD)." Community demand is visible in
[discussion #2177][disc-2177] (asking when SSE removal will happen) and [discussion
#1980][disc-1980] (asking to sunset a backwards-compatibility requirement that has outlived its
purpose).

## Backward Compatibility

This SEP introduces a process and does not change protocol behaviour. The
[Transition](#transition) section assigns a Deprecated state and earliest removal date to two
features that are already informally deprecated, making their status explicit without shortening
any implied timeline.

## Security Implications

None identified. This is a governance change with no new protocol surface, transport,
authentication flow, or trust boundary. A defined deprecation path has an indirect security
benefit: it gives the project a predictable mechanism for retiring features that are later found to
be unsafe, which is what the [Expedited removal](#expedited-removal) clause is for.

## Reference Implementation

For a Process SEP the reference implementation is the policy applied to a real case. The
[Transition](#transition) section applies it to the two existing informal deprecations, and a
follow-up pull request will:

- Add a `@deprecated` JSDoc note to the `includeContext` property in `schema/draft/schema.ts`
  identifying `"thisServer"` and `"allServers"` as deprecated (the property is a string-literal
  union, so per-value tags are not possible).
- Add a deprecation notice to the HTTP+SSE section of `docs/specification/draft/basic/transports.mdx`
  (the transport has no `schema.ts` types).
- Introduce the "Deprecated" heading in `docs/specification/draft/changelog.mdx` with both entries.
- Update `docs/docs/learn/versioning.mdx` to link to this policy.

That pull request serves as the running-code validation before this SEP advances to Final.

---

## Open Questions

- **Specification revision support window.** The NYC meeting also discussed how long Tier-1 SDKs
  must support a given specification _revision_ (as distinct from a feature within one). That
  policy is related but separate and may belong in an amendment to [SEP-1730][sep-1730].
- **Telemetry source for the "negligible adoption" criterion.** The policy permits deprecation on
  adoption grounds, but the project has no shared telemetry today. Until one exists, this criterion
  relies on SDK maintainer attestation.
- **Feature maturity tiers.** This SEP applies a uniform twelve-month floor to every Active
  feature. The [Kubernetes deprecation policy][k8s-deprecation] uses alpha/beta/GA tiers with
  shorter windows for less mature features, which would have allowed the JSON-RPC batching reversal
  cited in [Motivation](#motivation) without a year-long deprecation. Whether MCP should adopt an
  Experimental tier with a shorter or zero window is left for a follow-up SEP.
- **Runtime deprecation signal.** Signaling under this policy is documentation-only (`@deprecated`
  JSDoc, prose notice, changelog). Implementers that do not use an official SDK and do not read the
  changelog receive no warning before removal. A wire-level signal (for example a `_meta`
  deprecation field on responses, comparable to the Kubernetes `Warning` header) would close that
  gap but is a Standards Track change outside the scope of this Process SEP.

[transports-compat]: https://modelcontextprotocol.io/specification/draft/basic/transports#backwards-compatibility
[sampling-includecontext]: https://modelcontextprotocol.io/specification/draft/client/sampling
[versioning]: https://modelcontextprotocol.io/docs/learn/versioning
[design-principles]: https://modelcontextprotocol.io/community/design-principles
[sep-guidelines]: https://modelcontextprotocol.io/community/sep-guidelines
[governance-decisions]: https://modelcontextprotocol.io/community/governance#decision-process
[sep-1730]: https://modelcontextprotocol.io/seps/1730-sdks-tiering-system
[sep-2133]: https://modelcontextprotocol.io/seps/2133-extensions
[sep-1400]: https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1400
[issue-1540]: https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1540
[sep-2577]: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2577
[nyc-2026-03-31]: https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/2547
[cm-2026-04-01]: https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/2536
[disc-2177]: https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/2177
[disc-1980]: https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/1980
[k8s-deprecation]: https://kubernetes.io/docs/reference/using-api/deprecation-policy/
[nodejs-deprecation]: https://nodejs.org/api/deprecations.html
[rfc-8996]: https://www.rfc-editor.org/rfc/rfc8996
