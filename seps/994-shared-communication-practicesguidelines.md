# SEP-994: Shared Communication Practices/Guidelines

- **Status**: Final
- **Type**: Process
- **Created**: 2025-07-17
- **Author(s)**: @localden
- **Issue**: #994
- **PR**: #1002

## Abstract

This SEP establishes the communication strategy and framework for the Model Context Protocol community. It defines the official channels for contributor communication, guidelines for their use, and processes for decision documentation.

## Motivation

As the MCP community grows, clear communication guidelines are essential for:

- **Consistency**: Ensuring all contributors know where and how to communicate
- **Transparency**: Making project decisions visible and accessible
- **Efficiency**: Directing discussions to the most appropriate channels
- **Security**: Establishing proper processes for handling sensitive issues

## Specification

### Communication Channels

The MCP project uses three primary communication channels:

1. **Discord**: For real-time or ad-hoc discussions among contributors
2. **GitHub Discussions**: For structured, longer-form discussions
3. **GitHub Issues**: For actionable tasks, bug reports, and feature requests

Security-sensitive issues follow a separate process defined in SECURITY.md.

### Discord Guidelines

The Discord server is designed for **MCP contributors** and is not intended for general MCP support.

#### Public Channels (Default)

- Open community engagement and collaborative development
- SDK and tooling development discussions
- Working and Interest Group discussions
- Community onboarding and contribution guidance
- Office hours and maintainer availability

#### Private Channels (Exceptions)

Private channels are reserved for:

- Security incidents (CVEs, protocol vulnerabilities)
- People matters (maintainer discussions, code of conduct)
- Coordination requiring immediate focused response

All technical and governance decisions must be documented publicly in GitHub.

### GitHub Discussions

Used for structured, long-form discussion:

- Project roadmap planning
- Announcements and release communications
- Community polls and consensus-building
- Feature requests with context and rationale

### GitHub Issues

Used for actionable items:

- Bug reports with reproducible steps
- Documentation improvements
- CI/CD and infrastructure issues
- Release tasks and milestone tracking

### Decision Records

All MCP decisions are documented publicly:

- **Technical decisions**: GitHub Issues and SEPs
- **Specification changes**: Changelog on the MCP website
- **Process changes**: Community documentation
- **Governance decisions**: GitHub Issues and SEPs

Decision documentation includes:

- Decision makers
- Background context and motivation
- Options considered
- Rationale for chosen approach
- Implementation steps

## Rationale

This framework balances openness with practicality:

- **Public by default**: Maximizes transparency and community participation
- **Private when necessary**: Protects security and personal matters
- **Channel separation**: Keeps discussions organized and searchable
- **Documentation requirements**: Ensures decisions are preserved and discoverable

## Backward Compatibility

This SEP establishes new processes and does not affect existing protocol functionality.

## Reference Implementation

The communication guidelines are published at: https://modelcontextprotocol.io/community/communication
