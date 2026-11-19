# SEP-{NUMBER}: Dormancy for Inactive SEPs

- **Status**: Draft
- **Type**: Process
- **Created**: 2026-11-18
- **Author(s)**: Den Delimarsky (@localden)
- **Sponsor**: Den Delimarsky (@localden)
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/{NUMBER}

## Abstract

A SEP is marked `dormant` only when it has no sponsor after 180 days, and no rule closes a sponsored SEP whose work has stopped. This SEP adds a second trigger: a `draft` SEP with no activity from its author or sponsor for 180 days is marked `dormant` and its pull request is closed. The sponsorship rule and the way a dormant SEP is revived do not change.

## Motivation

[SEP-1850](https://modelcontextprotocol.io/seps/1850-pr-based-sep-workflow) defined `dormant` for SEPs that do not find a sponsor within six months. That rule does not reach sponsored SEPs. As of 2026-11-18, two of the five open SEPs in `draft` status have had no commits or comments from their authors for more than 180 days.

The SEP lifecycle automation in `tools/sep-automation` reminds the authors of quiet drafts after 90 days, but no rule lets it go further.

Stalled SEPs that stay open make the list of open SEPs a poor guide to what is in progress, and their sponsors remain responsible for proposals that nobody is working on.

## Specification

These rules extend the dormancy rules in the [SEP guidelines](https://modelcontextprotocol.io/community/sep-guidelines#workflow).

1. Activity on a SEP is a commit, comment, or review on its pull request by the SEP's author or sponsor. Comments from automation do not count.
2. When a `draft` SEP has had no activity for 90 days, the SEP lifecycle automation reminds the author and sponsor on the pull request.
3. When a `draft` SEP has had no activity for 180 days, Core Maintainers mark it `dormant` and close its pull request with a comment that explains how to revive it. The SEP lifecycle automation can do this on their behalf.
4. A draft pull request that has no sponsor after 180 days is marked `dormant` and closed, as it is today.
5. Inactivity does not make an `in-review` or `accepted` SEP dormant.
6. A dormant SEP returns to `draft` when a sponsor agrees to sponsor it and the pull request is reopened.

## Rationale

Inactivity is a better signal than age or sponsorship. A proposal that is moving slowly should stay open, and a proposal that has stopped should not stay open only because it has a sponsor.

Only the author and sponsor count toward activity because they are responsible for moving the SEP forward. The SEP lifecycle automation already measures activity this way and ignores its own reminders. The 180-day threshold matches the sponsorship rule, and the 90-day reminder matches what the automation does today.

An `in-review` SEP is waiting for the Core Maintainers, so inactivity says nothing about its author. An `accepted` SEP has passed a vote, and reviving it would return it to `draft` and require another review. The automation already reminds authors of accepted SEPs after 30 days. Whether accepted SEPs should lapse is left to a separate proposal.

Replacing the sponsorship rule with inactivity alone was considered. That would let an unsponsored draft stay open as long as its author keeps updating it, so this SEP keeps both rules.

Cliff Hall raised the gap in [a review of #3550](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3550#discussion_r4616807713). David Soria Parra suggested closing SEP pull requests after about 180 days without progress in [a review of #3529](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3529#discussion_r4528166156).

## Backward Compatibility

When this SEP takes effect, the authors and sponsors of `draft` SEPs that have already gone more than 180 days without activity are reminded first. Each of those SEPs is marked `dormant` 30 days later if there is still no activity. No other SEP changes status.

## Security Implications

None. This SEP changes how SEP pull requests are closed and does not affect the protocol.

## Reference Implementation

On acceptance, the following changes implement this SEP:

- `docs/community/sep-guidelines.mdx`: add the inactivity trigger to the workflow diagram, the `dormant` row of the status table, and the paragraph on dormant SEPs.
- `tools/sep-automation`: mark `draft` SEPs `dormant` and close their pull requests after 180 days without activity.
- `scripts/render-seps.ts`: update the `Dormant` description in the SEP index legend.
- `plugins/mcp-spec/skills/draft-sep/SKILL.md`: update the note on dormant SEPs.
