# Specification Enhancement Proposals (SEPs)

## Overview

This directory contains SEPs in markdown file format, inspired by Python's PEP system. Each SEP is a standalone markdown document that describes a proposed enhancement to the MCP specification.

SEPs are submitted as pull requests to this directory. Using PRs ensures:

- Proper versioning history for all changes to a proposal
- A single place for discussion (the PR itself)
- Clear traceability between the proposal and its review process

## File Naming Convention

SEP files use the format: `{NUMBER}-{TITLE}.md`

Where:

- **NUMBER**: The pull request number that introduces this SEP
- **TITLE**: A short, lowercase, hyphenated title

Examples:

- `1234-resource-templates.md`
- `1567-sampling-improvements.md`

## Creating a New SEP

1. **Draft your SEP** as a markdown file with a temporary name (e.g., `0000-your-feature.md`) using `0000` as a placeholder number

2. **Create a pull request** adding your SEP file to the `seps/` directory

3. **Amend your commit** to rename the file using the PR number as the SEP number (e.g., PR #1850 becomes `1850-your-feature.md`) and update the SEP header to reference the correct number

4. **Find a Sponsor** - A Core Maintainer or Maintainer who will shepherd your proposal through review. Tag potential sponsors from [the maintainer list](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/MAINTAINERS.md) in your PR

5. **Iterate on feedback** - Address comments and suggestions from the community and your sponsor

## SEP File Structure

```markdown
# SEP-{NUMBER}: {Title}

- **Status**: Draft | In-Review | Accepted | Rejected | Withdrawn | Final | Superseded
- **Type**: Standards Track | Informational | Process
- **Created**: YYYY-MM-DD
- **Author(s)**: Name <email> (@github-username)
- **Sponsor**: @github-username (or "None" if seeking sponsor)
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

```
Draft → In-Review → Accepted → Final
                 ↘ Rejected
                 ↘ Withdrawn
                 ↘ Superseded
```

- **Draft**: Initial proposal, seeking or assigned sponsor, informal review
- **In-Review**: Open for formal community and maintainer review
- **Accepted**: Approved by Core Maintainers, pending reference implementation
- **Final**: Reference implementation complete and merged into the specification
- **Rejected**: Not accepted after review
- **Withdrawn**: Author withdrew the proposal
- **Superseded**: Replaced by a newer SEP

### Status Transitions

Status transitions are managed by the **Sponsor** of the SEP. The Sponsor is responsible for:

1. Updating the `Status` field in the SEP markdown file
2. Applying matching labels to the pull request (e.g., `draft`, `in-review`, `accepted`)
3. Ensuring the status accurately reflects the current state of the proposal
4. Communicating status changes to the author and community via the PR

Both the markdown status field and PR labels should be kept in sync. PR labels make it easier to filter and search for SEPs by status.

Only Sponsors (Core Maintainers or Maintainers) should modify the status field and labels. Authors should request status changes through their Sponsor.

## The Sponsor Role

A Sponsor is a Core Maintainer or Maintainer who:

- Champions the proposal through the review process
- Reviews the proposal and provides constructive feedback
- Requests changes based on community input
- Updates the SEP status as the proposal progresses
- Initiates formal review when the SEP is ready
- Presents the proposal at Core Maintainer meetings when needed

You can find potential sponsors in [the maintainer list](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/MAINTAINERS.md). Tag them in your PR to request sponsorship.

### Finding a Sponsor

Proposals that do not find a sponsor within six months may be closed as `dormant`. To increase your chances of finding a sponsor:

- Ensure your proposal is well-written and follows the SEP format
- Provide clear motivation for why the change is needed
- Include a prototype or reference implementation when possible
- Engage with the community on Discord to build support

## Why PR Numbers?

Using the PR number as the SEP number:

- Eliminates need for manual number assignment by maintainers
- Creates natural traceability between proposal and discussion
- Prevents number conflicts
- Simplifies the contribution process
- Maintains full version history of the proposal

## Acceptance Criteria

For a SEP to be accepted, it must meet certain minimum criteria:

- Prototype or reference implementation demonstrating the proposal
- Clear benefit to the MCP ecosystem
- Community support and consensus

## Updating a SEP

To update a SEP that has already been merged:

1. Create a new PR with your changes to the existing SEP file
2. Reference the original SEP number in your PR description
3. The Sponsor will review and merge updates as appropriate

## Copyright

SEPs are placed in the public domain or under the CC0-1.0-Universal license, whichever is more permissive.
