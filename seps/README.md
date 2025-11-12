# Specification Enhancement Proposals (SEPs)

This directory now holds the canonical, file-based SEP workflow described in [SEP-DRAFT: File-Based SEP Workflow](./DRAFT-file-based-sep-workflow.md) until it receives its permanent number. The contributor-facing guidelines at https://modelcontextprotocol.io/community/sep-guidelines mirror the steps below.

## Overview

This directory contains SEPs in markdown file format, similar to Python's PEP system. Each SEP is a standalone markdown document that describes a proposed enhancement to the MCP specification.

## File Naming Convention

SEP files use the format: `{NUMBER}-{TITLE}.md`

Where:

- **NUMBER**: The pull request number that introduces this SEP
- **TITLE**: A short, lowercase, hyphenated title

Examples:

- `1234-resource-templates.md`
- `1567-sampling-improvements.md`

## Creating a New SEP

1. **Draft your SEP** inside `seps/` with a temporary filename such as `DRAFT-your-feature.md`.
2. **Open a pull request** that includes the draft and any supporting material.
3. **Find a Sponsor** — tag potential sponsors from [`MAINTAINERS.md`](../MAINTAINERS.md) and record the confirmed sponsor in the SEP header.
4. **Rename the file after the PR number** once the pull request exists (`PR #1850 → seps/1850-your-feature.md`) and update the header to `SEP-1850`.
5. **Iterate in the pull request** until the sponsor promotes the proposal through `Draft → In-Review → Accepted → Final`.

## SEP File Structure

```markdown
# SEP-{NUMBER}: {Title}

- **Status**: Draft | In-Review | Accepted | Rejected | Withdrawn | Final
- **Type**: Standards Track | Informational | Process
- **Created**: YYYY-MM-DD
- **Author(s)**: Name <email> (@github-username)
- **Sponsor**: @github-username
- **PR**: #{NUMBER}

## Abstract

Brief (~200 word) technical summary of the proposal.

## Motivation

Why is this change needed? Why is the current protocol inadequate?

## Specification

Detailed technical specification of the proposed changes.

## Rationale

Design decisions made and alternatives that were considered.

## Backward Compatibility

How does this affect existing implementations? (Required for incompatible changes)

## Security Implications

Any security concerns related to this proposal.

## Reference Implementation

Link to or description of a reference implementation (required before Final status).
```

## SEP Types

- **Standards Track**: New protocol features or changes affecting interoperability
- **Informational**: Design issues, guidelines, or information without new features
- **Process**: Changes to MCP processes or governance

## Status Workflow

`Draft` → `In-Review` → `Accepted` → `Final`

Alternative outcomes: `Rejected`, `Withdrawn`, or `Superseded`

- **Draft**: Initial proposal, sponsor assigned, informal review
- **In-Review**: Open for formal community and maintainer review
- **Accepted**: Approved, pending reference implementation
- **Final**: Implemented and merged into the specification
- **Rejected**: Not accepted after review
- **Withdrawn**: Author withdrew the proposal
- **Superseded**: Replaced by a newer SEP

## The Sponsor Role

A Sponsor is a Core Maintainer or Maintainer who:

- Reviews the proposal and provides feedback
- Requests changes based on community input
- Initiates formal review when the SEP is ready
- Shepherds the proposal through the acceptance process

You can find potential sponsors in the maintainers list. Tag them in your PR to request sponsorship.

## Why PR Numbers?

Using the PR number as the SEP number:

- Eliminates need for maintainer number assignment
- Creates natural traceability between proposal and discussion
- Prevents number conflicts
- Simplifies the contribution process

## Acceptance Criteria

- Prototype/reference implementation
- Clear benefit to the MCP ecosystem
- Community consensus

## Relationship to Issue-Based SEPs

GitHub Issues remain useful for early discussion or coordinating reference implementations, but the file inside `seps/` is the single source of truth for every SEP. Authors who start in an issue should link to the draft file once a pull request exists, and the SEP number must always match the pull request number that first introduces the file.
