---
title: "The New MCP Roadmap"
date: "2026-08-22T09:00:00+00:00"
publishDate: "2026-08-22T09:00:00+00:00"
slug: mcp-roadmap
description: "An update on the Model Context Protocol roadmap and focus areas for upcoming specification releases."
author:
  - David Soria Parra (Lead Maintainer)
  - Den Delimarsky (Lead Maintainer)
tags:
  - mcp
  - roadmap
  - community
  - governance
  - working-groups
ShowToc: true
---

Today we're excited to publish an updated [roadmap](https://modelcontextprotocol.io/development/roadmap) for the Model Context Protocol (MCP), covering the next specification release and beyond.

It sets the direction for protocol work over the coming months and was developed by the Core Maintainers together with our community of maintainers and Working Groups.

{{< button text="Explore the roadmap" url="https://modelcontextprotocol.io/development/roadmap" target="_self" >}}

## Priority areas

The roadmap is organized into five priority areas. Several of them pick up work that the [previous roadmap](/posts/2026-mcp-roadmap/) listed as on the horizon, including server-initiated events, result type improvements, and agent identity, which have since matured enough to become priorities in their own right. Each area has a set of Core Maintainers responsible for it and one or more Working Groups.

![MCP Roadmap: five priority areas, agentic messaging primitives, HTTP-native transport unification and hardening, agent identity and enterprise-ready security, improved primitives, and improved SDK developer experience.](/posts/images/roadmap/priority-areas.svg)

### Agentic messaging primitives

Modern agentic workloads no longer fit the standard [request-and-response pattern](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns). Loops can run for longer, servers can push streamed results, and there is a clear need to steer work mid-flight. MCP has been growing to meet these requirements, introducing [Tasks](https://modelcontextprotocol.io/extensions/tasks/overview), [`subscriptions/listen`](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/subscriptions), and [progress notifications](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/progress). We want to make sure that we not only offer the right primitives for the job, but also that they work well together. The work here spans server-initiated events (webhooks and channels, so clients aren't left polling for results), a composition review across the [Agents](https://modelcontextprotocol.io/community/working-groups/agents), Transports, and [Triggers & Events](https://modelcontextprotocol.io/community/working-groups/triggers-events) Working Groups, and maturing the Tasks extension ([SEP-2663](https://modelcontextprotocol.io/seps/2663-tasks-extension)) so it can move into the specification.

### HTTP-native transport unification and hardening

With the [2026-07-28 release](https://modelcontextprotocol.io/specification/2026-07-28/changelog), a remote MCP server is now no different from any other HTTP workload, making it easy to host and operate one on any infrastructure that developers and organizations already use for their APIs and services. This approach has proven to scale, and we want to stretch it to cover other deployment modes as well, including local servers speaking [Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http) over [stdio](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio). Unifying on one transport lets us simplify MCP server and client development even further.

### Agent identity and enterprise-ready security

[MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) today is built around a person approving access in a browser. That works well for interactive clients, but more and more of the callers are agents running as cloud workloads with their own identity, acting on behalf of a user who isn't present, or delegating narrower authority to sub-agents. We want MCP servers to have a standardized way to recognize and trust those agent identities, built on existing standards rather than pasted API keys and long-lived tokens.

The work here covers finalizing [Demonstrating Proof of Possession](https://www.rfc-editor.org/rfc/rfc9449) (DPoP) and driving its adoption, and defining an opinionated path for agent identity and delegation through [Workload Identity Federation](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1933), the ID-JAG grant behind [Enterprise-Managed Authorization](https://modelcontextprotocol.io/extensions/auth/enterprise-managed-authorization), and standard token exchange. We will also continue to grow our engagement with the OAuth standards bodies, including the IETF OAuth and [WIMSE](https://datatracker.ietf.org/wg/wimse/about/) working groups, to help the underlying standards evolve with the building blocks that agent identity needs.

### Improved primitives

Tool calling is the part of MCP most developers touch first, and it has held up well over the lifetime of the protocol. Where it falls a bit short, however, is in the result handling. A [`tools/call`](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#tool-result) response can carry the same output in more than one form, and a server developer today has no way to know which form a given client will put in front of the model. We aim to make this easier by standardizing on one clear contract.

The other challenge we need to address for primitives is their ever-growing scale. Connecting to a server with a hundred tools means the model pays for that entire surface before the user has asked a single question, and tool selection tends to get worse as the list grows. We're starting a progressive discovery effort so a server can offer a small entry point and reveal more of its catalog as the conversation narrows.

### Improved SDK developer experience

Our SDKs are how developers experience MCP. We are investing in their ergonomics and their [conformance with the specification](https://modelcontextprotocol.io/community/sdk-tiers#conformance-testing), and in making them intuitive and well-documented across every platform and language we support. This is even more important now that many developers build MCP clients and servers by pointing an agent at our libraries, where clear APIs and accurate docs decide whether the code will work with minimal friction.

## Proposal prioritization

[Specification Enhancement Proposals](https://modelcontextprotocol.io/community/sep-guidelines) (SEPs) that fall within these priority areas get expedited review and have the best chance of acceptance. Proposals outside them aren't rejected automatically, but maintainer review time is scarce and goes to these areas first.

If you're considering a SEP, identify the priority area it belongs to, raise it with the relevant [Working Group](https://modelcontextprotocol.io/community/working-interest-groups), and work with its members to shape your proposal. Each area on the [roadmap](https://modelcontextprotocol.io/development/roadmap) names the Core Maintainers responsible for it, and anyone interested in contributing can reach them on [Discord](https://modelcontextprotocol.io/community/communication#discord). We're excited to work with the community to review and build on the proposals that support this roadmap.

## Get involved

Every priority area above has a Working Group behind it or forming around it, and all of them have room for more contributors. There are several ways to participate:

- **Join a Working Group or Interest Group**: see the [Working and Interest Groups](https://modelcontextprotocol.io/community/working-interest-groups) page and the [community channels](https://modelcontextprotocol.io/community/communication).
- **Propose or comment on a SEP**: read the [SEP guidelines](https://modelcontextprotocol.io/community/sep-guidelines), then open one or weigh in.
- **Start an experimental extension**: [SEP-2133](https://modelcontextprotocol.io/seps/2133-extensions) lets any WG or IG experiment in an `experimental-ext-` repository before a formal SEP.
- **Contribute directly**: the [contributing guide](https://modelcontextprotocol.io/community/contributing) covers the specification, SDKs, and tooling.

We look forward to growing and evolving MCP together!
