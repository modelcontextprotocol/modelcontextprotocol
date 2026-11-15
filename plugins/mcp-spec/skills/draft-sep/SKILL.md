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

This skill guides an author through producing a SEP that conforms to `docs/community/sep-guidelines.mdx` and `seps/TEMPLATE.md`. Work through the phases **in order** — do not start writing the draft until the gate, interview, and research are complete.

**Prerequisite:** This skill must be run from a local clone of `modelcontextprotocol/modelcontextprotocol` or a fork of it. Before doing anything else:

1. Verify `seps/TEMPLATE.md` exists in the working directory. If it does not, stop and tell the user to run `gh repo fork modelcontextprotocol/modelcontextprotocol --clone` (or, if they are a maintainer with push access, clone the upstream repo directly) and re-run from its root.
2. Determine the **canonical remote** — the remote that points at `modelcontextprotocol/modelcontextprotocol` itself, not a fork. Inspect `git remote -v`: if `origin` points at the canonical repo, the canonical remote is `origin`. If `origin` points at a fork, look for an `upstream` remote; if none exists, add it with `git remote add upstream https://github.com/modelcontextprotocol/modelcontextprotocol.git`. The canonical remote is then `upstream`.
3. Run `git fetch {canonical}` and ensure local `main` is current with `{canonical}/main` so the research phases see up-to-date SEPs, schema, and `MAINTAINERS.md`.

Phase 6 references `{canonical}` for the branch start-point and `origin` for the push target; these are the same remote for maintainers and different remotes for fork-based contributors.

**Discuss before drafting.** The SEP guidelines require a Working Group to sponsor a SEP before formal review. Check whether the idea fits the current focus on the roadmap (`docs/development/roadmap.mdx`), raise it with the relevant Working Group, and reach consensus on a SEP the group wants to sponsor. If the user has not done this yet, say so explicitly and tell them to take the idea to the relevant Working Group. If no Working Group covers the area, send them to the Interest Group that does, which can start a Working Group, or to the process for forming a new Working Group ("Forming a group" in `docs/community/working-interest-groups.mdx`). The skill can still write the SEP file and open a draft pull request so the user can develop the idea in the open. A draft pull request without a sponsor is not yet in the SEP process and has no SEP status. A cold SEP is valid but more likely to stall — and if no sponsor is found within 6 months, Core Maintainers may close the PR and mark the SEP `dormant`. A SEP without a linked prior discussion is not accepted.

The SEP author is responsible for building consensus within the community and documenting dissenting opinions — capture both as you go.

## Phase 1 — Gate

Before any interview or research, decide from the one-line `{idea}` whether this is SEP-worthy.

**Redirect** (do not proceed) if the idea is:

- A bug fix or typo correction
- A documentation clarification
- Adding examples to an existing feature
- A minor schema fix that does not change behavior

For these, point the user at a regular pull request or the bug-report issue form instead and stop.

**Proceed** if the idea is:

- A new protocol feature or a change to an existing one
- A breaking change
- A governance or process change
- Anything controversial enough to need a design document and historical record

When unsure, the guidelines say to ask in Discord before starting significant work — point the user there rather than burning time on a draft that may not be SEP-worthy.

## Phase 2 — Interview

Ask the user these six questions before touching any files. The answers feed directly into the draft.

1. **SEP type?** Standards Track (core protocol feature), Extensions Track (extension rather than core — see SEP-2133), Informational (guidelines/design notes), or Process (governance/workflow change). Most SEPs are Standards Track.
   - **If Extensions Track:** also ask which Working Group and Extension Maintainers will be responsible for the extension — SEP-2133 makes this a hard requirement, and an Extensions Track SEP MUST have at least one reference implementation in an official SDK prior to review.
2. **Is this a breaking change?** Determines how much weight the Backward Compatibility section carries.
3. **Prototype status?** There are two distinct gates: a working prototype is required before a SEP can be **accepted**, and a complete reference implementation is required before it can reach **Final**. The prototype proves feasibility — it doesn't need to be production-ready, but it must be runnable, not pseudocode. Does one exist, is one in progress, or is it still TBD?
4. **Where was this discussed?** A Discord thread or notes from a Working Group or Interest Group meeting. The link becomes the consensus evidence in the Rationale section. If the answer is "nowhere," flag it (see above).
5. **Author and sponsor?** Capture the author's name, email, and GitHub username for the `Author(s)` preamble field. Then ask which Working Group sponsors the SEP. The `Sponsor` preamble field names the Maintainer or Core Maintainer who acts on the sponsoring group's behalf. That person is responsible for the SEP's status and labels, sets `draft` status and brings the SEP to the Core Maintainers. If a Working Group has agreed to sponsor the SEP, capture that person's name and GitHub username and the group's name. Keep the username without the `@` as well, since `gh pr create --reviewer` expects a bare handle. If not, record that there is no sponsor yet. The draft's preamble reads `Sponsor: None` for now, and any pull request stays a draft pull request until a Working Group agrees to sponsor the SEP, as described in `docs/community/sep-guidelines.mdx`. Until a sponsor signs on, the SEP sits in an "awaiting sponsor" state (Core Maintainers may close it as `dormant` after 6 months).
6. **Security implications?** Does this proposal touch the attack surface — new transports, auth flows, data exposure, trust boundaries? The Security Implications section is required in `seps/TEMPLATE.md`; even "none identified" needs to be stated explicitly with reasoning.

## Phase 3 — Research

Run each step and **capture the findings** — they feed directly into the draft sections.

### 1. Current spec coverage

Use the `SearchModelContextProtocol` tool on the `mcp-docs` MCP server (if available) to find what the spec already says about this area. If that server is not configured, fall back to `grep -rn "{keyword}" docs/specification/draft/`. This becomes the "why is the current spec inadequate" half of the Motivation section.

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

## Phase 4 — Draft

Read `seps/TEMPLATE.md` and fill each section in order. Write to `seps/0000-{slug}.md` where `{slug}` is a lowercase, hyphenated version of the idea trimmed to ~50 characters (match the pattern of existing `seps/*.md` filenames). The `0000` placeholder is the documented convention from the SEP guidelines.

Everything above the `---` rule in the template is required — write "none identified" with reasoning rather than omitting a section. Headings under "Additional Optional Sections" are optional.

**Preamble notes:**

- `Status:` — leave blank or omit. Authors should request status changes through their sponsor rather than setting the field themselves.
- `Type:` — from Q1: `Standards Track | Informational | Process | Extensions Track`.
- `Created:` — today's date in `YYYY-MM-DD` format.
- `Author(s):` — `Name <email> (@github-username)` from Q5.
- `Sponsor:` — from Q5, in the form `Name (@github-username), on behalf of the {group} Working Group` or `Name (@github-username), on behalf of the Core Maintainers`, or the literal `None`.
- `PR:` — set to `https://github.com/modelcontextprotocol/modelcontextprotocol/pull/{NUMBER}` (the `{NUMBER}` placeholder gets filled in Phase 6).

## Phase 5 — Checkpoint

Tell the user:

- The path to the draft file
- A one-line summary of what went into each section

If Q5 recorded no sponsor, tell the user that a pull request opened now is a draft pull request for developing the idea in the open, and that it is not in the SEP process until a Working Group agrees to sponsor it.

Then **ask**: open a draft PR now, or stop here so they can edit the file first?

**Do not proceed to Phase 6 without a yes.**

## Phase 6 — Open PR (only if the user says yes)

Use `sep: {title}` until the PR is numbered, then `sep(SEP-{N}): {title}`.
Follow-up PRs keep the original SEP number and link to the proposal.
See [CONTRIBUTING.md](../../../../CONTRIBUTING.md#pull-request-titles) for the full policy.

Before creating the PR, write its description to `/tmp/sep-pr-body.md` with the
change, motivation, validation, required prior-discussion link, and AI disclosure.

```bash
git fetch {canonical}
git checkout -b sep/{slug} {canonical}/main
git add seps/0000-{slug}.md
git commit -m "sep: {title}"
git push -u origin sep/{slug}
gh pr create --repo modelcontextprotocol/modelcontextprotocol --base main \
  --title "sep: {title}" --body-file /tmp/sep-pr-body.md --draft --reviewer {sponsor-username}
```

`{canonical}` is the remote established in the Prerequisite (either `origin` or `upstream`); `origin` is always the push target. If the `sep/{slug}` branch already exists (e.g., re-entering this phase after a checkpoint pause), reuse it instead of creating a new one. Omit `--reviewer` if Q5 answered `None`. If `gh` prompts for a default repository, run `gh repo set-default modelcontextprotocol/modelcontextprotocol` and retry.

Capture the PR number `{N}` from `gh pr create` output, then backfill:

```bash
git mv seps/0000-{slug}.md seps/{N}-{slug}.md
# edit the file: replace SEP-{NUMBER} with SEP-{N} in the title line,
# fill the PR link in the preamble
npm run generate:seps
npm run format:docs
git add seps/{N}-{slug}.md docs/seps/ docs/docs.json
git commit -m "sep(SEP-{N}): assign proposal number"
git push
gh pr edit {N} --repo modelcontextprotocol/modelcontextprotocol \
  --title "sep(SEP-{N}): {title}"
```

The PR title check is advisory during rollout and does not validate individual
branch commits. `npm run generate:seps` still renders `docs/seps/{N}-{slug}.mdx`
and updates `docs/docs.json` for the existing `render-seps.yml` check; commit those
files. `npm run format:docs` keeps the formatting check green.

Once the PR is open, share it in the relevant Working Group's Discord channel. When a Working Group has agreed to sponsor the SEP, mark the pull request ready for review so the sponsor named in the `Sponsor` field can set `draft` status. Until then it stays a draft pull request. The 6-month clock starts now.
