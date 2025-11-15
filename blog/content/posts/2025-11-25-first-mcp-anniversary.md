---
date: "2025-11-25T00:00:00+00:00"
publishDate: "2025-11-13T00:00:00+00:00"
draft: true
title: "One Year of MCP: November 2025 Spec Release"
author: "David Soria Parra (Lead Maintainer)"
tags: ["mcp", "spec", "release", "protocol", "anniversary"]
---

Today, MCP turns **one year old**. You can check out the [original announcement blog post](https://www.anthropic.com/news/model-context-protocol) if you don't believe me. It's hard to imagine that a little open-source experiment, a **protocol to provide context to models**, became the de-facto standard for this very scenario.

But not only do we hit the first anniversary milestone today - we're also releasing a brand-new specification version. Before we get to the details of what's new, I wanted to do a bit of a retrospective.

## A Year In

With all the changes that we've made in the past year, it feels like a decade flew by. The protocol has grown leaps and bounds since its inception and has been adopted by a _huge_ number of developers and organizations. We went from a little open source experiment to becoming _the_ standard for connecting data and applications to Large Language Models (LLMs).

But adoption can only grow as long as there are MCP servers to actually use, and clients which are capable of communicating with them. Within the same timeframe, we saw the number of active MCP servers go from just a few experimental ones to _thousands_. If you think about a scenario, it's likely there's an MCP server for it.

Here are just a few of many (very many) MCP servers that you can try:

- Notion [built an MCP server](https://github.com/makenotion/notion-mcp-server) to help you manage your notes.
- Stripe has a [pretty extensive MCP server](https://docs.stripe.com/mcp#tools) to manage all kinds of payment workflows.
- GitHub [built their own MCP server](https://github.com/github/github-mcp-server) to help developers automate their engineering processes.
- Hugging Face [created an MCP server](https://github.com/huggingface/hf-mcp-server) to make model management and dataset search a breeze.
- Postman [built their MCP server](https://github.com/postmanlabs/postman-mcp-server) to help automate API testing workflows.

And there's so much more to discover in the MCP ecosystem! That's why we also launched the [MCP Registry](https://blog.modelcontextprotocol.io/posts/2025-09-08-mcp-registry-preview/) earlier this year. It's the central index for all available MCP servers that now has close to two thousand entries since its announcement in September. That's a 407% growth from the initial batch of servers we onboarded that same month.

The ecosystem is growing, adoption is growing, but what's underpinning all of this?

### Community & Governance

MCP's growth was never a one‑company effort. Students, hobbyists, startup engineers, and enterprise architects all shaped the protocol - submitting SEPs, shipping SDKs in new languages, and stress‑testing some of the early assumptions we had about MCP in production. MCP went from an experiment to a standard that is used to connect LLMs to both APIs as well as applications (yes, there’s even a [Blender MCP server](https://github.com/ahujasid/blender-mcp)). That kind of organic adoption isn't something you can just come up with, no matter how ambitious your aspirations are with an open source project.

![David Soria Parra presenting on MCP in May of 2025](/posts/images/first-mcp-anniversary/david-mcp-may.webp)

It's all about the **MCP community**. Our community rallied around the protocol, organizing events like [MCP Dev Summit](https://mcpdevsummit.ai/), [MCP Night](https://workos.com/mcp-night), [MCP Dev Days](https://developer.microsoft.com/en-us/reactor/series/S-1563/), and showing up at marquee events like [AI Engineer World's Fair](https://wf2025.ai.engineer/worldsfair/2025) to share what they learned and built.

We also have a large contributor community on [Discord](https://modelcontextprotocol.io/community/communication) and on [GitHub](https://github.com/modelcontextprotocol/modelcontextprotocol), helping us debug issues, propose changes, and assist each other in shipping great MCP experiences. That kind of daily collaboration got us further than any single individual or company ever could.

I'd even go as far as say that the success of MCP in the past year is entirely thanks to the broad community we managed to nurture around the project - from transports, to security, SDKs, documentation, samples, and developer tooling, it was all largely evolved by and for the community.

![Kent C. Dodds talking about his vision for MCP at MCP Dev Summit](/posts/images/first-mcp-anniversary/kent-jarvis-mcp.webp)

To keep this sustainable, we put a [governance structure](https://blog.modelcontextprotocol.io/posts/2025-07-31-governance-for-mcp/) in place. Through it, community leaders and Anthropic maintainers are working together to figure out what needs fixing and how to get it the right changes into the spec. Our maintainer team aren't gatekeepers; they help surface problems, align on solutions, and turn rough ideas into actual protocol updates.

![MCP maintainers collaborating during a writing session in New York City](/posts/images/first-mcp-anniversary/maintainers-write.webp)

Our approach to governance, while still evolving, proved itself to be extremely valuable. We've been able to move faster on critical improvements without breaking existing implementations, and potential contributors now know how to jump in through formal Working and Interest Groups ([SEP-1302](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1302/) set the stage for this).

![Group photo from an MCP maintainers meetup](/posts/images/first-mcp-anniversary/maintainers-meetup.webp)

There's still work ahead for us to make this even better - process transparency, decision timelines, broader language coverage. I am _incredibly thankful_ for everyone who's been part of this and helped us navigate so many changes in such a short time span.

## The November 2025 Release

The latest release of the MCP specification ships with a number of highly-anticipated features that came directly from our community deploying and using MCP for production scenarios. People told us what wasn't working, what was missing, and what papercuts prevented them from being able to use MCP. We listened and worked together with our community experts to deliver a number of enhancements that help make MCP even more scalable and reliable.

### Tasks: Long-Running Operations Made Simple

**SEP:** [1686](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1686)

One of the top requests we heard over and over was around asynchronous data processing. For questions like "_How do I handle operations that take more than a few seconds?_" the answer used to be "_Well, you kind of don't._" That wasn't a good answer.

The new approach for asynchronous operations through **tasks** fixes this. You can now start an operation, go do other things, and come back later to check if it's done. Revolutionary? No. Necessary? Absolutely.

Some noteworthy capabilities that this enables:

- **Asynchronous execution**: Start operations and retrieve results later without blocking
- **Active polling**: Clients can check the status of ongoing work at any time
- **Flexible lifecycle management**: Support for submitted, working, completed, failed, and cancelled states
- **Task isolation**: Proper security boundaries with session-based access control

From the multitude of MCP servers that we've seen out there, this is particularly helpful for scenarios such as the ones below.

- Healthcare & life sciences data analysis that processes hundreds of thousands of data points
- Enterprise automation platforms with complex multi-step workflows
- Code migration tools that run for minutes or hours
- Test execution platforms that need to stream logs from long-running suites
- Deep research tools that spawn multiple agents internally
- Multi-agent systems where agents can work concurrently

Tasks are launching as an **experimental capability**, meaning that it's part of the core protocol but it's not yet finalized. Asynchronous execution is a tough problem to solve at scale, so we want to give some time to the specification to be battle-tested in real-world scenarios. We'll work closely with the community, SDK developers, as well as client and server implementers to get this right.

### URL Mode Elicitation: Secure Out-of-Band Interactions

**SEP:** [1036](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1036)

Asking users for their API keys, tokens, or any other credentials directly through the MCP client might seem like quite a scary proposition. This is especially critical when you need to connect an MCP server to an array of _other_ APIs, where the traditional client-to-server authorization flow doesn't quite work. Until now, there wasn't a good alternative - you either had to rely on the client _somehow_ getting those credential securely and passing them to the server, or implement a bunch of custom authorization logic to be used from the start.

**URL mode elicitation** lets you send users to a proper OAuth flow (or any credential acquisition flow, for that matter) in their browser, where they can authenticate securely without your client ever seeing the entered credentials. The credentials are then directly managed by the server and the client only needs to worry about its own authorization flow to the server.

I am excited about adding this in addition to capabilities that we already have, like elicitation, because it allows the protocol to be used for a few scenarios that were quite hard to get right, such as:

- **Secure credential collection**: API keys and passwords never transit through the MCP client
- **External OAuth flows**: MCP servers have a path to obtain third-party authorization without token passthrough
- **Payment processing**: PCI-compliant financial transactions with secure browser contexts can now be done outside the client

All the server does is send a URL that the client will provide an affordance for. When the user completes the flow in their browser, they will effectively pass the data _directly_ to the server without any extra middlemen or manual steps. Simple!

### Sampling with Tools: Agentic Servers

**SEP:** [1577](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1577)

This functionality allows MCP servers to run their own agentic loops using the client's tokens (still under the user's control, of course), and reduces the complexity of client implementations, context support becoming explicitly optional. This came from the fact that [sampling](https://modelcontextprotocol.io/specification/2025-06-18/client/sampling) doesn't support tool calling, although it's a cornerstone of modern agentic behaviour. With the new spec release, this is no longer a gap!

Now that sampling with tools is available, this also means that all of the scenarios below are possible!

- **Tool calling in sampling requests**: Servers can now include tool definitions and specify tool choice behavior
- **Server-side agent loops**: Servers can implement sophisticated multi-step reasoning
- **Parallel tool calls**: Support for concurrent tool execution
- **Better context control**: The ambiguous `includeContext` parameter is being soft-deprecated in favor of explicit capability declarations

As an example, a research server can spawn multiple agents internally, coordinate their work, and deliver a coherent result while using nothing other than standard MCP primitives without custom scaffolding or complex orchestration code.

### Security and Enterprise Features

As the protocol matures, we also can't ignore the myriad of security and authentication/authorization needs. MCP is not just a hobby protocol - we've seen it adopted in some of the most mission-critical workloads. This translates into a direct need to ensure that all data is protected and access is properly managed.

Working with security and authentication experts from across the community, we've developed a number of enhancements shipping with this release:

- **[SEP-991](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1296)**: URL-based client registration using OAuth Client ID Metadata Documents (you might've already seen our [blog post on this change from earlier this year](https://blog.modelcontextprotocol.io/posts/client_registration/))
- **[SEP-1046](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1046)**: OAuth client credentials flow support for machine-to-machine authorization
- **[SEP-990](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/990)**: Enterprise IdP policy controls for MCP OAuth flows
- **[SEP-1024](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1024)**: Client security requirements for local server installation
- **[SEP-835](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/835)**: Default scopes definition in authorization specification

To learn more about other upcoming auth and security improvements you can follow the [`auth`](https://github.com/modelcontextprotocol/modelcontextprotocol/issues?q=is%3Aissue%20state%3Aopen%20label%3Aauth) and [`security`](https://github.com/modelcontextprotocol/modelcontextprotocol/issues?q=is%3Aissue%20state%3Aopen%20label%3Asecurity) tags in the specification repository.

### Developer Experience Improvements

One of the core tenets of MCP is _simplicity_ - we want to make the developer and integration experience as intuitive and easy as possible. To help achieve this, the latest spec release also adds a few minor changes that help make the protocol easier to use for developers.

- **[SEP-986](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/986)**: Standardized format for tool names
- **[SEP-1319](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1319)**: Decoupled request payload from RPC methods definition
- **[SEP-1699](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1699)**: SSE polling via server-side disconnect for better connection management
- **[SEP-1309](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1309)**: Improved specification version management for SDKs

## Looking Forward

This release is backward compatible. Your existing implementations keep working. The new features are there when you need them.

Looking ahead, we're excited about what's coming next for MCP. The protocol is entering a new phase, one where it's not just about connecting LLMs to data, but about enabling entirely new categories of AI-powered applications.

We're seeing early signals of this transformation already. Developers are building multi-agent systems that coordinate across dozens of MCP servers. Enterprise teams are deploying MCP at scale with sophisticated security and governance controls. Startups are launching products where MCP is the core architectural pattern.  MCP servers are even being transformed into executable code, to create sandboxed agent workflows.

The roadmap ahead includes deeper work on reliability and observability, making it easier to debug and monitor complex MCP deployments. We're exploring better patterns for server composition, allowing you to build sophisticated capabilities by combining simpler building blocks. And we're continuing to refine the security model to meet the needs of the most demanding enterprise environments.

What excites me most isn't what _we're_ planning to build but what _our community_ is going to build. Every week we see MCP servers designed, developed, and deployed in novel ways. Every conversation in Discord reveals new use cases and patterns. The protocol has become a canvas for AI innovation, and we can't fill it alone.

The next year of MCP will be shaped by more production deployments, more real-world feedback, amplified by the creativity of thousands of developers worldwide. We're here to support that growth, to ensure the protocol evolves thoughtfully, and to keep MCP stable, secure, and simple as it scales.

## Get Started

To get started with all the new goodness in the latest MCP specification release, check out the following resources:

- **Read the changelog**: All major changes are captured in our [Key Changes document](https://modelcontextprotocol.io/specification/draft/changelog)
- **Get to know our docs**: The [MCP documentation](https://modelcontextprotocol.io/docs/getting-started/intro) is the source of truth for the all the inner workings of the protocol
- **Join the discussion**: If you would like to contribute or engage with other MCP maintainers, start with our [GitHub repo](https://github.com/modelcontextprotocol/modelcontextprotocol) and [Discord](https://modelcontextprotocol.io/community/communication#discord)
