---
date: "2025-12-19T09:00:00+00:01"
publishDate: "2025-12-19T09:00:00+00:00"
title: "Exploring the Future of MCP Transports"
author: "Kurtis Van Gent (Transport WG Maintainer), Shaun Smith (Transport WG Maintainer)"
tags: ["mcp", "governance", "transports"]
ShowToc: true
---

When MCP first launched in November of 2024, quite a few of its users relied on local environments, connecting clients to servers over [STDIO](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#stdio). As MCP became the go-to standard for LLM integrations, community needs evolved, leading to the build-out of infrastructure around remote servers. There's now growing demand for distributed deployments that can operate at scale.

The [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http) transport was a significant step forward, enabling remote MCP deployments and unlocking new use cases. However, as enterprise deployments scale to millions of daily requests, early adopters have encountered practical challenges that make it difficult to leverage existing infrastructure patterns. The friction of stateful connections has become a bottleneck for managed services and load balancing.

Some of these challenges include:

- **Infrastructure Complexity:** Load balancers and API gateways must parse full JSON-RPC payloads to route traffic, rather than using standard HTTP patterns.
- **Scaling Friction:** Stateful connections force "sticky" routing that pins traffic to specific servers, preventing effective auto-scaling.
- **High Barrier for Simple Tools:** Developers building simple, ephemeral tools are often required to manage complex backend storage to support basic multi-turn interactions.
- **Ambiguous Session Scope:** There is no predictable mechanism for defining where a conversation context starts and ends across distributed systems.

## Roadmap

Over the past few months, the Transport Working Group has worked together with the community and MCP Core Maintainers to develop solutions to these challenges.

In this post we share the roadmap for evolving the Streamable HTTP transport and invite community feedback to help shape the future of MCP transports.

### A Stateless Protocol

MCP was originally designed as a stateful protocol. Clients and servers maintain mutual awareness through a persistent, bidirectional channel that begins with a handshake to exchange capabilities and protocol version information. Because this state remains fixed throughout the connection, scaling requires techniques like sticky sessions or distributed session storage.

We envision a future where agentic applications are stateful, but the protocol itself doesn't need to be. A stateless protocol enables scale, while still providing features to support stateful application sessions when needed.

We are exploring ways to make MCP stateless by:

- Replacing the [`initialize` handshake](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#initialization) and sending the shared information with each request and response instead.
- Providing a `discovery` mechanism for clients to query server capabilities if they need the information early, for scenarios such as UI hydration.

These changes enable a more dynamic model where clients can optimistically attempt operations and receive clear error messages if a capability is unsupported.

> **NOTE:** Many SDKs already offer a _`stateless`_ option in their server transport configuration, though the behavior varies across implementations. As part of this roadmap, we'll be working to standardize what "stateless" means across all official SDKs to ensure consistent behavior.

### Elevating Sessions

Currently, sessions are a side effect of the transport connection. With STDIO, sessions are implicit in the process lifecycle; with Streamable HTTP, sessions are created when a server assigns an `Mcp-Session-Id` during initialization. This can lead to confusion between transport and application layer concerns.

We are looking at moving sessions to the _data model layer_, making them explicit rather than implicit.

This would allow MCP applications to handle sessions as part of their domain logic. We're exploring several approaches, with a cookie-like mechanism being one potential candidate to decouple session state from the transport layer.

This direction mirrors standard HTTP, where the protocol itself is stateless while applications build stateful semantics using cookies, tokens, and similar mechanisms. The exact approach to session creation is still being designed, with the goal of removing existing ambiguities around what a session means in remote MCP scenarios.

### Elicitations and Sampling

Two MCP features are central to a few of the modern AI workflows: [Elicitations](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation), which request human input, and [Sampling](https://modelcontextprotocol.io/specification/2025-11-25/client/sampling), which enable agentic LLM interactions.

Supporting these features at scale requires rethinking the bidirectional communication pattern they rely on. Currently, when a server needs more information to complete a tool call, it suspends execution and waits for a client response, requiring it to track all outstanding requests.

To address this, we're looking at designing server requests and responses to work similarly to chat APIs. The server returns the elicitation request as usual, and the client returns both the request _and_ response together. This allows the server to reconstruct the necessary state purely from the returned message, avoiding long-running state management between nodes and potentially eliminating the need for back-end storage entirely.

### Update Notifications and Subscriptions

MCP is dynamic by design - [tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools), [prompts](https://modelcontextprotocol.io/specification/2025-11-25/server/prompts), and [resources](https://modelcontextprotocol.io/specification/2025-11-25/server/resources) can change during operation. Today, servers send `ListChangedNotification` messages to clients as a hint to invalidate their caches.

We're exploring replacing the general-purpose `GET` stream with explicit subscription streams. Clients would open dedicated streams for specific items they want to monitor, with support for multiple concurrent subscriptions. If a stream is interrupted, the client simply restarts it with no complex resumption logic.

To make notifications truly optional - an optimization rather than a requirement - we're considering adding Time-To-Live (TTL) values and version identifiers (such as [ETags](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/ETag)) to data. This would let clients make intelligent caching decisions independently of the notification stream, significantly improving reliability.

### JSON-RPC Envelopes

MCP uses JSON-RPC for all message envelopes, including method names and parameters. As we optimize for HTTP deployments, a common question is whether routing information should be more accessible to the underlying MCP server infrastructure.

While we're keeping JSON-RPC as the message format, we're exploring ways to expose routing-critical information (such as the RPC method or tool name) via standard HTTP paths or headers. This would allow load balancers and API gateways to route traffic without parsing JSON bodies.

### Server Cards

Today, clients must complete a full initialization handshake just to learn basic information about an MCP server, like its capabilities or available tools. This creates friction for discovery, integration, and optimization scenarios.

We're exploring the direction of introducing [MCP Server Cards](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1649): structured metadata documents that servers expose through a standardized `/.well-known/mcp.json` endpoint. Server Cards enable clients to discover server capabilities, authentication requirements, and available primitives _before_ establishing a connection. This unlocks use cases like autoconfiguration, automated discovery, static security validation, and reduced latency for UI hydration — all without requiring the full initialization sequence.

### Official and Custom Transports

To ensure a minimum compatibility baseline across the ecosystem, MCP will continue to support only two official transports: STDIO for local deployments and Streamable HTTP for remote deployments. This keeps the core ecosystem unified, where every MCP client and server can interoperate out of the box.

We also recognize that transport and protocol changes can be disruptive. Backwards compatibility is a priority, and we'll only introduce breaking changes when strictly necessary for critical use cases.

For teams with specialized requirements, the MCP Specification supports [Custom Transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#custom-transports), giving developers the flexibility to build alternatives that fit their needs. Our focus is on making Custom Transports easier to implement by improving SDK integration—so the community can experiment freely without fragmenting the standard.

## Summary

These changes reorient MCP around stateless, independent requests - without sacrificing the rich features that make it powerful. Server developers get simpler horizontal scaling with no sticky sessions or distributed stores. Clients get a more predictable architecture.

For most SDK users, both on the client and server sides, the impact will be minimal - we're focused on reducing breaking changes to the absolute minimum. The shift we're outlining is architectural: simpler deployments, serverless viability for advanced MCP features, and better alignment with modern infrastructure patterns.

## Next Steps

Work is already underway. Our goal is to finalize the required [Spec Enhancement Proposals](https://modelcontextprotocol.io/community/sep-guidelines) (SEPs) in the first quarter of 2026 for inclusion in the next specification release, which is tentatively slated for June of 2026. With these changes, MCP can easily scale while keeping the ergonomics that made it successful.

We want your input. Join us in the [MCP Contributors Discord server](https://modelcontextprotocol.io/community/communication#discord), or engage directly with transport-related SEPs in the [Model Context Protocol repository](https://github.com/modelcontextprotocol/modelcontextprotocol/pulls).

This roadmap is shaped by real-world feedback from developers and companies building with MCP. We're excited to collaborate with the MCP community to continuously improve the protocol and its capabilities!
