---
title: "Update on the Next MCP Spec Release"
date: 2025-09-26T10:00:00-08:00
draft: true
tags: ["mcp", "protocol", "roadmap", "community"]
author: "David Soria Parra"
description: "An update on the timeline and priorities for the next Model Context Protocol specification version"
---

The next version of the Model Context Protocol will be released on **November 25th, 2025**. This timeline allows us to focus on delivering important improvements needed for the protocol's evolution, such as asynchronous tasks, stateless transport enhancements, and server identity, while ensuring our [new governance model](https://modelcontextprotocol.io/community/governance) is functioning effectively.

## Progress Since Last Spec Release

Our last spec was released on June 18, 2025, and focused on structured tool outputs, OAuth-based authorization, elicitation for server-initiated user interactions, and improved security best practices.

Since then, we’ve focused on establishing additional foundations for the MCP ecosystem:

### Formal governance structures

We established a [formal governance model](https://modelcontextprotocol.io/community/governance) for MCP, including defined roles and decision-making mechanisms. Additionally, we developed the [Specification Enhancement Proposal (SEP)](https://modelcontextprotocol.io/community/sep-guidelines) process to provide clear guidelines for contributing specification changes and transparent decision-making procedures. This process is still in its early phase and we’re working on making it smoother and faster.

### Working groups

To foster community collaboration and drive the specification forward, we established [Working and Interest Groups](https://modelcontextprotocol.io/community/working-interest-groups). These groups serve multiple purposes:

1. Provide clear entry points for new contributors
2. Empower community members to lead initiatives in their areas of expertise
3. Distribute ownership across the ecosystem rather than concentrating it among core maintainers

While our working group model is still evolving, we're actively developing governance structures that will grant these groups greater autonomy in decision-making and implementation. This distributed approach ensures the protocol can grow sustainably while maintaining quality and consistency across different focus areas.

### Registry development

To improve discoverability across the ecosystem, we launched the [MCP Registry](https://blog.modelcontextprotocol.io/posts/2025-09-08-mcp-registry-preview/) in preview as an open catalog and API for publicly available MCP servers. This centralized infrastructure serves as a single location where clients can discover MCP servers they want to use. It’s backed by a standardized API spec, supporting both public and private sub-registries that organizations can customize for their specific needs.

These initiatives provide the foundation for MCP's continued development. The established governance model and working groups enable focused development on high-priority protocol improvements, while the registry provides an open and community-driven approach to expanding server adoption. We’re excited to see these initiatives grow in the coming months as we focus on the next specification release.

## Priority Areas for the Next Release

### Asynchronous Operations

Implementing support for asynchronous tasks and tool calling in MCP to enable long-running operations. This enhancement will allow server and client authors to build patterns for longer-running server-side agentic tasks. The Agents Working Group is leading this effort, with current development focused on [SEP-1391](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1391).

### Statelessness and Scalability

Improving the protocol's statelessness capabilities to enable easier scaling for MCP server deployments in large production environments.

While Streamable HTTP supports stateless deployments of MCP servers, production environments face challenges with initialization sequences and session management. These issues complicate real-world stateless deployments using Streamable HTTP. The **Transport Working Group** is developing improvements to the transport layer that will support stateless MCP while maintaining straightforward upgrade paths to stateful implementations when needed

### Server Identity

Implementing server identity through well-known URLs that expose server metadata, improving discovery and authentication mechanisms.

Currently, clients must initialize a connection to an MCP server to obtain server information, which complicates discovery for clients and crawlers (such as registry systems). The planned implementation will use the standardized .well-known format, allowing server authors to expose MCP server information in a static, cacheable, and easily discoverable manner.

### Official Extensions

Establishing officially endorsed extensions to MCP. Patterns are emerging in the MCP ecosystem that are highly relevant to specific use cases or industry domains. The project will document the most widely adopted extensions and those best suited for particular areas as official _Extensions to MCP_ to encourage broader ecosystem adoption.

### SDK Support Standardization

Introducing a tiering system for MCP SDKs to provide clarity to developers about support levels and maintenance quality. This standardization will be based on factors including specification compliance speed, maintenance responsiveness, and feature completeness. The tiering framework will help users make informed decisions when selecting SDKs for their projects while establishing clear expectations for different levels of support.

## Call for Contributors

The project welcomes contributors, both individuals and companies. Contributions are particularly needed in several key areas:

### SDK Maintenance

- [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) - Needs additional maintainers for feature development and bug fixes
- [Swift SDK](https://github.com/modelcontextprotocol/swift-sdk) - Requires attention for Apple ecosystem support
- [Other language SDKs](https://modelcontextprotocol.io/docs/sdk) - Continued contributions are welcome

### Tooling

- [Inspector](https://github.com/modelcontextprotocol/inspector) - Maintenance of the MCP Inspector
- [Registry](https://github.com/modelcontextprotocol/registry/tree/main/docs) - Backend API and CLI development for the server registry; in particular, Go expertise would be very welcome. Front-end TypeScript development expertise may also be helpful in the near future.

## Input from Client Implementors

We particularly value feedback from teams implementing widely used MCP clients. Your experience and requirements are crucial for shaping the protocol's evolution.

Client implementors are invited to join the `#client-implementors` working group channel in the [MCP Discord](https://modelcontextprotocol.io/community/communication).

Thank you for your continued support and we look forward to sharing more soon.
