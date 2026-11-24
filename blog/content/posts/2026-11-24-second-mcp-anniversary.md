---
title: "Two Years of MCP Builders"
date: "2026-11-24T09:00:00+00:00"
publishDate: "2026-11-24T09:00:00+00:00"
slug: second-mcp-anniversary
description: "The Model Context Protocol turns two years old this week, and we're celebrating the people who helped us build it and everyone building with it."
author:
  - "David Soria Parra (Co-creator of MCP, Lead\u00a0Maintainer)"
  - Den Delimarsky (Lead Maintainer)
tags:
  - mcp
  - community
  - anniversary
ShowToc: true
---

This week, our little open-source project, the Model Context Protocol (MCP), turns **two years old**. And what better way to mark this occasion than by celebrating the people who helped us build it and everyone building with it.

When MCP first launched, we could not have imagined how creative and ambitious the community would get with it, or how many people would jump in to help make it become what it is today. Developers have been showing up since the very first day the project landed on GitHub, and we've had more than 2,500 unique contributors since then. As we're heading into our third year, it's worth looking back at some of the highlights since that fateful November of 2024.

## Open from the start

MCP began in the summer of 2024, when David Soria Parra pitched Justin Spahr-Summers on an open protocol for connecting AI applications to tools and data. Justin was on board right away, and [the two of them spent the next few months building it](https://www.latent.space/p/mcp). On November 25, Anthropic [open-sourced the Model Context Protocol](https://www.anthropic.com/news/model-context-protocol).

It didn't take long for the community to start helping us extend and evolve MCP into a far better protocol than we ever could have built on our own. So in July 2025, we [formalized our governance](https://blog.modelcontextprotocol.io/posts/2025-07-31-governance-for-mcp/) to make it straightforward for anyone to propose changes and have a say in where the project goes next.

By the time we celebrated the [first birthday](https://blog.modelcontextprotocol.io/posts/2025-11-25-first-mcp-anniversary/), we had full support for remote servers, industry-standard authorization capabilities, and a registry reference implementation that other companies were adopting for both internal and external projects.

Just a couple of weeks later, we got to celebrate again when MCP joined the [Agentic AI Foundation](https://blog.modelcontextprotocol.io/posts/2025-12-09-mcp-joins-agentic-ai-foundation/) under the Linux Foundation. That gave maintainers and the community the independence to keep steering the protocol together for years to come, with the same vendor-neutral stewardship as projects like Kubernetes, PyTorch, and Node.js.

<picture>
  <source media="(max-width: 600px)" srcset="/posts/images/second-mcp-anniversary/mcp-timeline-phone.png" width="1200" height="3096">
  <img src="/posts/images/second-mcp-anniversary/mcp-timeline.png" width="2160" height="1926" loading="lazy" style="max-width: 100%; height: auto" alt="Timeline of MCP's first two years. Year one: open-source launch with spec 2024-11-05 in November 2024; remote servers and authorization with spec 2025-03-26 in March 2025; elicitation and structured output with spec 2025-06-18 in June 2025; formal governance in July; the MCP Registry preview in September; and the first birthday with spec 2025-11-25 in November. Year two: the move to the Agentic AI Foundation in December 2025; MCP Apps, the first official extension, in January 2026; Enterprise-Managed Authorization in June; the stateless protocol with spec 2026-07-28 in July; Skills over MCP beta in October; and Events beta in November.">
</picture>

## The year of the builder

While our first year was very much about establishing the foundations of the protocol itself, the second one, without a doubt, became the **year of the MCP builder** - the developers, engineers, and creators who put MCP to work in everything from music and robotics to scientific research.

In fact, our SDKs just crossed 5 billion total downloads, and more than 4.5 billion of those came in the past year alone.

<picture>
  <source media="(max-width: 600px)" srcset="/posts/images/second-mcp-anniversary/mcp-sdk-downloads-phone.png" width="2160" height="1392">
  <img src="/posts/images/second-mcp-anniversary/mcp-sdk-downloads.png" width="2160" height="1392" loading="lazy" style="max-width: 100%; height: auto" alt="Line chart of cumulative MCP SDK downloads, with a shaded gradient under the line. It climbs from zero at launch in November 2024 to more than 400 million at the first birthday and 5.22 billion as of November 23, 2026. A footnote says that the total covers the Python, TypeScript, C#, Rust, and Ruby SDKs, with data from official public registries.">
</picture>

With so many builders behind that growth, we wanted to use this moment to highlight some of their most creative and ambitious work.

One of the more notable themes for MCP this year has been just how much human creativity it can unlock by bringing agents into the tools people already use. When Ben Schoepke wanted to make music by voice while on baby duty, the answer was to build [an MCP server for Ableton Live](https://github.com/bschoepke/ableton-live-mcp) that lets you work on a track just by talking to your agent.

If you work in 3D, [Blender](https://www.blender.org/lab/mcp-server/) now has an official, [open-source](https://projects.blender.org/lab/blender_mcp) MCP server from Blender Lab. It can help you explore a scene, make sense of a geometry nodes setup, or come up with clear names for everything in your file.

The same is happening in video and motion design. [DaVinci Resolve Studio](https://www.cgchannel.com/2026/09/blackmagic-design-releases-resolve-21-1/) and [Cinema 4D](https://www.maxon.net/en/article/maxon-adds-support-for-cinema-4d-mcp-server) both added built-in MCP servers in September, so editors and artists can have an agent organize media or set up renders while they focus on telling the story.

What's exciting is that we've also seen MCP make its way into hardware, like Shinya Ishikawa's [Stack-chan](https://github.com/stack-chan/stack-chan) - a tiny, open-source, "super-kawaii" desk robot that is its very own MCP server.

If you like to tinker with _bigger_ robots, [ROS MCP](https://github.com/robotmcp/ros-mcp-server) lets you direct anything from robot dogs to industrial machines in natural language. Rohit John Varghese, Stefano Dalla Gasperina, Jungsoo Lee, and their fellow contributors built it to connect agents to robots that already run on the Robot Operating System (ROS), so you can get started without changing any robot code.

And if retro computing is more your thing, PokuG built [PC98Bridge](https://github.com/yarufu/PC98Bridge) for the NEC PC-98, a line of Japanese computers that debuted in 1982. Using a serial cable, an agent on a modern PC can browse, copy, and organize files on the original hardware.

Over at Berkeley Lab's Molecular Foundry, Morgan Wall, Peter Ercius, and their colleagues built [TEM Agent](https://newscenter.lbl.gov/2026/10/29/new-virtual-assistant-streamlines-one-of-the-most-advanced-microscopes/), which lets scientists run one of the world's most advanced electron microscopes just by describing what they need. It's amazing to see MCP play a part in research at the atomic scale.

<picture>
  <source media="(prefers-reduced-motion: reduce)" srcset="/posts/images/second-mcp-anniversary/mcp-connects-still.png" width="1200" height="798">
  <img src="/posts/images/second-mcp-anniversary/mcp-connects.gif" width="1200" height="798" loading="lazy" style="max-width: 100%; height: auto" alt="Animation of MCP connecting an AI agent to robotics, creativity, developer tools, and research. Requests travel from a laptop through MCP to each area, where a robot arm moves a block, a music keyboard plays, code appears on a monitor, and atoms light up next to an electron microscope. The results travel back to the agent, and then all four areas work at once.">
</picture>

MCP is just as useful in everyday life as it is in studios and research labs. Dave Sirota's [ROLLIN](https://github.com/DavidSirota/rollin-mcp-server) helps people find wheelchair-accessible restaurants, cafes, and bars across the US, and Zach Greene's [BirdNET-Go MCP server](https://github.com/zax0rz/birdnet-go-mcp) lets you ask which birds stopped by your backyard today. [AllTrails](https://support.alltrails.com/hc/en-us/articles/47343827423764-AllTrails-integrations-with-AI-assistants) uses [MCP Apps](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/) to help you find your next hike on a map right in the chat.

Developers have built MCP into their everyday workflows, too. An agent can pick up an issue in [Linear](https://linear.app/docs/mcp), pull the latest library docs from [Context7](https://github.com/upstash/context7), see how its fix behaves in [Chrome](https://developer.chrome.com/blog/chrome-devtools-mcp) or [Safari](https://webkit.org/blog/18136/introducing-the-safari-mcp-server-for-web-developers/), and deploy it to [Cloudflare](https://blog.cloudflare.com/code-mode-mcp/) - all through the same open protocol.

The agent that helps you ship code can also use MCP to draw on public knowledge from around the world. You can find [NASA satellite data](https://github.com/nasa/earthdata-mcp) on wildfires or sea ice, or explore [Wikidata](https://www.wikidata.org/wiki/Wikidata:MCP), the free knowledge base that anyone can edit. [India's statistics ministry built a server](https://github.com/nso-india/esankhyiki-mcp) on Prefect's [FastMCP](https://github.com/PrefectHQ/fastmcp), so you can ask about jobs, inflation, health, or education and get official numbers straight from the source.

## By the builders, for the builders

Some of the biggest changes to MCP this year came not from hypothetical scenarios that we cooked up in maintainer meetings but rather directly from the experience of those actually building on top of the protocol. Thousands of developers and teams stress-tested MCP in production and helped us figure out what was missing or needed to change.

[Going stateless](https://blog.modelcontextprotocol.io/posts/2026-07-28/) was high on that list, especially for developers running MCP servers at scale. What began as [an actively-debated proposal](https://modelcontextprotocol.io/seps/2575-stateless-mcp) in June of 2025 also became the highlight of the 2026-07-28 release, the largest revision of the protocol since its launch. Any request to an MCP server can now land on any server instance, so you can scale the server on a serverless platform or behind an ordinary load balancer, just like any other web service.

[MCP Apps](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/) is another example of the community leading the way. Ido Salomon and Liad Yosef created [MCP-UI](https://github.com/MCP-UI-Org/mcp-ui) to show that agents could give people _so much more_ than text. Their work, along with the OpenAI Apps SDK, became the foundation of our first official extension. Developers can now build an interactive UI once and have it work across clients like ChatGPT, Claude, Goose, and Visual Studio Code. Just watch Anton Pidkuiko's [Excalidraw app](https://github.com/excalidraw/excalidraw-mcp) sketch out a diagram as you chat - just like us, you'll see why this is such a big deal.

By now you might've noticed that MCP has grown well beyond chat, and agents are using it to do more and more on their own. That's why we are _particularly_ excited about [Events](https://modelcontextprotocol.io/extensions/events/overview), which reached beta earlier this month. With Events, agents can react when something happens - a new email can kick off a draft reply, or a push to your repository can start a code review, all while you're off doing something else.

[Skills over MCP](https://modelcontextprotocol.io/extensions/skills/overview), which is also in beta, can show agents how to write that reply or handle the code review. Developers can build what they know about their tools right into an MCP server, so it's there whenever an agent needs it.

While we're on the topic of distributing artifacts through MCP, another common request has been [file uploads and downloads](https://blog.modelcontextprotocol.io/posts/exploring-file-uploads-and-downloads-in-mcp/). A [working group](https://modelcontextprotocol.io/community/working-groups/file-uploads) is already prototyping an extension that lets agents move massive files without loading them into the model's context. We'd love for you to [poke at the draft](https://github.com/modelcontextprotocol/experimental-ext-file-uploads/blob/main/specification/draft/file-uploads.md) and tell us how we can improve it before it reaches beta.

Lastly, [Enterprise-Managed Authorization](https://blog.modelcontextprotocol.io/posts/enterprise-managed-auth/) is now a stable extension, enabling folks to sign in once and use every MCP server their company has approved with no more interruptions from stray OAuth consent prompts. We're also working on a number of [authorization extensions](https://modelcontextprotocol.io/extensions/auth/overview) that [tie access tokens to the client that requested them](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1932) and [let cloud agents sign in with their own identity](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1933) - the early steps in establishing the primitives for agent identity.

## It's always about the people

Behind every one of those changes is a global, distributed crew of folks who care deeply about the protocol and the people that use it. Building it together across continents and time zones feels nothing short of being part of one tight-knit dream team. This year, we saw the community really come to life - from a myriad of Discord threads and working group calls to a run of summits around the globe.

It all kicked off in April with [MCP Dev Summit in New York](https://events.linuxfoundation.org/mcp-dev-summit-north-america/), which drew a crowd of about 1,200 - four times the size of the very first summit in [San Francisco](https://luma.com/mcpdevsummit2025) in May of 2025. June brought back-to-back summits in [Bengaluru](https://events.linuxfoundation.org/mcp-dev-summit-bengaluru/) and [Mumbai](https://events.linuxfoundation.org/mcp-dev-summit-mumbai/), and August took MCP all the way to [Seoul](https://events.linuxfoundation.org/mcp-dev-summit-seoul/).

<img src="/posts/images/second-mcp-anniversary/mcp-dev-summit-new-york.jpg" width="1440" height="960" loading="lazy" style="max-width: 100%; height: auto" alt="Two speakers present on stage to hundreds of attendees at MCP Dev Summit in New York, in a blue-lit ballroom with ring-shaped chandeliers.">

<img src="/posts/images/second-mcp-anniversary/mcp-dev-summit-seoul.jpg" width="1440" height="568" loading="lazy" style="max-width: 100%; height: auto" alt="Attendees gather at round tables, many of them on laptops and phones, in a ballroom at MCP Dev Summit Seoul.">

<img src="/posts/images/second-mcp-anniversary/mcp-dev-summit-seoul-talk.jpg" width="1440" height="960" loading="lazy" style="max-width: 100%; height: auto" alt="A speaker presents on stage to a ballroom of attendees seated at round tables at MCP Dev Summit Seoul.">

September was especially packed, with AGNTCon + MCPCon taking place in [Shanghai](https://www.lfopensource.cn/mcp-dev-summit-shanghai/), [Tokyo](https://events.linuxfoundation.org/mcp-dev-summit-tokyo/), and [Amsterdam](https://events.linuxfoundation.org/agntcon-mcpcon-europe/) - all in less than two weeks. Fun fact - during AGNTCon + MCPCon Europe, the protocol Core Maintainers established the basics for the next spec release, that we're planning on [releasing in March of next year](https://blog.modelcontextprotocol.io/posts/mcp-release-cycle/).

<img src="/posts/images/second-mcp-anniversary/amsterdam-maintainers.jpg" width="1440" height="1080" loading="lazy" style="max-width: 100%; height: auto" alt="Maintainers in Amsterdam planning the next spec, seated around a long conference table.">

<img src="/posts/images/second-mcp-anniversary/amsterdam-core-maintainers.jpg" width="1440" height="1080" loading="lazy" style="max-width: 100%; height: auto" alt="Core Maintainers in Amsterdam helping plan the next spec, as one of them sketches a timeline on a flip chart.">

<img src="/posts/images/second-mcp-anniversary/agntcon-mcpcon-amsterdam.jpg" width="1440" height="960" loading="lazy" style="max-width: 100%; height: auto" alt="A speaker on stage beside the lectern at AGNTCon + MCPCon Europe in Amsterdam, clicker in hand.">

October opened with MCP Dev Summit in [Toronto](https://events.linuxfoundation.org/mcp-dev-summit-toronto/), followed by [AGNTCon + MCPCon North America](https://events.linuxfoundation.org/archive/2026/agntcon-mcpcon-north-america/) in San Jose. Just last week, builders spent two whole days in [Nairobi](https://events.linuxfoundation.org/mcp-dev-summit-nairobi/) sharing their work and learning about how MCP continues to shift and influence the agentic landscape.

<img src="/posts/images/second-mcp-anniversary/agntcon-mcpcon-san-jose.jpg" width="799" height="533" loading="lazy" style="max-width: 100%; height: auto" alt="A speaker addresses the audience from the stage at AGNTCon + MCPCon North America in San Jose, under a screen that reads &quot;Where the agentic stack is being built.&quot;">

<img src="/posts/images/second-mcp-anniversary/agntcon-mcpcon-san-jose-audience.jpg" width="1440" height="1080" loading="lazy" style="max-width: 100%; height: auto" alt="Hundreds of attendees fill a dimly lit hall at AGNTCon + MCPCon North America in San Jose, with others sitting on the floor and standing at the side.">

Ten cities and four continents later, MCP has brought together a massively talented group of people from all over the world. We've never seen anything like it, and that community is only getting bigger.

Oh, and in case you missed it - at AGNTCon + MCPCon in Amsterdam and San Jose, we sat down with some of the folks who make MCP happen and recorded their stories and field notes. We'd love for you to check out the series, starting with [David's episode](https://www.youtube.com/watch?v=QCNMueBosc0) and [our chat with MCPJam's Prathmesh Patel](https://www.youtube.com/watch?v=FvZyllCGQxo).

To every maintainer, moderator, contributor, organizer, and developer, and to everyone who helped someone else get started with MCP in the past two years - we owe you a massive heartfelt thank you. Together, you turned a brand-new protocol into _the_ standard for connecting AI to the rest of the world. We feel incredibly lucky to work alongside every single one of you.

We can't think of a better way to spend the next year than building MCP with this community. Whether you're working on your first server or have an idea for the spec, come [join in on the fun](https://modelcontextprotocol.io/community/contributing) - we'd love your help.

Happy birthday, MCP!
