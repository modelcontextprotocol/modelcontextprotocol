# SEP-3546: Remove the Dormant Status

- **Status**: Draft
- **Type**: Process
- **Created**: 2026-11-11
- **Author(s)**: David Soria Parra (@dsp-ant)
- **Sponsor**: David Soria Parra (@dsp-ant), on behalf of the Core Maintainers
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3546

## Abstract

This SEP removes the `dormant` status and the rule that makes a SEP dormant when it has no sponsor after 180 days. Under [SEP-3398](https://modelcontextprotocol.io/seps/3398-release-cycle-updates), a Working Group or the Core Maintainer group sponsors each SEP. This SEP lets a proposal that no group sponsors yet live in a draft pull request with no status. It also adds a rule: a SEP pull request with no progress for about 180 days is closed, unless the SEP is `accepted` or `in-review`. The change supersedes part of [SEP-1850](https://modelcontextprotocol.io/seps/1850-pr-based-sep-workflow).

## Motivation

- **The rule measures the wrong thing.** It counts time without a sponsor. A proposal in active development can become dormant, while a sponsored proposal that nobody works on cannot.
- **It does not fit SEP-3398.** Proposals develop all year, and group sponsorship is required only before formal review. Until then, having no sponsor is normal.
- **The texts disagree.** SEP-1850 says that Core Maintainers may close the pull request after six months. The SEP guidelines say that the SEP is marked dormant and closed after 180 days.
- **The status is not in use.** No SEP file on `main` has it. The SEP automation still contains code for it, but no rule triggers that code.

## Specification

### Status Values

`Dormant` is removed as a SEP status, and `dormant` as the matching label. The remaining values are `Draft`, `In-Review`, `Accepted`, `Rejected`, `Withdrawn`, `Final` and `Superseded`. Their meanings and who sets them do not change.

### Proposals Without a Sponsor

A proposal that no group sponsors yet MAY be developed in a draft pull request. It has no `Status` and no deadline for finding a sponsor. When a group agrees to sponsor it, the pull request is marked ready for review and follows SEP-3398 and the SEP guidelines.

### Relation to Other SEPs

In SEP-1850, this SEP supersedes `Dormant` in the terminal states and the "Dormant status" paragraph (both in section 4), and `Dormant` in the `Status` line (section 6). The rest of SEP-1850, as updated by SEP-3398, stays in force. SEP-1850 is a historical record: its text is not edited, and it stays `Final`.

SEP-3398 keeps sponsor-managed statuses, and this SEP does not change them.

This SEP does not amend the governance document, which refers to the SEP guidelines for the status workflow. The amendment procedure in [SEP-2085](https://modelcontextprotocol.io/seps/2085-governance-succession-and-amendment) therefore does not apply.

Working Group Leads keep their authority to close SEPs in their scope, with written rationale and an appeal to Core Maintainers.

### Transition

- As of 2026-11-11, no SEP file on `main` has the status, and no open issue or pull request has the label. No SEP changes status.
- Closed items keep the `dormant` label as a record. It is not applied to new items.
- A closed dormant proposal can come back as a draft pull request, or as a SEP when a group sponsors it.

### Closing Inactive SEP Pull Requests

An open SEP pull request in the main repository with no progress for about 180 days is closed, with or without a sponsor. Automation may do this. Closing is not a rejection and does not change the `Status`.

- **Progress** is a commit, a submitted review, or a comment from a person. Bot activity, label changes and mentions do not count.
- **Notice** is one comment after about 150 days. The pull request is not closed until the notice is 30 days old. Progress restarts the period and requires a new notice.
- **Reopening** needs no approval. At the author's request, a person with permission reopens the pull request. It keeps its number and `Status`, and the period restarts.
- **Exemptions** are `accepted` and `in-review`. SEP-3398 preserves acceptance, and a proposal in review may be waiting only for agenda time. The sponsor can return a stalled `in-review` SEP to `draft`, and the rule then applies.

## Rationale

**Keep `dormant` with one consistent deadline.** This fixes the wording but still measures sponsorship, and keeps a status for work that has not entered the SEP process.

**Use `withdrawn` or `rejected` instead.** These record a decision by the author or the Core Maintainers. A missing sponsor is neither.

**Edit SEP-1850.** Final SEPs are historical records.

**Have no closing rule.** Pull requests that nobody works on would stay open and hide active ones. Progress, not sponsorship, is the measure, and the notice gives the author 30 days to continue.

## Backward Compatibility

There is no protocol or schema change. Links to closed dormant proposals still work.

## Security Implications

None identified. Only proposal tracking changes, not protocol behavior, authentication or data handling.

## Reference Implementation

A later pull request changes these files:

- `docs/community/sep-guidelines.mdx`: workflow diagram, status table and count, dormant paragraph.
- `CONTRIBUTING.md`: the sentence that forbids a SEP pull request before Working Group approval, if it is still there.
- `seps/TEMPLATE.md`: `Status` line.
- `scripts/render-seps.ts`: badge color, status definition, status order.
- `docs/seps/index.mdx`: regenerated with `npm run generate:seps`.
- `plugins/mcp-spec/skills/draft-sep/SKILL.md`: three statements about 6 months.
- `tools/sep-automation/src/`: `actions/comment.ts`, `actions/ping.ts`, `hooks/discord.ts`, `hooks/types.ts`, `index.ts`, `processor.ts`, `rules.ts`, `sep/analyzer.ts`, `types.ts`.
- For the inactivity rule, which [#3539](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3539) implements without the exemptions for `accepted` and `in-review`: `.github/workflows/sep-lifecycle.yml` and, in `tools/sep-automation/src/`, `config.ts`, `github/client.ts`, `github/types.ts` and `sep/detector.ts`, with tests.
- `tools/sep-automation/test/unit/`: `comment.test.ts`, `ping.test.ts`, `sep-types.test.ts`, `transition.test.ts`.

SEP-1850 does not change. A Process SEP needs no conformance test.
