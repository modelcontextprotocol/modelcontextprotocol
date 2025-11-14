# SEP-1802: File-Based SEP Workflow

- **Status**: Draft
- **Type**: Process
- **Created**: 2025-11-12
- **Author(s)**: Nick C. (@nickcoai)
- **Sponsor**: @nickcoai
- **PR**: #1802

## Abstract

This SEP formalizes the Markdown-file-based SEP workflow that stores proposals in the `seps/` directory of the Model Context Protocol repository. The workflow assigns SEP numbers from pull requests, keeps each proposal's history in Git, and removes the need to manage GitHub Issues as the primary source of truth for SEPs. This document makes the file-based process the canonical way to author, review, and accept SEPs while still allowing GitHub Issues for early idea discussion when helpful.

## Motivation

The issue-based SEP process introduced friction:

- Proposal content was dispersed between issues, linked documents, and pull requests, which complicated review and archival.
- SEP numbers had to be coordinated manually when proposals moved between issues and pull requests.
- Maintaining long-form specifications inside issue bodies made iterative edits harder, especially when multiple contributors collaborated.

A file-based workflow keeps every SEP in version control alongside the specification itself. Git provides built-in review tooling, history, and searchability. Linking SEP numbers to pull requests removes manual bookkeeping while still surfacing discussion in the pull request thread.

## Specification

1. **Canonical Location**
   - Every SEP lives in `seps/{NUMBER}-{slug}.md`.
   - The SEP number is always the pull request number that introduces the SEP file.

2. **Author Workflow**
   - Draft the proposal in `seps/DRAFT-{slug}.md`.
   - Open a pull request containing the draft SEP and any supporting materials.
   - Request a sponsor from the Maintainers list; record the sponsor in the SEP header once confirmed.
   - After the pull request number is known, rename the file to `{PR}-{slug}.md` and update the header (`SEP-{PR}` and `PR: #{PR}`).

3. **Review Flow**
   - Status progression is `Draft → In-Review → Accepted → Final`, with optional `Rejected`, `Withdrawn`, or `Superseded`.
   - Sponsors manage status updates directly in the SEP file and in the pull request labels.
   - Reference implementations are tracked via linked pull requests or issues and must be complete before marking a SEP as `Final`.

4. **Documentation Updates**
   - `docs/community/sep-guidelines.mdx` serves as the contributor-facing instructions and must reflect this workflow.
   - `seps/README.md` remains the concise reference for formatting, naming, sponsor responsibilities, and acceptance criteria.

5. **Legacy Issue-Based Flow**
   - Contributors may optionally open a GitHub Issue for early discussion, but the authoritative SEP text lives in `seps/`.
   - Issues should link to the relevant file once a pull request exists; numbers are no longer derived from issues.

## Rationale

Storing SEPs as files keeps authoritative specs versioned with the code, which mirrors successful processes used by PEPs and other standards bodies. Using pull request numbers eliminates race conditions around manual numbering while keeping a single discussion thread for review. Maintaining two overlapping canonical processes risked divergence; naming the file-based approach as primary reduces confusion for contributors and maintainers.

## Backward Compatibility

- Existing issue-based SEPs remain valid and require no migration, though maintainers may optionally backfill them into `seps/` for archival.
- Links to historical GitHub Issues continue to work; future SEPs should link to the new file locations.

## Security Implications

No new security considerations beyond the standard code-review process.

## Reference Implementation

- This pull request adds the canonical instructions in both `seps/README.md` and `docs/community/sep-guidelines.mdx`.
