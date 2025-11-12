+++
date = '2025-11-11T00:00:00Z'
title = 'Extending MCP into the UI Layer'
author = 'MCP Community Maintainers'
tags = ['announcement', 'community']
+++

With the introduction of OpenAI’s [Apps SDK](https://platform.openai.com/docs/apps), the Model Context Protocol (MCP) has entered a new phase—one where developers can use the same open protocol that connects AI tools to now power user interfaces as well. Community projects like [mcp.shop](https://mcp.shop) demonstrate how MCP servers can drive interactive, AI-native experiences directly inside chat applications.

This post outlines how **MCP for UI** fits within the broader protocol ecosystem and clarifies what’s considered **MCP Core**, **MCP-Adjacent**, and **MCP Extensions**.

# Overview

MCP’s evolution can be summarized in three layers:

- **MCP Core** defines the base protocol for connecting clients and servers.  
- **MCP Adjacent** services, such as the MCP Registry, enhance discovery and governance.  
- **MCP Extensions** build on that foundation to enable richer use cases—including interactive UI elements.

Together, these layers maintain a clear boundary between the stable protocol specification and community-driven innovation.

# MCP Core

The **core** specification provides a common language for AI clients—like ChatGPT, Claude, and IDE extensions—to communicate with external tools and data sources.  
It focuses on structured discovery, tool invocation, and context exchange, ensuring interoperability across platforms.

The core remains intentionally minimal, acting as a *universal connector for AI systems*. Developers can reference the latest protocol specification and roadmap at [modelcontextprotocol.io](https://modelcontextprotocol.io/development/roadmap).

# MCP-Adjacent projects

**MCP-Adjacent** projects expand the ecosystem without changing the core protocol.  
The best-known example is the [MCP Registry](https://registry.modelcontextprotocol.io), an open catalog and API for discoverable servers. It standardizes how servers are distributed and discovered, providing a reliable starting point for client integrations.  

Other adjacent initiatives include SDK tooling, governance layers, and registry sub-projects operated by community maintainers. These efforts enhance usability while keeping the protocol itself lean and interoperable.

# MCP Extensions

**Extensions** introduce new conventions that extend MCP’s capabilities.  
Recent examples include:

- **MCP-UI** – an experimental convention for returning structured UI components (such as charts, tables, and forms) to AI clients.  
- **OpenAI Apps SDK** – a framework that builds directly on MCP to add UI metadata, enabling ChatGPT to render interactive content inline.

Projects like [mcp.shop](https://mcp.shop) show how these extensions turn a standard MCP server into a fully interactive app experience—without altering the protocol’s foundations.  
Extensions remain optional, but they illustrate MCP’s flexibility as a base for AI-native front-ends.

# Why it matters

By keeping **MCP Core** stable while allowing **Adjacent** and **Extension** projects to evolve, the ecosystem encourages innovation without sacrificing compatibility.  
This modular approach ensures that MCP continues to serve as a reliable backbone for developers building the next generation of AI-native software.

# Acknowledgments

This post draws on discussions across the MCP community and the work of contributors experimenting with UI-enabled servers and new extensions.  
We thank all developers advancing the open standard—from protocol maintainers to independent builders creating new MCP experiences.

For more information, visit the [MCP Blog](https://blog.modelcontextprotocol.io) or follow ongoing development at [modelcontextprotocol.io](https://modelcontextprotocol.io/development/roadmap).
