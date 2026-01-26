---
date: "2026-01-23T00:00:00+00:00"
publishDate: "2026-01-23T00:00:00+00:00"
title: "January MCP Core Maintainer Update"
author: "David Soria Parra (Lead Maintainer)"
tags: ["mcp", "update", "maintainers"]
ShowToc: true
---

A lot has happened since we first released MCP. We wrapped up 2025 with a [major spec update](/posts/2025-11-25-first-mcp-anniversary/) and the momentum hasn't slowed down. None of it would have happened without the community: every PR, every issue filed, every server and client built. That energy is what keeps MCP moving forward.

To keep that momentum going, the [Core Maintainer](https://modelcontextprotocol.io/community/governance#current-core-maintainers) team is evolving as well.

## Departing Core Maintainers

First, some news. **Inna Harper** and **Basil Hosmer** will be stepping away from the Core Maintainer team to focus on other projects.

Inna and Basil have been with MCP since its early days. They helped shape the protocol during some of its most critical moments, from key design decisions to designing and delivering our official SDKs as well as helping ship all major spec releases. Their fingerprints are all over what MCP is today.

Thank you both for your contributions and your dedication to the project. MCP is better because of you.

## Welcoming New Maintainers

We're thrilled to welcome three new Core Maintainers to the team. They've already been active in MCP discussions, reviewing [Spec Enhancement Proposals](https://modelcontextprotocol.io/community/sep-guidelines) (SEPs), and helping shape the direction of the protocol.

### Peter Alexander

![Peter Alexander](/posts/images/core-maintainer-update/peter_cm.png)

**Peter Alexander** is a Member of Technical Staff at Anthropic on the Model Context Protocol team.

Prior to Anthropic, Peter was a Senior Staff Software Engineer at Meta working in a variety of areas across product and infrastructure including virtual reality, video conferencing, and large-scale real-time publish/subscribe data infrastructure. He also spent some time in the gaming industry at Codemasters working on their Grid and DiRT series of games on console and PC as gameplay lead.

Peter has authored several SEPs including the [Extensions framework](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2133) and [Resource Contents Metadata](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2093), and has been an active reviewer and contributor to our SDKs, proposals around governance, roadmap, and specification changes.

### Caitie McCaffrey

![Caitie McCaffrey](/posts/images/core-maintainer-update/caitie_cm.png)

**Caitie McCaffrey** is a Software Engineer and Tech Lead at Microsoft. Caitie has built large-scale distributed systems and services across multiple domains, including AI platforms, gaming, social media, and IoT.

Previously, Caitie served as Technical Advisor to Microsoft's CEO Satya Nadella and CTO Kevin Scott, driving strategic efforts in AI transformation, developer experience & security. Earlier in her career, Caitie was Tech Lead for the Observability team at Twitter, and worked in the gaming industry at Microsoft Game Studios and 343 Industries, contributing to titles such as Halo 4, Halo 5, and Gears of War 2 & 3. She holds a Computer Science degree from Cornell University.

Caitie has been reviewing and helping us craft our governance and transport proposals, bringing her distributed systems expertise to protocol design discussions.

### Kurtis Van Gent

![Kurtis Van Gent](/posts/images/core-maintainer-update/kurtis_cm.png)

**Kurtis Van Gent** is a Senior Staff Software Engineer leading AI Ecosystems at Google Cloud Databases. He drives ecosystems and integrations across the portfolio, leading efforts like MCP for Data Cloud and MCP Toolbox for Databases.

Kurtis has been driving the [Transport Working Group](https://github.com/modelcontextprotocol/transports-wg), which authored the accepted [request payload decoupling](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1319) SEP and is leading the [stateless protocol](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1442) proposal. His focus on scalability and fault tolerance has shaped key discussions around how MCP evolves.

Welcome to the team, Peter, Caitie, and Kurtis.

## Looking Ahead

If there is one thing I can guarantee it's that 2026 will be a busy year for MCP. There are multiple active SEPs working through the process right now, including ones like the [DPoP extension](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1932) for authentication, [multi-turn SSE](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1858) for transport, and [Server Cards](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127) for discovery. This is just a sneak peek of the _many_ improvements we're currently iterating on. The ecosystem keeps expanding, with more clients, servers, and SDK releases shipping every week.

MCP as a protocol has also matured. What started as an open-source experiment is now running in production at companies of all sizes. That changes what we need to focus on. With this team in place, we're working on the pieces of the puzzle that matter for the next phase of MCP growth: hardening the spec for enterprise scenarios, improving security and authentication patterns, providing better SDK implementation guidance, and making sure MCP can scale to meet the demands of organizations deploying it in critical systems. At the same time, we're keeping the contributor experience welcoming and the protocol responsive to what developers actually need.

If you want to be part of it, check out our [governance docs](https://modelcontextprotocol.io/community/governance) or see how to [get started with MCP contributions](https://modelcontextprotocol.io/community/communication). Come build with us.
