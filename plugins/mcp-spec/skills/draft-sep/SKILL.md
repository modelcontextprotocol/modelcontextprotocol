---
name: draft-sep
description: Research and draft a Spec Enhancement Proposal following the MCP SEP governance process
user_invocable: true
arguments:
  - name: idea
    description: One-line summary of the proposed change
    required: true
---

# Drafting a Spec Enhancement Proposal

This skill guides an author through producing a SEP that conforms to `docs/community/sep-guidelines.mdx` and `seps/TEMPLATE.md`. Work through the phases **in order** — do not start writing the draft until the interview and research are complete.

**Discuss before drafting.** The SEP guidelines strongly recommend raising an idea in Discord or a Working Group meeting before opening a SEP. If the user has not discussed this idea anywhere yet, say so explicitly and ask whether they want to proceed anyway. A cold SEP is valid but more likely to stall.

## Phase 1 — Interview

Ask the user these four questions before touching any files. The answers feed directly into the draft.

1. **SEP type?** Standards Track (core protocol feature), Extensions Track (extension rather than core — see SEP-2133), Informational (guidelines/design notes), or Process (governance/workflow change). Most SEPs are Standards Track. Note: `seps/TEMPLATE.md` and the SEP guidelines list only three types; Extensions Track was added by SEP-2133 and has not yet been backfilled into those docs.
2. **Is this a breaking change?** Determines how much weight the Backward Compatibility section carries.
3. **Prototype status?** A reference implementation is required before a SEP can reach `Final` status. Does one exist, is one in progress, or is it still TBD?
4. **Where was this discussed?** Discord thread, Working Group meeting, GitHub Discussion — the link becomes the consensus evidence in the Rationale section. If the answer is "nowhere," flag it (see above).

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

### 4. Design-principle fit

Read `docs/community/design-principles.mdx`. Identify which principles the proposal serves and which it is in tension with. Both go in the Rationale section.

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

- A bug fix — the spec is wrong, not incomplete
- A documentation clarification
- Adding examples to an existing feature
- A minor schema fix that does not change behavior

For these, point the user at a regular pull request or the bug-report issue form instead.

**Proceed** if the idea is:

- A new protocol feature or a change to an existing one
- A breaking change
- A governance or process change
- Anything controversial enough to need a design document and historical record

When unsure, err toward proceeding. A thin SEP redirected during review is cheaper than a missing one.

## Phase 4 — Draft

Read `seps/TEMPLATE.md` and fill each section in order. Write to `seps/SEP-DRAFT-{slug}.md` where `{slug}` is a lowercase, hyphenated version of the idea trimmed to ~50 characters (match the pattern of existing `seps/*.md` filenames).

### Preamble

```markdown
# SEP-{NUMBER}: {Title}

- **Status**: Draft
- **Type**: {from Phase 1 Q1}
- **Created**: {today, YYYY-MM-DD}
- **Author(s)**: {from `git config user.name` / `git config user.email`}
- **Sponsor**: None
- **PR**: {leave blank — filled after the PR is opened}
```

Leave `{NUMBER}` as a literal placeholder — it is backfilled in Phase 6.

### Abstract

~200 words. What the proposal does, not why. Readers should be able to stop here and know what is being proposed.

### Motivation

The make-or-break section. Per the SEP guidelines: **"SEPs without sufficient motivation may be rejected outright."**

Feed in the Phase 2 step 1 findings: what the spec says today and why that is insufficient. Be concrete about the gap.

### Specification

For **Standards Track** / **Extensions Track**: new message formats, methods, behavioral requirements, error handling. Reference the `schema/draft/schema.ts` types found in Phase 2 step 5 by name.

For **Process**: step-by-step procedures, roles, timelines.

### Rationale

- Alternatives considered — draw from Phase 2 research
- Why the chosen approach won
- Design-principle fit from Phase 2 step 4
- Link to the discussion thread from Phase 1 Q4 — this is where "evidence of consensus within the community" lives

### Backward Compatibility

If Phase 1 Q2 answered "breaking": severity, scope, migration path. This section is load-bearing.

If not breaking: state that explicitly. One sentence is fine.

### Security Implications

Attack surface, privacy, authentication/authorization changes, data validation requirements.

If none: state that explicitly.

### Reference Implementation

If Phase 1 Q3 produced a prototype link, put it here with a one-line summary of what it demonstrates.

If not: `TBD — required before Final status.`

## Phase 5 — Checkpoint

Tell the user:

- The path to the draft file
- A one-line summary of what went into each section

Then **ask**: open a draft PR now, or stop here so they can edit the file first?

**Do not proceed to Phase 6 without a yes.**

## Phase 6 — Open PR (only if the user says yes)

```bash
git checkout -b sep/{slug}
git add seps/SEP-DRAFT-{slug}.md
git commit -m "SEP: {title}"
git push -u origin sep/{slug}
gh pr create --title "SEP: {title}" --body "{one-paragraph summary}" --draft
```

Capture the PR number from `gh pr create` output. Then backfill it:

```bash
git mv seps/SEP-DRAFT-{slug}.md seps/{N}-{slug}.md
# edit the file: replace SEP-{NUMBER} with SEP-{N} in the title line,
# fill the PR link in the preamble
git commit -am "SEP-{N}: fill in PR number"
git push
```

Two commits, not amend+force. The PR is opened as `--draft` so it is clearly not yet ready for sponsor review.
