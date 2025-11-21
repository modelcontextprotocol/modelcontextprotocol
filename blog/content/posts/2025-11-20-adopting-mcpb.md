+++
date = '2025-11-21T00:00:00+00:00'
publishDate = '2025-11-21T00:00:00+00:00'
draft = false
title = 'Adopting the MCP Bundle format (.mcpb) for portable local servers'
author = 'David Soria Parra (MCP Lead Maintainer), Joan Xie (MCPB Maintainer)'
tags = ['mcp', 'mcpb', 'bundles']
+++

The [MCP Bundle format (.mcpb)](https://github.com/modelcontextprotocol/mcpb) is now part of the Model Context Protocol. This makes it easier for developers to distribute local MCP servers across any compatible client, including Claude desktop app, Claude Code, and MCP for Windows.

## What are MCP Bundles?

MCP Bundles are zip archives containing a local MCP server and a `manifest.json` that describes the server and its capabilities. The format is similar to Chrome extensions (.crx) or VS Code extensions (.vsix), enabling end users to install local MCP servers with a single click.

A basic bundle structure looks like:

```
bundle.mcpb (ZIP file)
├── manifest.json      # Required: Bundle metadata and configuration
├── server/            # Server implementation
│   └── index.js
├── node_modules/      # Bundled dependencies
└── icon.png           # Optional: Bundle icon
```

The format supports servers written in Node.js, Python, or compiled binaries—giving developers flexibility in how they build while maintaining a consistent distribution mechanism for users.

## Why move MCPB to the specification?

Anthropic originally developed this format (previously called DXT) for Claude's desktop applications. However, we believe the local MCP server ecosystem benefits when portability extends beyond any single client. By moving the bundle specification, CLI tooling, and reference implementation to the MCP project, we're enabling:

**Cross-client compatibility:** A bundle created for one MCP-compatible application should work in any other that implements the specification. Developers can distribute their work once and reach users across the ecosystem.

**Ecosystem-wide tooling:** The `mcpb` CLI and associated libraries are now open for the community to extend, improve, and build upon. Client developers can adopt standardized code for loading and verifying bundles.

**User-friendly installation:** End users benefit from a consistent installation experience regardless of which AI application they prefer. Configuration variables, permissions, and updates can be handled uniformly.

## What this means for developers

**Servers:** You can now package your local MCP servers for distribution across multiple clients. The `mcpb` CLI helps you create a `manifest.json` and package your server into a `.mcpb` file. Once packaged, users can install your server with a single click in any client that supports MCP Bundles.

**Clients:** You can add support for MCP Bundles to your application using the open-source toolchain. The repository includes the schemas and key functions used by Claude for macOS and Windows to implement bundle support, which you can adapt for your own client.

## Getting started

Check out the repo to get started: [modelcontextprotocol/mcpb](https://github.com/modelcontextprotocol/mcpb). We encourage feedback and contributions.

## Acknowledgements

Thanks to the MCP contributors and maintainers involved in making this happen, including:

- David Soria Parra (MCP Lead Maintainer)
- Adam Jones (MCP Maintainer)
- Joan Xie (MCPB Maintainer)
- Felix Rieseberg (MCPB Maintainer)
- Alex Sklar (MCPB Maintainer)
