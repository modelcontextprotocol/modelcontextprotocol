---
title: "Update on the Next MCP Protocol Release"
date: 2025-09-21T10:00:00-08:00
draft: true
tags: ["mcp", "protocol", "roadmap", "community"]
author: "David Soria Parra"
description: "An update on the timeline and priorities for the next Model Context Protocol version"
---

## Release Timeline Update

The next version of the Model Context Protocol will be released on **November 25th, 2025**. This updated timeline allows for proper focus on delivering critical improvements needed for the protocol's evolution and ensures our [new governance model](https://modelcontextprotocol.io/community/governance) is functioning effectively.

## Summer Progress

Over the summer months, we've focused on establishing foundations for the MCP ecosystem:

- [**Formal governance structures**](https://modelcontextprotocol.io/community/governance) - Building sustainable decision-making processes for the protocol
- [**Working groups**](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/MAINTAINERS.md) - Organizing specialized teams to tackle specific protocol areas
- [**Registry development**](https://blog.modelcontextprotocol.io/posts/2025-09-08-mcp-registry-preview/) - Progress on the MCP server registry infrastructure
- **Adjacent projects** - Supporting tooling and ecosystem development

These initiatives provide the foundation for MCP's continued development. The established governance model and working groups enable focused development on high-priority protocol improvements.

## Priority Areas for the Next Release

### Asynchronous Operations

Implementing support for asynchronous tasks and tool calling in MCP to enable long-running operations. This enhancement will allow server and client authors to build patterns for longer-running agentic tasks on the server side. The Agents Working Group is leading this effort, with current development focused on [SEP-1391](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1391).

### Statelessness and Scalability

Improving the protocol's statelessness capabilities to enable easier scaling for MCP server deployments in large production environments.

While Streamable HTTP supports stateless deployments of MCP servers, production environments face challenges with initialization sequences and session management. These issues complicate real-world stateless deployments using Streamable HTTP. The Transport Working Group is developing improvements to the transport layer that will support stateless MCP while maintaining straightforward upgrade paths to stateful implementations when needed.

### Server Identity

Implementing server identity through well-known URLs that expose server metadata, improving discovery and authentication mechanisms.

Currently, clients must initialize a connection to an MCP server to obtain server information. This requirement complicates discovery for clients and crawlers (such as registry systems). The planned implementation will use the standardized .well-known format, allowing server authors to expose MCP server information in a static, cacheable, and easily discoverable manner.

### Official Extensions

Establishing officially endorsed extensions to MCP. Patterns are emerging in the MCP ecosystem that are highly relevant to specific use cases or industry domains. The project will document the most widely adopted extensions and those best suited for particular areas as official _Extensions to MCP_ to encourage broader ecosystem adoption.

### SDK Support Tiers

Implementing a standardized tiering system for MCP SDKs based on specification compliance, maintenance quality, and update frequency. This framework will establish clear expectations for SDK support levels:

- **Tier 1** - Official SDKs with guaranteed same-day specification support and comprehensive maintenance
- **Tier 2** - Community-maintained SDKs with regular updates and strong specification compliance  
- **Tier 3** - Community SDKs with basic functionality and best-effort maintenance

This tiering system will help developers choose appropriate SDKs for their use cases while providing clear pathways for SDK maintainers to improve their support level.

## Call for Contributors

The project welcomes contributors, both individuals and companies. Contributions are particularly needed in several key areas:

### SDK Maintenance

- **TypeScript SDK** - Needs additional maintainers for feature development and bug fixes
- **Swift SDK** - Requires attention for Apple ecosystem support
- Other language SDKs welcome continued contributions

### Tooling

- **Inspector** - Development and maintenance of debugging tools
- **Registry** - Backend and frontend development for the server registry

## Input from Client Implementors

We particularly value feedback from teams implementing widely used MCP clients. Your experience and requirements are crucial for shaping the protocol's evolution.

Client implementors are invited to join the client implementors working group the discussion on the [MCP Discord](https://modelcontextprotocol.io/community/communication).

---

_David Soria Parra_
_Lead Core Maintainer, Model Context Protocol_
