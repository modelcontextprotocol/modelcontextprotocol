---
title: "Update on the Next MCP Protocol Release"
date: 2025-09-21T10:00:00-08:00
draft: true
tags: ["mcp", "protocol", "roadmap", "community"]
author: "David Soria Parra"
description: "An update on the timeline and priorities for the next Model Context Protocol specification version"
---

## Release Timeline Update

The next version of the Model Context Protocol specification will be released on **November 25th, 2025**, with a release candidate available on **November 11th, 2025**. This 14-day release candidate period will allow client implementors and SDK maintainers to validate protocol changes before the final release. This updated timeline allows for proper focus on delivering critical improvements needed for the protocol's evolution and ensures our [new governance model](https://modelcontextprotocol.io/community/governance) is functioning effectively.

## Summer Progress

Over the past few months, we've focused on establishing the foundations for the broader MCP ecosystem:

### [Formal governance structures](https://modelcontextprotocol.io/community/governance)

We established a [formal governance model for MCP](https://modelcontextprotocol.io/community/governance), including defined roles and decision-making mechanisms. Additionally, we developed the Specification Enhancement Proposal (SEP) process to provide clear guidelines for contributing specification changes and transparent decision-making procedures.

Our governance model is still in its early stages and we're iterating on making it scale better as the protocol and the community around it grows.

### [Working groups](https://modelcontextprotocol.io/community/working-interest-groups)

We've established [Working Groups and Interest Groups](https://modelcontextprotocol.io/community/working-interest-groups) to foster community collaboration and drive the specification forward. These groups serve multiple purposes: they provide clear entry points for new contributors, empower community members to lead initiatives in their areas of expertise, and distribute ownership across the ecosystem rather than concentrating it among core maintainers.

While the working group model is evolving, we're also actively developing governance structures that will grant these groups greater autonomy in decision-making and implementation. This distributed approach ensures the protocol can grow sustainably while maintaining quality and consistency across different focus areas.

### [Registry development](https://github.com/modelcontextprotocol/registry)

We [launched the MCP Registry in preview](https://blog.modelcontextprotocol.io/posts/2025-09-08-mcp-registry-preview/) as an open catalog and API for publicly available MCP servers to improve discoverability across the ecosystem. This centralized infrastructure serves as a single source of truth for MCP servers, supporting both public and private sub-registries that organizations can customize for their specific needs.

The MCP registry represents a collaborative effort involving multiple companies and developers, with community-driven moderation mechanisms to maintain a high quality bar.

MCP clients can also consume registry content via registry aggregators, enabling users to easily discover and integrate MCP servers into their AI workflows.

All of these initiatives set the foundation for MCP's continued development. We know that there is more work ahead, and we want to lean on the broad expertise of our community to help shape the protocol in a way that serves it.

Our governance model and formalized working groups will enable focused development on the highest priority protocol improvements while incorporating community input and contributions. MCP continues to be an **open protocol**, where **anyone can contribute**.

## Priority Areas for the Next Release

### Asynchronous Operations

Implementing support for asynchronous tasks and tool calling in MCP to enable long-running operations. This enhancement will allow server and client authors to build patterns for longer-running server-side agentic tasks. The Agents Working Group is leading this effort, with current development focused on [SEP-1391](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1391).

### Statelessness and Scalability

Improving the protocol's stateless capabilities to enable easier scaling for MCP server deployments in large production environments.

While Streamable HTTP supports stateless deployments of MCP servers, production environments face challenges with initialization sequences and session management. The Transport Working Group is developing improvements to the transport layer that will support stateless MCP while maintaining straightforward upgrade paths to stateful implementations when needed.

### Server Identity

Implementing server identity through well-known URLs that expose server metadata, improving discovery and authorization mechanisms.

Currently, clients must initialize a connection to an MCP server to obtain server information. This requirement complicates discovery for both clients clients as well as crawlers, such as registry indexing systems. The planned implementation will use the standardized `.well-known` format, allowing server authors to expose MCP server information in a static, cacheable, and easily discoverable manner.

### Official Extensions

Establishing officially endorsed extensions for MCP. We see patterns emerging in the MCP ecosystem that are highly relevant to specific use cases and industry domains. While not all of them can be embedded directly into the specification, we recognize that there is still a very real need to provide extensibility points that enable folks to build the experiences they need on top of MCP.

The extensibility project will document the most widely adopted extensions and those best suited for particular areas as official **Extensions to MCP** to encourage broader ecosystem adoption.

### SDK Support Standardization

We will be introducing a tiering system for MCP SDKs to provide clarity about support levels and spec conformance. This standardization will be based on factors including specification compliance velocity, maintainer responsiveness, and feature completeness. The tiering framework will help users make informed decisions when selecting SDKs for their projects while also having clear expectations for different levels of support they can get from taking on the dependency.

## Call for Contributors

As MCP grows, we welcome contributors - both individuals and companies. Contributions are especially needed in several areas key to the MCP success:

### SDK Maintenance

- [**TypeScript SDK**](https://github.com/modelcontextprotocol/typescript-sdk) - Needs additional maintainers for feature development and bug fixes
- [**Swift SDK**](https://github.com/modelcontextprotocol/swift-sdk) - Requires attention for Apple ecosystem support
- [Other language SDKs](https://modelcontextprotocol.io/docs/sdk) welcome continued contributions

### Tooling

- [**Inspector**](https://github.com/modelcontextprotocol/inspector) - Maintainence of the MCP Inspector
- **Registry** - Backend API and CLI development for the server registry; Go expertise would be particularly welcome

## Input from Client Implementors

MCP is also not just about servers, but also clients - the tools that enable customers to connect to our ecosystem. If you are implementing MCP clients, your experience and understanding of requirements are crucial for shaping the protocol's evolution. We want to hear from you on both protocol capabilities as well as processes that will enable you to scale your work as we add new features.

Client implementors are invited to join the `#client-implementors` working group channel in the [MCP Discord](https://modelcontextprotocol.io/community/communication).
