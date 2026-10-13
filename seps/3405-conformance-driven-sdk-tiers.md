# SEP-3405: Conformance-Driven SDK Tiers

- **Status**: Draft
- **Type**: Process
- **Created**: 2026-09-30
- **Author(s)**: Felix Weinberger (@felixweinberger)
- **Sponsor**: Paul Carleton
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3405
- **Supersedes**: SEP-1730 (SDKs Tiering System)

## Abstract

An SDK's tier depends only on which conformance scenarios it passes, on which spec versions, and by when. Process requirements no longer affect a tier. Nobody applies for a tier. An automated process computes every tier. An SDK Working Group maintainer confirms each time an SDK's tier changes before it is published.

|                            | Today, under SEP-1730                                                                   | This SEP                                                                                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tier 1**                 | 100% of applicable tests, on a spec version the SDK chooses, plus process requirements  | Every scenario in the required set, on the three most recent spec versions. Due on the spec release date.                                            |
| **Tier 2**                 | Any 80% of applicable tests, plus process requirements                                  | Every scenario in the required set except the Tier 2 exclusions, on the two most recent spec versions. Due three months after the spec release date. |
| **Tier 3**                 | No minimum                                                                              | No minimum                                                                                                                                           |
| **Process requirements**   | Triage time, critical bug resolution, labels, documentation, roadmap, dependency policy | Not part of a tier                                                                                                                                   |
| **How a tier is assigned** | An application issue, reviewed by the SDK Working Group                                 | Computed by an automated process. An SDK Working Group maintainer confirms each change to an SDK's tier.                                             |
| **Losing a tier**          | After four weeks of failing tests, or two months of unaddressed issues                  | After four weeks of continuously failing what the tier requires                                                                                      |

Separately from tiers, an SDK needs a stable release and a published security policy with a contact to be listed at all.

This SEP takes effect on the next spec release date. Published tiers carry over. An SDK that does not pass what its tier requires on that date moves down four weeks later, unless it passes by then.

## Motivation

Two assessment rounds under SEP-1730 showed the following.

- **Conformance decided every tier.** Tier decisions depended on whether conformance results could be reproduced. We found none that depended on a process requirement.
- **Process requirements were hard to measure.** Triage time, critical bug resolution and documentation coverage could not be measured the same way across repositories.
- **A percentage does not show what is missing.** Some scenarios hold one assertion and some cover a whole feature area. An SDK can pass 80% of scenarios and still lack a core feature.
- **No spec version is required.** The SDK tiers page scores "the specification version the SDK targets". SEP-2596, the feature lifecycle policy, identified this gap and left it to an amendment of SEP-1730.
- **The suite changed during assessment.** SDKs were assessed against different versions of the conformance suite.
- **Manual review does not scale.** Submissions waited for reviewers.

## Specification

### Terms

- **Scenario**: one named test in the conformance suite.
- **Required set**: the scenarios a spec version requires. The [conformance repository](https://github.com/modelcontextprotocol/conformance) lists them by name in one requirements file per spec version.
- **Pass**: the conformance suite reports the scenario as passed. The conformance repository defines what that means, including how warnings are treated.
- **Spec release date**: the day a spec version is released. A release candidate is not a spec version.
- **Hard freeze**: the release milestone defined in [SEP-3398](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3398), one month before the spec release date. A scenario published by the hard freeze is due on the spec release date for Tier 1.

### Tiers

| Tier       | Scenarios passed                                                 | Spec versions         | Due                                                                                             |
| ---------- | ---------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------- |
| **Tier 1** | Every scenario in the required set                               | The three most recent | On the spec release date of the newest spec version, for scenarios published by the hard freeze |
| **Tier 2** | Every scenario in the required set, except the Tier 2 exclusions | The two most recent   | Three months after the spec release date of the newest spec version                             |
| **Tier 3** | No minimum                                                       | None                  | None                                                                                            |

1. An SDK is listed at the highest tier whose requirements its latest results pass.
2. An SDK moves up as soon as its results pass what a higher tier requires.
3. An SDK moves down only after it has failed what its tier requires continuously for four weeks. It then moves to the highest tier whose requirements it passes. If it passes again within the four weeks, its tier does not change.
4. A new spec version counts toward Tier 1 from its spec release date. It counts toward Tier 2 from three months after its spec release date. Before that, the tier is computed on the earlier spec versions.
5. An SDK is tested on each spec version separately, using that spec version of the protocol.
6. Results come from the SDK's stable release with the highest version number. Pre-releases do not count.
7. Tier 1 has no exclusions. A deprecated feature still counts. A feature removed in a later spec version still counts on the spec versions that have it.

### Required sets

1. Every scenario for a spec version is required, unless the requirements file marks it as not required and gives a reason.
2. Scenarios for extensions and experimental features are never required. They still run and are reported.
3. An SDK is tested as a client and as a server. Authorization server behaviour is never required.
4. An SDK cannot exempt itself. A scenario the SDK lists as an expected failure is still required.

### Tier 2 exclusions

1. The conformance repository defines which scenarios are excluded for Tier 2. This SEP does not list them. Examples of what may be excluded are deprecated features, completions and SSE polling.
2. Changing the exclusions requires SDK Working Group consensus and Core Maintainer approval. It does not require a SEP.

### Timing

1. A version of the conformance suite ships with the release candidate. The suite can still change after that.
2. The hard freeze is the release milestone defined in [SEP-3398](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3398). It is one month before the spec release date.
3. A scenario published by the hard freeze is due on the spec release date for Tier 1. It is due three months after the spec release date for Tier 2.
4. A scenario published or changed after the hard freeze is still required. For Tier 1 it gets its own due date. The Core Maintainers set that date. It is the same for every SDK and at least 14 days after the scenario is published or changed. Before that date the scenario runs and is reported but does not count. For Tier 2 the scenario is due three months after the spec release date.
5. After the spec release date, no scenario is added to that spec version's required set and none is made stricter. A scenario that is wrong can be relaxed or withdrawn at any time.

### Computing and publishing tiers

1. An automated process agreed in the SDK Working Group computes the tiers.
2. The results are public. Anyone can reproduce them.
3. An SDK Working Group maintainer confirms each change to an SDK's tier before it is published.

### Listing

1. This SEP covers official SDKs. Official SDKs are those in the `modelcontextprotocol` organization. How an SDK becomes official is out of scope.
2. To be listed on the [SDKs page](https://modelcontextprotocol.io/docs/sdk), an SDK needs a published security policy with a contact and at least one stable release.

### No longer part of a tier

1. Issue triage time, critical bug resolution time, required labels, documentation, roadmap, dependency policy and the per-release timeline for new protocol features no longer affect a tier. An SDK no longer loses a tier because issues stay unaddressed for two months.
2. SEP-2596 makes marking deprecated features in the SDK's API a condition of Tier 1 status. This SEP removes that condition. Official SDKs are still expected to mark deprecated features.

## Rationale

- **Three spec versions.** Older spec versions are covered so an SDK can work with peers that still use them. At the current release pace, three spec versions span more than the twelve-month deprecation window in SEP-2596.
- **The hard freeze instead of a date on every scenario.** We considered a separate notice period for each scenario, and a lock date of our own. SEP-3398 defines a hard freeze one month before the spec release date. Using it means this SEP adds no new date.
- **Late changes stay required.** A spec change after the hard freeze is part of the spec version. SDKs get more time for it, not an exemption.
- **Four weeks before a tier drops.** SEP-1730 already allows four weeks, and this SEP keeps them. A regression that is fixed quickly does not change a tier, and a tier does not flip back and forth. An SDK that is not ready on a spec release date has four weeks to catch up before its tier drops.
- **How tiers are computed is left to the SDK Working Group.** The automated process is not built yet. This SEP fixes what it must produce, not how it works.
- **A maintainer confirms each change to an SDK's tier.** A broken build or a fault in the automated process should not change an SDK's tier. The maintainer checks the automated process, not the SDK.

## Backward Compatibility

1. Until the next spec release date, SEP-1730 applies and published tiers stay as they are. Nobody re-applies.
2. From the next spec release date, this SEP computes every tier. Tier 1 then covers three spec versions: the new one, `2026-07-28` and `2025-11-25`. Tier 2 then covers `2026-07-28` and `2025-11-25`. Three months later, Tier 2 covers the new spec version and `2026-07-28`.
3. The required sets for `2026-07-28` and `2025-11-25` already exist. No scenario is added to them.
4. Tier 2 becomes stricter on conformance. A Tier 2 SDK that passes 80% today moves to Tier 3 four weeks after the next spec release date, unless it passes everything Tier 2 requires by then.
5. SEP-1730 allowed four weeks of failing tests before a tier dropped. This SEP keeps the four weeks.

## Security Implications

The automated process builds and executes SDK code. It runs without access to secrets.

## Reference Implementation

The conformance repository already holds a requirements file for each spec version, `requirements/<version>.yaml`. It can run exactly that required set with `--requirements <version>`. Still to build: the Tier 2 exclusions, due dates for scenarios published after the hard freeze, and the automated process.

## Open Questions

1. Are 14 days for a scenario published or changed after the hard freeze, and three months for Tier 2, the right lengths?
2. Should Tier 1 cover three spec versions, or every spec version released in the last N months? Both give the same result today.
3. This SEP tests every SDK as a client and as a server. Should an SDK that implements only one role be able to hold Tier 1 or Tier 2?
4. This SEP requires a stable release to be listed. Should an SDK without one be listed as Tier 3, as SEP-1730 allowed?
