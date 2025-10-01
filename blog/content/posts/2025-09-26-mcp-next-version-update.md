---
title: "Update on the Next MCP Protocol Release"
date: 2025-09-26T10:00:00-08:00
draft: false
tags: ["mcp", "protocol", "roadmap", "community"]
author: "David Soria Parra"
description: "An update on the timeline and priorities for the next Model Context Protocol specification version"
---

## Release Timeline

The next version of the Model Context Protocol specification will be released on **November 25th, 2025**, with a release candidate (RC) available on **November 11th, 2025**.

We're building in a 14-day RC validation window so client implementors and SDK maintainers can thoroughly test the protocol changes. This approach gives us the focused time we need to deliver critical improvements while applying our [new governance model](https://modelcontextprotocol.io/community/governance) to the process.

## Summer Progress

Our last spec was released on June 18, 2025, and focused on structured tool outputs, OAuth-based authorization, elicitation for server-initiated user interactions, and improved security best practices.

Since then, we’ve focused on establishing additional foundations for the MCP ecosystem:

### Formal Governance Structures

We established a [formal governance model for MCP](https://modelcontextprotocol.io/community/governance), including defined roles and decision-making mechanisms. We also developed the [Specification Enhancement Proposal (SEP)](https://modelcontextprotocol.io/community/sep-guidelines) process to provide clear guidelines for contributing specification changes.

Our goal is transparency—making decision-making procedures clear and accessible to everyone. Like any new system serving a fast-evolving community, our governance model is still finding its footing. We're actively refining it as both the protocol and community continue to grow.

### Working Groups

We've launched [Working Groups and Interest Groups](https://modelcontextprotocol.io/community/working-interest-groups) to foster community collaboration. These groups serve multiple purposes:

- Provide clear entry points for new contributors
- Empower community members to lead initiatives in their areas of expertise
- Distribute ownership across the ecosystem rather than concentrating it among core maintainers

We're developing governance structures that will grant these groups greater autonomy in decision-making and implementation. This distributed approach ensures the protocol can grow to meet community needs while maintaining quality and consistency across different domains.

### Registry Development

In September, we [launched the MCP Registry preview](https://blog.modelcontextprotocol.io/posts/2025-09-08-mcp-registry-preview/)—an open catalog and API for indexing and discovery of MCP servers. The Registry serves as the single source of truth for available MCP servers, supporting both public and private sub-registries that organizations can customize for their specific needs.

Building the MCP Registry has been a true community effort. Any MCP client can consume registry content via the native API or through third-party registry aggregators, making it easier for users to discover and integrate MCP servers into their AI workflows.

## Priority Areas for the Next Release

With governance and infrastructure foundations in place, we're focusing on five key protocol improvements identified by our working groups.

### Asynchronous Operations

Currently, MCP is built around mostly synchronous operations—when you call a tool, everything stops and waits for it to finish. That works great for quick tasks, but what about operations that take minutes or hours?

The Agents Working Group is adding async support, allowing servers to kick off long-running tasks while clients can check back later for results. You can follow the progress in [SEP-1391](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1391).

### Statelessness and Scalability

As organizations deploy MCP servers at enterprise scale, we're seeing new requirements emerge. Current implementations often need to remember things between requests, which makes horizontal scaling across multiple server instances challenging.

While [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) provides some stateless support, pain points remain around server startup and session handling. The Transport Working Group is smoothing out these rough edges, making it easier to run MCP servers in production while keeping simple upgrade paths for teams who want more sophisticated stateful features.

### Server Identity

Today, if you want to know what an MCP server can do, you have to connect to it first. This makes it difficult for clients to browse available servers or for systems like our registry to automatically catalog capabilities.

We're solving this by letting servers advertise themselves through [`.well-known` URLs](https://en.wikipedia.org/wiki/Well-known_URI)—an established standard for providing metadata. Think of it as a server's business card that anyone can read without having to knock on the door first. This will make discovery much more intuitive for every MCP consumer.

### Official Extensions

As MCP has grown, we've noticed patterns emerging for specific industries and use cases—valuable implementations that don't necessarily belong in the core protocol specification.

Rather than leaving everyone to reinvent the wheel, we're officially recognizing and documenting the most popular protocol extensions. This curated collection of proven patterns will give developers building for specialized domains like healthcare, finance, or education a solid starting point instead of building every custom integration from scratch.

### SDK Support Standardization

Choosing an MCP SDK today can be challenging—it's hard to gauge the level of support or spec compliance you'll get. Some SDKs are lightning-fast with updates, while others might lag behind feature-wise.

We're introducing a clear tiering system for SDKs. You'll know exactly what you're signing up for before committing to a dependency, based on factors like specification compliance speed, maintenance responsiveness, and feature completeness.

## Call for Contributors

MCP is only as strong as the community behind it. Whether you're an individual developer passionate about building SDKs or a company looking to invest in the ecosystem, we need your help in several key areas.

### SDK Maintenance

- [**TypeScript SDK**](https://github.com/modelcontextprotocol/typescript-sdk) - Needs additional maintainers for feature development and bug fixes
- [**Swift SDK**](https://github.com/modelcontextprotocol/swift-sdk) - Requires attention for Apple ecosystem support
- [Other language SDKs](https://modelcontextprotocol.io/docs/sdk) welcome continued contributions

### Tooling

- [**Inspector**](https://github.com/modelcontextprotocol/inspector) - Development and maintenance of debugging tools for MCP server developers
- [**Registry**](https://github.com/modelcontextprotocol/registry) - Backend API and CLI development; **Go expertise would be particularly welcome**

## Input from Client Developers

We talk a lot about MCP servers, but clients are equally important—they're the bridge connecting users to the entire MCP ecosystem. If you're building an MCP client, you're seeing the protocol from a unique angle, and we need that perspective embedded in the protocol design.

Your real-world experience with implementation challenges, performance bottlenecks, and user needs directly shapes where the protocol should go next. Whether it's feedback on existing capabilities or ideas for streamlining the developer experience, we want to hear from you.

Join us in the `#client-implementors` working group channel in the [MCP Discord](https://modelcontextprotocol.io/community/communication).

## Looking Ahead

With governance structures and working groups in place, we're better positioned to tackle major protocol improvements efficiently while ensuring everyone has a voice in the process. The foundational work we've done this summer gives us a solid base to build from.

The improvements coming in November—async operations, better scalability, server discovery, and standardized extensions—will help MCP become a stronger backbone for production AI integrations. But we can't do it alone.

MCP's strength has always been that it's an **open protocol built by the community, for the community**. We're excited to keep building it together.

Thank you for your continued support, and we look forward to sharing more soon.
