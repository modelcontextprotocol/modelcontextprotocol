---
title: "Update on the Next MCP Protocol Release"
date: 2025-09-21T10:00:00-08:00
draft: true
tags: ["mcp", "protocol", "roadmap", "community"]
author: "David Soria Parra"
description: "An update on the timeline and priorities for the next Model Context Protocol specification version"
---

It's been a busy Summer building out MCP's governance, working groups, and registry infrastructure. With that foundation in place, we're ready to talk about what's coming in the next protocol release and where we need your help.

## Release timeline update

The next version of the Model Context Protocol specification will have a release candidate (RC) available on **November 11th, 2025**, with the final release on **November 25th, 2025**.

We're building in a 14-day RC validation window so client implementors and SDK maintainers can thoroughly test the protocol changes. This approach also gives us the focused time we need to deliver critical improvements while applying our [new governance model](https://modelcontextprotocol.io/community/governance) to the process.

## Summer progress

Over the past few months, we've been heads-down building the infrastructure and [governance foundations ](https://blog.modelcontextprotocol.io/posts/2025-07-31-governance-for-mcp/)that MCP needs to scale sustainably. While this work might not be as flashy as new protocol features, it's essential groundwork for the broader MCP ecosystem.

### Formal governance structures

We started the new season by establishing a [formal governance model for MCP](https://modelcontextprotocol.io/community/governance), including defined roles and decision-making mechanisms. We also developed the [Specification Enhancement Proposal (SEP)](https://modelcontextprotocol.io/community/sep-guidelines) process to provide clear guidelines for the community for contributing specification changes. Our goal here is to be as transparent about decision-making procedures as possible.

Like any new system that involves a fast-evolving community, our governance model is still finding its footing. We're actively learning and refining how it works as both the protocol and community continue to grow.

### Working groups

We've established [Working Groups and Interest Groups](https://modelcontextprotocol.io/community/working-interest-groups) to foster community collaboration and drive the specification forward. These groups serve multiple purposes. They provide clear entry points for new contributors, empower community members to lead initiatives in their areas of expertise, and distribute ownership across the ecosystem rather than concentrating it among core maintainers.

While the working group model is also evolving, we're working on crafting governance structures that will grant these groups greater autonomy in decision-making and implementation, helping us move even faster with protocol improvements. This distributed approach ensures the protocol can grow to meet the community needs while maintaining quality and consistency across different domains.

### Registry development

Earlier in September, we [launched the MCP Registry preview](https://blog.modelcontextprotocol.io/posts/2025-09-08-mcp-registry-preview/) - an open catalog and API for indexing and discovery of MCP servers. The MCP Registry is the single source of truth for available MCP servers, supporting both public and private sub-registries that organizations can customize for their specific needs.

Building the MCP Registry has been a true community effort, with companies and independent developers working together to build something that benefits the entire MCP ecosystem. We've also put community-driven moderation in place to keep the quality bar high.

Any MCP client can consume registry content via the native registry API or through third-party registry aggregators. It's a great tool to help customers easily discover and integrate MCP servers into their AI workflows.

## Priority areas for the next release

With governance and infrastructure foundations in place, we're ready to focus on some major protocol improvements. Our working groups have been busy identifying the areas where MCP needs to evolve, and we've narrowed it down to five key priorities for the upcoming release.

### Asynchronous Operations

Right now, MCP is built around _mostly_ synchronous operations - when you call a tool, everything stops and waits for it to finish. That works great for quick tasks, but what about operations that take minutes or hours to complete?

The Agents Working Group is tackling this by adding async support, so servers can kick off long-running tasks and clients can check back later for results. You can follow the progress in [SEP-1391](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1391).

### Statelessness and Scalability

As MCP grows, we're seeing more organizations want to deploy servers at enterprise scale, with all the requirements that stem from enterprise-ready infrastructure. Current MCP implementations often need to remember things between requests, which makes it harder to scale horizontally across multiple server instances.

We already have some stateless support through [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http), but there are still pain points around server startup and session handling.

The Transport Working Group is working on smoothing out these rough edges, making it easier to run MCP servers in production while keeping a simple upgrade path for teams who want more sophisticated stateful features.

### Server Identity

If you want to know what an MCP server can do, you have to connect to it first. That makes it really hard for clients to easily browse available servers or for systems like our registry to automatically catalog what's out there.

We're solving this by letting servers advertise themselves through [`.well-known` URLs](https://en.wikipedia.org/wiki/Well-known_URI) - an established standard for providing relevant metadata. Think of it like a server's business card that anyone can read without having to knock on the door first. This will make discovery much more intuitive for every MCP consumer.

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

- [**Inspector**](https://github.com/modelcontextprotocol/inspector) - Development and maintenance of debugging tools
- [**Registry**](https://github.com/modelcontextprotocol/registry) - Backend API and CLI development for the server registry; in particular, Go expertise would be very welcome

## Input from Client Implementors

MCP is also not just about servers, but also clients - the tools that enable customers to connect to our ecosystem. If you are implementing MCP clients, your experience and understanding of requirements are crucial for shaping the protocol's evolution. We want to hear from you on both protocol capabilities as well as processes that will enable you to scale your work as we add new features.

Client implementors are invited to join the `#client-implementors` working group channel in the [MCP Discord](https://modelcontextprotocol.io/community/communication).

## Looking ahead

These foundational pieces give us a solid base to build from, but we're just getting started. There's still plenty of work ahead, and we can't do it all ourselves - we need the community's expertise to help enhance and grow MCP.

With our new governance structures and working groups in place, we can now tackle the big protocol improvements much more efficiently while making sure everyone has a voice in the process. We strongly believe that the MCP superpower is that it's an **open protocol** built **by the community, for the community**.
