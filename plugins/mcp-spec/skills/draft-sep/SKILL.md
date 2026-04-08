---
name: draft-sep
description: Research and draft a Specification Enhancement Proposal following the MCP SEP governance process
user_invocable: true
arguments:
  - name: idea
    description: One-line summary of the proposed change
    required: true
---

# Drafting a Specification Enhancement Proposal

This skill guides an author through producing a SEP that conforms to `docs/community/sep-guidelines.mdx` and `seps/TEMPLATE.md`. Work through the phases **in order** — do not start writing the draft until the interview and research are complete.

**Discuss before drafting.** The SEP guidelines advise raising an idea in Discord or a Working Group meeting before opening a SEP. If the user has not discussed this idea anywhere yet, say so explicitly and ask whether they want to proceed anyway. A cold SEP is valid but more likely to stall — and if no sponsor is found within 6 months, Core Maintainers may close the PR and mark the SEP `dormant`.

The SEP author is responsible for building consensus within the community and documenting dissenting opinions — capture both as you go.

## Phase 1 — Interview

Ask the user these six questions before touching any files. The answers feed directly into the draft.

1. **SEP type?** Standards Track (core protocol feature), Extensions Track (extension rather than core — see SEP-2133), Informational (guidelines/design notes), or Process (governance/workflow change). Most SEPs are Standards Track. Note: `seps/TEMPLATE.md` and the SEP guidelines list only three types; Extensions Track was added by SEP-2133 and has not yet been backfilled into those docs.
   - **If Extensions Track:** also ask which Working Group and Extension Maintainers will be responsible for the extension — SEP-2133 makes this a hard requirement, and an Extensions Track SEP MUST have at least one reference implementation in an official SDK prior to review.
2. **Is this a breaking change?** Determines how much weight the Backward Compatibility section carries.
3. **Prototype status?** There are two distinct gates: a working prototype is required before a SEP can be **accepted**, and a complete reference implementation is required before it can reach **Final**. The prototype proves feasibility — it doesn't need to be production-ready, but it must be runnable, not pseudocode. Does one exist, is one in progress, or is it still TBD?
4. **Where was this discussed?** Discord thread, Working Group meeting, GitHub Discussion — the link becomes the consensus evidence in the Rationale section. If the answer is "nowhere," flag it (see above).
5. **Author and sponsor?** Capture the author's name, email, and GitHub username for the `Author(s)` preamble field. Then ask about a sponsor: a SEP needs a Core Maintainer or Maintainer sponsor to **enter** `draft` status — the sponsor is what grants it. Until a sponsor signs on, the SEP sits in an "awaiting sponsor" state (Core Maintainers may close it as `dormant` after 6 months). If the user has a sponsor lined up, capture their GitHub username (without the `@` — `gh pr create --reviewer` expects a bare handle). If not, the preamble should read `Sponsor: None` and the finding-a-sponsor guidance from `docs/community/sep-guidelines.mdx` applies: tag 1-2 relevant maintainers from `MAINTAINERS.md` on the PR, share in the relevant Discord channel, and if there's no response in two weeks ask in `#general`.
6. **Security implications?** Does this proposal touch the attack surface — new transports, auth flows, data exposure, trust boundaries? The Security Implications section is required in `seps/TEMPLATE.md`; even "none identified" needs to be stated explicitly with reasoning.

## Phase 2 — Research

Run each step and **capture the findings** — they feed directly into the draft sections.

### 1. Current spec coverage

Use the `SearchModelContextProtocol` tool on the `mcp-docs` MCP server to find what the spec already says about this area. This becomes the "why is the current spec inadequate" half of the Motivation section.

### 2. Prior art on GitHub

Invoke `/search-mcp-github {idea}`. Look for:

- Merged PRs that touched the same surface
- Closed issues that asked for this (or something close)
- Prior discussions where maintainers set direction or rejected a similar approach

If a similar proposal was already rejected, that context is load-bearing — the new SEP needs to explain what changed.

### 3. Overlapping SEPs

```bash
grep -l -i "{keyword}" seps/*.md
```

Pick one or two keywords from the idea. If an existing SEP covers this area, the right move is usually to extend or supersede it rather than file a parallel proposal. Read any matches before continuing.

### 4. Design-principle and roadmap fit

Read `docs/community/design-principles.mdx` and `docs/development/roadmap.mdx`. Identify which principles the proposal serves and which it is in tension with. Check whether the proposal aligns with current Core Maintainer priorities reflected in the roadmap — proposals outside current priorities are more likely to face delays in review. Both findings go in the Rationale section.

### 5. Schema touch-points

```bash
grep -n "{affected-type}" schema/draft/schema.ts
```

For Standards Track and Extensions Track SEPs, find the concrete types the spec change would add or modify. Reference these by name in the Specification section.

### 6. Exemplar SEPs

```bash
grep -l "Status.*Final" seps/*.md | head -3
```

Read two or three Final-status SEPs to see what a well-filled section looks like in practice. Match their level of detail.

## Phase 3 — Gate

With the interview and research in hand, decide whether this is actually SEP-worthy.

**Redirect** (do not proceed) if the idea is:

- A bug fix or typo correction
- A documentation clarification
- Adding examples to an existing feature
- A minor schema fix that does not change behavior

For these, point the user at a regular pull request or the bug-report issue form instead.

**Proceed** if the idea is:

- A new protocol feature or a change to an existing one
- A breaking change
- A governance or process change
- Anything controversial enough to need a design document and historical record

When unsure, the guidelines say to ask in Discord before starting significant work — point the user there rather than burning time on a draft that may not be SEP-worthy.

## Phase 4 — Draft

Read `seps/TEMPLATE.md` and fill each section in order. Write to `seps/0000-{slug}.md` where `{slug}` is a lowercase, hyphenated version of the idea trimmed to ~50 characters (match the pattern of existing `seps/*.md` filenames). The `0000` placeholder is the documented convention from the SEP guidelines.

**Required sections:** Abstract, Motivation, Specification, Rationale, Backward Compatibility, Security Implications, Reference Implementation. **Optional sections:** Alternatives Considered, Open Questions, Performance Implications, Testing Plan, Acknowledgments.

**Preamble notes:**

- `Status:` — leave blank or omit. Authors should request status changes through their sponsor rather than setting the field themselves.
- `Created:` — today's date in `YYYY-MM-DD` format.
- `Author(s):` — `Name <email> (@github-username)` from Q5.
- `Sponsor:` — `@github-username` from Q5, or the literal `None`.
- `PR:` — `seps/TEMPLATE.md` has a stale URL pointing at the wrong repo. Replace the entire URL with `https://github.com/modelcontextprotocol/modelcontextprotocol/pull/{NUMBER}` (the `{NUMBER}` placeholder gets filled in Phase 6).

## Phase 5 — Checkpoint

Tell the user:

- The path to the draft file
- A one-line summary of what went into each section

Then **ask**: open a draft PR now, or stop here so they can edit the file first?

**Do not proceed to Phase 6 without a yes.**

## Phase 6 — Open PR (only if the user says yes)

SEP-1850 documents an amend-based flow: open the PR with the `0000-` placeholder, then immediately rename, generate docs, and amend — so CI only ever sees the final state.

```bash
git checkout -b sep/{slug}
git add seps/0000-{slug}.md
git commit -m "SEP: {title}"
git push -u origin sep/{slug}
gh pr create --title "SEP: {title}" --body "{one-paragraph summary}" --draft --reviewer {sponsor-username}
```

Omit `--reviewer` if Q5 answered `None`. Capture the PR number `{N}` from `gh pr create` output, then backfill:

```bash
git mv seps/0000-{slug}.md seps/{N}-{slug}.md
# edit the file: replace SEP-{NUMBER} with SEP-{N} in the title line,
# fill the PR link in the preamble
npm run generate:seps
git add seps/{N}-{slug}.md docs/seps/ docs/docs.json
git commit --amend --no-edit
git push --force-with-lease
```

The `npm run generate:seps` step renders `docs/seps/{N}-{slug}.mdx` and updates `docs/docs.json` — required for the `render-seps.yml` CI check. The amend collapses everything into one commit so CI never runs against the intermediate `0000-` state, which `check:seps` would otherwise reject. The PR is opened as `--draft` so it is clearly not yet ready for sponsor review.
