---
date: "2026-03-09T09:00:00+00:00"
publishDate: "2026-03-09T09:00:00+00:00"
title: "The 2026 MCP Roadmap"
slug: "2026-mcp-roadmap"
description: "The updated Model Context Protocol roadmap for 2026: transport scalability, agent communication, governance maturation, and enterprise readiness — plus guidance on SEP prioritization and how to get involved."
author: "David Soria Parra (Lead Maintainer)"
tags: ["mcp", "roadmap", "governance", "community"]
ShowToc: true
---

MCP's [current spec release](https://blog.modelcontextprotocol.io/posts/2025-11-25-first-mcp-anniversary/) dates to November 2025. We haven't cut a new version since — but a stable protocol version hasn't meant a project without changes. Over the past year MCP has moved well past its origins as a way to wire up local tools: it's running in production at companies large and small, powering agent workflows, and being shaped by a growing community of contributors through Working Groups, [Spec Enhancement Proposals](https://modelcontextprotocol.io/community/sep-guidelines) (SEPs), and a formal governance process. While none of that is new as of November, it's the foundation we're building on.

We spent the last few months working through a long list of candidate priorities, all informed by production experience, community feedback, and the pain points that keep surfacing. We narrowed it all down to the areas that matter most for 2026. The result is an updated [roadmap document](https://modelcontextprotocol.io/development/roadmap) that lays out where we're headed.

If you read the [January update](/posts/2026-01-22-core-maintainer-update/), you'll recognize the broad strokes — production deployments have different needs than the early experiments that got us here, and the roadmap now reflects that. Here's what changed and what it means for you.

## From Releases to Working Groups

Previous versions of the roadmap were organized around release milestones: what's shipping in the next spec version and what comes after. That framing made sense when the project was smaller and most of the work flowed through a handful of people.

With [Working and Interest Groups](https://modelcontextprotocol.io/community/working-interest-groups) now formalized as the primary vehicle for protocol development, the roadmap needed to reflect that reality. The new document is organized around **priority areas** with clear ownership, rather than around dates. Working Groups drive the timeline for their deliverables. The roadmap document tells you which problems we consider most important and who is on the hook to solve them.

This approach also lets us be more honest and transparent about uncertainty that is typical for a fast-growing project like MCP. A release-oriented roadmap implies a level of predictability that open-standards work rarely has.

## The Priority Areas

Core maintainers ranked candidate areas, and the result was a clear top four. These are the areas where SEPs will receive expedited review and where most of our maintainer capacity is concentrated.

### Transport Evolution and Scalability

This was the least surprising domain worthy of investment - an unanimous top pick. Streamable HTTP — the transport that lets MCP servers run as remote services rather than local processes — unlocked a wave of production deployments, but running it at scale has surfaced a consistent set of gaps: stateful sessions fight with load balancers, horizontal scaling requires workarounds, and there's no standard way for a registry or crawler to learn what a server does without connecting to it.

The [Transports WG](https://github.com/modelcontextprotocol/transports-wg) owns the next-generation transport and session model. The Server Card WG owns the `.well-known` metadata format for discovery. One thing we want to be explicit about: we are **not** adding more official transports this cycle. Keeping the set small is an explicit decision grounded in the [MCP design principles](https://modelcontextprotocol.io/community/design-principles) — every additional official transport multiplies the surface that clients must support and fragments the ecosystem of interoperable tooling. Custom transports that are shipped as extensions will remain the right venue for experimentation.

### Agent Communication

The Tasks primitive ([SEP-1686](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1686)) shipped as an experimental feature and works well for what it was designed to do. Some of the initially-developed use cases have given us a concrete punch list of lifecycle gaps, such as retry semantics and expiry policies, that the Agents Working Group will work on closing.

What's great about this effort is that this is the kind of iteration you can only do once something is actually deployed and battle-tested with real-world scenarios. We're excited to apply a similar approach to future MCP evolution.

### Governance Maturation

Right now, every SEP, regardless of domain, requires full [Core Maintainer](https://modelcontextprotocol.io/community/sep-guidelines) review. That is a serious bottleneck and it slows down Working Groups that have the expertise to evaluate proposals in their own area. The governance work this year is about removing that bottleneck without sacrificing quality.

[SEP-1302](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1302) and [SEP-2085](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/2085) gave the project formal structure. The next step is establishing a clear **contributor ladder** — a documented progression from community participant to core maintainer, with clear criteria at each step and a delegation model so that WGs with a track record can accept SEPs in their domain without a full review cycle. Lead and Core Maintainers still retain the strategic oversight over the project, but with increased autonomy concentrated in WGs.

### Enterprise Readiness

Enterprises are deploying MCP and running into a somewhat predictable set of problems: audit trails, SSO-integrated auth, gateway behavior, and configuration portability.

This area also happens to be the least defined of the four priorities, and that is intentional — we want the folks experiencing these challenges to help us define the necessary work.

A dedicated Enterprise WG does not yet exist; however, if you work in enterprise infrastructure and want to lead or join it, the [Working Groups page](https://modelcontextprotocol.io/community/working-interest-groups) explains how to start one. We also highly recommend participating in the [contributor Discord](https://modelcontextprotocol.io/community/communication#discord) to make sure that you're not duplicating work or going solo on new proposals.

We expect most of the enterprise readiness work to land as extensions rather than core spec changes — enterprise needs are real, but they shouldn't make the base protocol heavier for everyone else.

## SEP Prioritization: What It Means for Contributors

One of the most practically important additions to the roadmap is explicit guidance on how SEP review capacity gets allocated.

The short version is that **SEPs aligned with the priority areas outlined above will move the fastest.** SEPs outside those areas aren't automatically rejected, but they face longer review timelines and a higher bar for justification. Maintainer bandwidth is finite, and we'd rather be transparent about where it's going.

If you're considering writing a SEP, start with the [SEP Guidelines](https://modelcontextprotocol.io/community/sep-guidelines). Once you're familiar with those:

1. **Check whether your proposed change maps to one of the priority areas**. If it does not, be prepared for delays in reviews.
2. **Bring it to the relevant Working Group**. SEPs that arrive with WG backing and a clear connection to the roadmap are the ones that move.

## On the Horizon

Not everything we care deeply about made the top four, and we didn't want those areas to disappear from view - while we are very focused on a limited set of items, we still want to make sure that protocol explorations can happen at a good pace. The roadmap now includes an **On the Horizon** section for work with real community interest, such as triggers and event-driven updates, streamed and reference-based result types, deeper security and authorization work, and maturing the extensions ecosystem.

These aren't deprioritized in the sense of "We don't want them." They're areas where we'll happily support a community-formed WG and review SEPs as time permits, but where Core Maintainers aren't actively standing things up this cycle.

Some of these already have active proposals in review, such as [SEP-1932 (DPoP)](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1932) and [SEP-1933 (Workload Identity Federation)](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1933). Others, like triggers and event-driven updates, are areas where we would welcome the creation of a brand-new Working Group.

## Get Involved

Every deliverable on the roadmap runs through a Working Group, and every Working Group is open to contributors. There are a few ways in which you can contribute to our project:

- **Join a Working Group**: Working Groups are the small teams doing the actual protocol design. They meet regularly and welcome new participants. The [Working Groups & Interest Groups](https://modelcontextprotocol.io/community/working-interest-groups) page lists what's active and how to connect.
- **Propose a SEP**: SEPs are how changes to the protocol get proposed and reviewed. The [SEP guidelines](https://modelcontextprotocol.io/community/sep-guidelines) walk through the process.
- **Start an extension**: Extensions let us experiment with new capabilities outside the core spec. You can learn more in our [official Extensions documentation](https://modelcontextprotocol.io/extensions/overview).

If you're not sure where to start, the easiest first step is to join a Working Group meeting and introduce yourself.

We're excited to build the protocol together!
