# SEP-{NUMBER}: {Title}

> **Note**: This template provides a standard structure for SEPs. You may adapt sections based on the specific needs of your proposal. For example, Process SEPs may not need a "Backward Compatibility" section, while Standards Track SEPs should include detailed technical specifications.

- **Status**: Draft | In-Review | Accepted | Rejected | Withdrawn | Final | Superseded | Dormant
- **Type**: Standards Track | Informational | Process | Extensions Track
- **Created**: YYYY-MM-DD
- **Author(s)**: Name <email> (@github-username)
- **Sponsor**: @github-username (or "None" if seeking sponsor)
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/{NUMBER}

## Abstract

Brief (~200 word) technical summary of the proposal. This should be a concise overview that allows readers to quickly understand what this SEP proposes.

## Motivation

Why is this change needed? Why is the current protocol specification inadequate to address the problem that this SEP solves?

The motivation is critical for SEPs that want to change the Model Context Protocol. SEP submissions without sufficient motivation may be rejected outright.

## Specification

Detailed technical specification of the proposed changes. The specification should describe the syntax and semantics of any new protocol feature in sufficient detail to allow competing, interoperable implementations.

For Protocol changes, include:

- New message formats or data structures
- Endpoints or methods
- Behavioral requirements
- Error handling

For Process changes, include:

- Step-by-step procedures
- Roles and responsibilities
- Timelines or milestones

## Rationale

Explain why particular design decisions were made. This section should:

- Describe alternate designs that were considered
- Explain why the proposed approach was chosen
- Reference related work or prior art
- Document important objections or concerns raised during discussion
- Provide evidence of consensus within the community

## Backward Compatibility

**Required for SEPs that introduce backward incompatibilities.**

Describe:

- What existing functionality will break or change
- The severity and scope of incompatibilities
- How the author proposes to handle the transition
- Migration paths for existing implementations

If there are no backward compatibility concerns, state that explicitly.

## Security Implications

Describe any security concerns related to this proposal, including:

- New attack surfaces
- Privacy considerations
- Authentication or authorization changes
- Data validation requirements

If there are no security implications, state that explicitly.

## Reference Implementation

Link to a working prototype demonstrating the proposal, such as an SDK branch or fork, a standalone proof of concept, or a reference server or client. A prototype is required before a SEP can be accepted and does not need to be production-ready. See [Prototype Requirements](https://modelcontextprotocol.io/community/sep-guidelines#prototype-requirements) for what qualifies.

Before a SEP can reach "Final" status, the reference implementation must be complete and any required [conformance test](https://modelcontextprotocol.io/community/sep-guidelines#conformance-test-requirement) merged. Include links to the implementation and test results as they become available.

---

## Additional Optional Sections

Depending on your SEP, you may want to include:

### Performance Implications

How does this change affect performance, scalability, or resource usage?

### Testing Plan

How will this proposal be tested? What test cases should implementations cover?

### Alternatives Considered

Detailed discussion of alternative approaches that were rejected and why.

### Open Questions

Unresolved issues that need community input or further discussion.

### Acknowledgments

Credit to people who contributed ideas, feedback, or reviews.
