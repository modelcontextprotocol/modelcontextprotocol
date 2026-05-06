---
title: Understanding MCP Extensions
date: "2026-03-11T00:00:00Z"
description: "A practical guide to MCP extensions: how they layer new capabilities on top of the core protocol, and patterns the community is already using."
author:
  - MCP Community Maintainers
tags:
  - announcement
  - community
---

You've built an MCP server that works quite well, but now you're wondering: _How do I add richer UI elements? Custom auth flows? What about domain-specific conventions, like those for finance or healthcare?_

This is where _extensions_ come in. They let developers layer new capabilities on top of the baseline MCP implementation without touching the core protocol. This allows us to keep things stable while also opening up room to experiment, learn, and build with the community's needs in mind.

In this post, we'll walk through how extensions fit into the MCP ecosystem and share some patterns the community is already exploring. Think of this less as a formal specification change and more as a short practical guide to extending MCP.

## How MCP is structured

It helps to think of MCP in three layers:

- **MCP core specification:** [The protocol itself](https://modelcontextprotocol.io/specification/latest). This is how clients and servers talk to each other. It also represents the absolute minimum bar for client and server interoperability.
- **MCP projects:** Supporting infrastructure like the [Registry](https://registry.modelcontextprotocol.io/), that helps developers discover MCP servers, or [Inspector](https://modelcontextprotocol.io/docs/tools/inspector), that makes MCP server testing and debugging easier.
- **MCP extensions:** Optional patterns that developers can adopt for specialized use cases, built on top of the MCP core specification.

Extensions let the ecosystem grow and give us an avenue to test changes and emerging spec components without destabilizing the core protocol that lots of production clients and servers already depend on.

The [Extensions documentation](https://modelcontextprotocol.io/extensions/overview) covers the full details — including extension identifiers, capability negotiation during the initialization handshake, and the SEP (Specification Enhancement Proposal) process for proposing new ones.

Here's where it gets interesting. Extensions are **patterns built on existing MCP mechanisms**, and they're strictly additive: a client or server that doesn't recognize an extension simply skips it during negotiation, and the baseline protocol keeps working. Nothing breaks when one side hasn't opted in.

In practice, a few of these patterns have already emerged — some now formalized as official extensions, others still exploratory:

- **UI extensions:** Imagine a server that returns not just data, but an interactive interface for working with it — a chart you can filter, a form you can submit, a dashboard you can drill into. That's what [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview) enables. It's the first official MCP extension and [went GA in January 2026](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/), with support already live in ChatGPT, Claude, VS Code, Goose, and [more](https://modelcontextprotocol.io/extensions/client-matrix).
- **Authorization extensions:** Need machine-to-machine auth without a user in the loop, or centralized enterprise IdP control? The [auth extensions](https://modelcontextprotocol.io/extensions/auth/overview) layer these on top of MCP's core OAuth framework — OAuth Client Credentials and Enterprise-Managed Authorization are both live today.
- **Domain-specific extensions:** Community groups are already exploring conventions for verticals like financial services, where developers might want standardized ways to handle compliance metadata.

Another important side-effect to this approach is that MCP client and server developers get richer functionality without having to wait for protocol changes, which might need more extensive validation before being merged into the core.

Extensions are also _the way_ to validate future protocol changes - if a particular implementation gains traction, that signals that there is a growing community need in protocol functionality that could become a part of the specification.

### How extensions are governed

Extensions are community-driven, and **all of them are optional**. Developers adopt what makes sense for their use case.

At the same time, we encourage implementing official and recommended extensions when possible. It helps the whole ecosystem work better together. Official extensions typically start as conversations between MCP contributors, both on the core team and in the broader community, before graduating to the [Model Context Protocol GitHub organization](https://github.com/modelcontextprotocol) where they're maintained collaboratively, following the [Extensions Track SEP process](https://modelcontextprotocol.io/seps/2133-extensions).

Beyond officially-supported extensions, community members and working groups are also free to define their own extensions for any custom needs.

### A note on proprietary integrations

Some MCP clients ship their own proprietary features, like custom UI systems, that happen to use MCP under the hood. These are **not necessarily** considered MCP extensions. They integrate with MCP servers but they don't define how MCP itself behaves at the protocol level. We will work with client and server implementers to help them adopt extensions as the de-facto way to implement custom behaviors.

## Get started

If you're building on MCP and want to explore extensions:

- **Read the docs:** The [Extensions overview](https://modelcontextprotocol.io/extensions/overview) covers identifiers, negotiation, governance, and the full list of official extensions.
- **Build an MCP App:** Follow the [MCP Apps quickstart](https://modelcontextprotocol.io/extensions/apps/build) to ship an interactive UI that works across supporting clients today.
- **Check client support:** See the [Extension Support Matrix](https://modelcontextprotocol.io/extensions/client-matrix) for which clients already implement which extensions.
- **Propose your own:** If you have an idea for a new extension, the [SEP guidelines](https://modelcontextprotocol.io/community/sep-guidelines) walk you through opening an Extensions Track SEP.

## Thank you

This post wouldn't exist without the [MCP community](https://modelcontextprotocol.io/community/communication). The ideas here grew out of countless conversations - working group calls, GitHub threads, extension proposals, and plenty of back-and-forth in [Discord](https://modelcontextprotocol.io/community/communication#discord).

To everyone who's contributed ideas, challenged our initial assumptions, and helped shape where this is all going: thank you.

We'll keep sharing updates here on the blog and in the [public repos](https://github.com/modelcontextprotocol). See you there.
