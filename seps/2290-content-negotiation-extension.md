# SEP-2290: Content Negotiation Extension

- **Status**: Draft
- **Type**: Extensions Track
- **Extension ID**: `io.modelcontextprotocol/content-negotiation`
- **Created**: 2026-02-22
- **Author(s)**: Aaron Sempf (sempfa@amazon.com), Andreas Schlapbach (andreas.schlapbach@sbb.ch) (@schlpbch)
- **Sponsor**: (Seeking)
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2317

## Abstract

MCP servers cannot distinguish between AI agent clients and human-facing clients,
forcing one-size-fits-all responses. This extension introduces **transparent
content negotiation** inspired by RFC 2295: clients declare structured feature
tags once during the `initialize` handshake, and servers adapt response content
(format, verbosity, structure) accordingly.

Feature tags are grounded in the client's actual MCP capabilities (`sampling`,
`elicitation`, `roots`, `tasks`) rather than generic labels, giving servers
precise, verifiable signals for content decisions. Negotiation is session-scoped
— decided once at handshake with zero per-request overhead — and is fully
backward compatible. A hard design constraint ensures feature tags control
_what_ the server sends, never _whether_ to send it (no access control via
tags).

Standard tags cover client type (`agent`, `human`), format (`format=json|text|markdown`),
and verbosity (`verbosity=compact|standard|verbose`). The extension namespace is
`io.modelcontextprotocol/content-negotiation`.

## Full Specification

The complete specification, including detailed feature tag registry, protocol
examples, RFC 2295 mapping, security analysis, TypeScript reference
implementation, and comparison with related proposals, is maintained at:

**https://github.com/schlpbch/ext-content-negotiation**

Current version: **v0.9.4**
