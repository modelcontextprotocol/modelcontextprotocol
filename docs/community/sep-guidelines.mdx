---
title: SEP Guidelines
description: When a Specification Enhancement Proposal is required and the procedure a proposal follows from pull request to Final.
---

This page describes when a Specification Enhancement Proposal (SEP) is required and the procedure from pull request to Final. A SEP is a design document that gives a concise technical specification of a feature or process and its rationale. Its author is responsible for building consensus and recording dissenting opinions. [SEP-1850](/seps/1850) adopted the process and [SEP-2484](/seps/2484) the conformance gate. Changing either requires a Process SEP. The sponsorship rules on this page follow [SEP-3398](/seps/3398).

## When you need a SEP

Write a SEP for:

- A new, changed or removed protocol feature or method (a new RPC method such as `tools/execute`, a new capability negotiation field, a change to a transport)
- Any change that is not backward compatible
- A change to message formats or schema structure
- An interoperability convention supported outside the core specification
- A governance or process change
- Anything controversial or with several plausible designs, such as a change to how authorization works

Bug fixes, clarifications, editorial changes, new examples for existing features, schema fixes that do not change behavior, and tests go in an ordinary pull request. Amendments to the governance document itself follow the procedure in [SEP-2085](/seps/2085), not this process. If unsure, ask in [Discord](/community/communication#discord) first.

## SEP types

- Standards Track: a new protocol feature or implementation, or an interoperability standard supported outside the core specification.
- Informational: a design issue or guidance for the community, with no new feature.
- Process: a process surrounding MCP, or a change to one.
- Extensions Track: a protocol extension. It receives the same review and acceptance as Standards Track. An accepted Extensions Track SEP moves the extension to Beta, and a second one moves it to Stable (see [Extension Lifecycle](/extensions/overview#extension-lifecycle) for the stages).

## Before you write

A SEP needs a working group to sponsor it before formal review (see [Sponsors](#sponsors)).

To get a working group's sponsorship:

1. Check whether the idea fits the current focus on the [roadmap](/development/roadmap). SEPs outside its priority areas face a longer queue and a higher bar (see [SEP Prioritization](/development/roadmap#sep-prioritization)).
2. Bring the idea to the working group that covers the area, in its Discord channel or at a meeting (see [Joining a group](/community/working-interest-groups#joining-a-group)). An interest group can help frame the problem first, and a working group sponsors the SEP.
3. Reach [consensus](/community/working-interest-groups#making-decisions) in the working group, then draft a SEP that the group wants to [sponsor](#sponsors). Read the [design principles](/community/design-principles), try the idea as an [extension](/extensions/overview) first where its shape allows, and build a prototype that meets the [Prototype Requirements](#prototype-requirements).
4. The working group brings the SEP to the Core Maintainers for review through the [Workflow](#workflow).

If an interest group covers the area and no working group does, the interest group can start a working group for the idea through the [forming a group](/community/working-interest-groups#forming-a-group) process, and that working group sponsors the SEP. This is the normal path for areas an interest group owns. If no working or interest group covers the area, propose a new working group through the [forming a group](/community/working-interest-groups#forming-a-group) process. A thread in `#general` on Discord can help find people to join a new working group.

## Workflow

```mermaid
flowchart TD
    Idea["Idea"]
    DraftPR["Draft pull request<br/>(not yet in the SEP process)"]
    Draft["draft status<br/>(pull request ready for review)"]
    Dormant["dormant"]
    Withdrawn["withdrawn"]
    InReview["in-review"]
    Decision{"Core Maintainers decide"}
    Accepted["accepted"]
    Rejected["rejected"]
    Final["final"]
    Superseded["superseded"]

    Idea -->|"Developed in the open,<br/>no sponsor yet"| DraftPR
    Idea -->|"Working group<br/>agrees to sponsor"| Draft
    DraftPR -->|"Working group<br/>agrees to sponsor"| Draft
    DraftPR -->|"180 days without a sponsor"| Dormant
    Dormant -->|"Sponsor found, PR reopened"| Draft
    Draft --> Withdrawn
    Draft -->|"Sponsor sets in-review"| InReview
    InReview --> Decision
    Decision --> Accepted
    Decision --> Rejected
    Decision -->|"Returned with feedback"| Draft
    Accepted -->|"Specification text, reference implementation<br/>and conformance test complete"| Final
    Final -->|"Replaced by a newer SEP"| Superseded
```

1. Copy [`seps/TEMPLATE.md`](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/TEMPLATE.md) to `seps/0000-<slug>.md` and fill it in.
2. Open a pull request against the [specification repository](https://github.com/modelcontextprotocol/modelcontextprotocol), titled `sep: <description>` as in `sep: propose task cancellation`, following the [pull request title guidelines](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/CONTRIBUTING.md#pull-request-titles). Authors who are not members of the `modelcontextprotocol` GitHub organization ask the working group's leads or the [sponsor](#sponsors) to open the pull request and name them as the author.
3. The SEP number is the PR number. Rename the file (PR #1850 becomes `seps/1850-<slug>.md`), update the header, and run `npm run generate:seps`, or the `check:seps` CI job fails. Rename the pull request to `sep(SEP-1850): <description>`; a follow-up commit is enough, with no amend or force-push. Later pull requests about this SEP keep `SEP-1850` as their scope and link to it in the description.
4. Until a working group has agreed to sponsor the SEP, it stays a draft pull request. A draft pull request is for developing a proposal in the open. It is not yet in the SEP process, the `Status` header in the SEP stays unset, and the `wg-support-needed` label marks it.
5. Once a working group has agreed to [sponsor](#sponsors) the SEP, the pull request is marked ready for review. The `Sponsor` header names the person who acts on the sponsoring group's behalf, and that person sets `draft`. Review takes place in PR comments.
6. When the SEP is ready, the sponsor confirms that the prior discussion happened and is linked in the pull request description, sets `in-review`, and puts it on the Core Maintainer meeting agenda. The author and sponsor may present it.
7. Core Maintainers decide under [Review and acceptance](#review-and-acceptance). The sponsor records the outcome, `accepted` or `rejected`, on the PR and in the SEP header.
8. For an accepted SEP, the author adds to the same PR: the specification prose, the `schema.ts` changes with regenerated output (see [CONTRIBUTING.md](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/CONTRIBUTING.md#schema-changes)), a changelog entry, and any required documentation edits (for a deprecation, the four edits under [Deprecating a Feature](/community/feature-lifecycle#deprecating-a-feature)). The reference implementation is completed where it lives: an SDK branch, a fork or a standalone repository (see [Prototype Requirements](#prototype-requirements)). For a Standards Track SEP with observable protocol behavior, the conformance scenario and `sep-NNNN.yaml` are merged (see [Conformance Test Requirement](#conformance-test-requirement)). SDK implementations are not required for Final.
9. The sponsor verifies these artifacts and sets `final`. The PR is then merged.

The eight `Status` values, also defined on the [SEP index](/seps):

| Status       | Meaning                                                                            | Set by                                      |
| ------------ | ---------------------------------------------------------------------------------- | ------------------------------------------- |
| `draft`      | Has a sponsor, pull request ready for review, under informal review in PR comments | Sponsor                                     |
| `in-review`  | On the Core Maintainer agenda for formal review                                    | Sponsor                                     |
| `accepted`   | Approved, awaiting specification text, reference implementation and conformance    | Sponsor, after the Core Maintainer decision |
| `rejected`   | Declined by Core Maintainers                                                       | Sponsor, after the Core Maintainer decision |
| `withdrawn`  | Withdrawn by the author                                                            | Author or sponsor                           |
| `final`      | All artifacts complete and the PR merged                                           | Sponsor                                     |
| `superseded` | Replaced by a newer SEP                                                            | Sponsor                                     |
| `dormant`    | No sponsor after 180 days, PR closed, may be revived                               | Core Maintainers                            |

A SEP that has no sponsor after 180 days is marked `dormant` and its PR is closed. Dormant is not rejected: a dormant SEP is revived by finding a sponsor and reopening the PR, which returns it to `draft`.

## Sponsors

A working group sponsors a SEP. The Core Maintainers can also sponsor one. Both paths lead to the same review and the same acceptance requirements.

- Working group sponsorship: the working group whose scope the SEP falls in approves it through its [decision-making process](/community/working-interest-groups#making-decisions). [Before you write](#before-you-write) covers how a working group comes to sponsor a SEP.
- Core Maintainer sponsorship: the Core Maintainers agree to sponsor the SEP and designate a Core Maintainer to represent them. No separate working group approval is required, and the designated Core Maintainer consults the relevant working groups. Note that this path is the exception. In general Core Maintainers will not sponsor SEPs. The usual case is a proposal that comes from the Core Maintainers directly.

The `Sponsor` header names the Maintainer or Core Maintainer who acts on the sponsoring group's behalf, as in `Name (@handle), on behalf of the Transports Working Group` or `Name (@handle), on behalf of the Core Maintainers`. A qualified WG Lead may fill this role for a working group. For the Core Maintainers, the designated Core Maintainer does. The rest of this page calls this person the sponsor.

The sponsor is responsible for the SEP's status and labels and for tracking its implementation. The sponsor reviews the proposal and requests changes, presents it with the author, brings it to the Core Maintainers for review, verifies the Final artifacts, and makes every status change in the [Workflow](#workflow). That covers the `Status` field in the SEP file, which is canonical, and the matching PR label, which is for filtering. A sponsor without write access to the branch sets the field through the author. Authors do not edit `Status` or labels themselves. They ask their sponsor.

The sponsoring group, the sponsor and the author are responsible for moving the SEP forward. When the author cannot open pull requests on the repository, one of the working group's leads or the sponsor opens the pull request and names the author. The SEP is numbered from that pull request as usual.

A WG Lead may also triage and close in-scope SEPs under [Leadership](/community/working-interest-groups#leadership), subject to appeal to Core Maintainers.

## Prototype Requirements

A SEP needs a working prototype before it can be accepted: an implementation in an official SDK as a branch or fork, a standalone proof of concept of the key mechanics, integration tests that exercise the proposed behavior, or a reference server or client. The prototype should show that the core functionality works as described and that the API design is practical and ergonomic, surface edge cases and implementation problems, and be runnable by reviewers from included setup instructions. Pseudocode alone, or a design document without code, is not sufficient. Production quality is not required.

## Review and acceptance

Core Maintainers review `in-review` SEPs at their meeting every two weeks under the [decision process](/community/governance#decision-process). The criteria are a working prototype, clear benefit to the MCP ecosystem, community support and consensus, and fit with the roadmap and the design principles. The outcome is `accepted`, `rejected`, or a return to `draft` with specific feedback recorded on the PR.

## Conformance Test Requirement

A Standards Track SEP that introduces or modifies observable protocol behavior cannot reach `final` until the [conformance repository](https://github.com/modelcontextprotocol/conformance) has:

- A scenario tagged with the SEP number, targeting the repository's draft spec-version tag.
- A traceability file, `sep-NNNN.yaml`, mapping every MUST, MUST NOT, SHOULD and SHOULD NOT in the SEP's Specification section to a check ID or to a documented exclusion, with a tracking issue where the exclusion is a framework gap.
- The scenario passing against the SEP's reference implementation.

Process SEPs, Informational SEPs, and Standards Track SEPs with no observable protocol behavior (documentation clarifications, schema annotations that do not change validation, implementation-hardening recommendations) are exempt.

Anyone may write the scenario: the SEP author, an SDK maintainer, or any other contributor. The sponsor confirms that it exists and that `sep-NNNN.yaml` covers every normative statement, and the conformance repository's maintainers review the scenario PR for technical correctness. Writing the scenario before Core Maintainer review is encouraged, not required. [SEP-2484](/seps/2484) defines the traceability format and the dispute process.

## After the decision

A rejected SEP may be revised against the recorded feedback and resubmitted, or answered with a competing SEP.

Before Final, raise problems on the SEP's PR. A Final SEP is a frozen record of the design as accepted. Where the specification has since diverged, the specification governs: report problems as issues against it, not as edits to the SEP.

A SEP is withdrawn at the author's request. The author or the sponsor sets `withdrawn`. A SEP that replaces an earlier one carries a `Supersedes:` line in its header, and the earlier SEP is set `superseded`.

Ownership of a SEP may pass to a new author when the original author no longer has time for it or cannot be reached. The original author stays on as co-author if they wish. Disagreement with the author's direction is not grounds for transfer. Write a competing SEP instead.

## Template and tooling

SEP files live in [`seps/`](https://github.com/modelcontextprotocol/modelcontextprotocol/tree/main/seps), and each file's git history is the record of the proposal. [`seps/TEMPLATE.md`](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/TEMPLATE.md) gives the structure: a preamble, then Abstract, Motivation, Specification, Rationale, Backward Compatibility, Security Implications and Reference Implementation. The Abstract is about 200 words. Insufficient Motivation is by itself grounds for rejection. The Specification must be detailed enough for independent, interoperable implementations. In the Rationale, record the alternatives considered, the objections raised and the evidence of consensus. Backward Compatibility is mandatory whenever the SEP introduces an incompatibility, and states its severity and the migration path. Security Implications are stated explicitly, including when there are none.

`npm run generate:seps` renders the files into `docs/seps/`, and `npm run check:seps` verifies that the rendered pages are current. For a worked example, see [SEP-2567](/seps/2567), a recent Final Standards Track SEP.
