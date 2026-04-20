# SEP-9999: Keyword-based Server Routing via `Implementation.keywords`

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-04-20
- **Author(s)**: Vijay Waghmare (@Vijaynw)
- **Sponsor**: None (seeking sponsor)
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/9999

## Abstract

This SEP proposes adding an optional `keywords: string[]` field to the
`Implementation` object exchanged in the `initialize` handshake (i.e. on both
`clientInfo` and `serverInfo`). Keywords are short, lowercase tokens describing
the domain, topics, integrations, or capabilities an implementation is
associated with — for example `"jira"`, `"bitbucket"`, `"postgres"`,
`"observability"`. They give MCP hosts a standardized, server-advertised hint
they can use to route a user's natural-language request to the most relevant
connected server, rank servers in discovery UIs, and pre-select servers based on
conversational or workspace context — even when the user's prompt does not match
any tool name, tool description, or resource URI directly. The field is purely
advisory metadata and does not affect the wire protocol surface, gate any
request, or imply any security boundary.

## Motivation

Today, MCP hosts that connect to multiple servers have no standardized,
server-declared signal for "what is this server about?" beyond:

1. The server's `name` (often a vendor identifier such as `"bitbucket-mcp"`),
2. Free-form `description` / `instructions` strings (not designed for matching),
3. The list of `tools` / `resources` / `prompts` (only fetched after `initialize`,
   and often using internal identifiers that do not contain the user-facing
   domain term).

This forces every host to either:

- Ship hard-coded routing tables per known server (does not scale, breaks for
  third-party servers), or
- Eagerly fetch and embed every tool/resource description on every connected
  server in the LLM context (expensive, leaks unrelated tools, and still misses
  the case where the user's term never appears in any description).

Concrete failure case: a user has an MCP server `XYZ` configured. The user
types a message containing the term `V`. `V` does not appear in `XYZ`'s name,
description, tool names, or tool descriptions — but the operator of `XYZ`
_knows_ `XYZ` is the right server for `V`-related requests. There is currently
no spec-supported way for `XYZ` to declare that association. Operators
work around this by editing client-specific config files (e.g. Windsurf's
`mcp_config.json`) with non-portable extensions.

`keywords` solves this with a single, opt-in, backward-compatible field that
any client and any server can implement independently.

## Specification

### Schema change

Add an optional `keywords` field to the `Implementation` interface in
`schema/draft/schema.ts`:

```ts
export interface Implementation extends BaseMetadata, Icons {
  // ... existing fields (version, description, websiteUrl, ...) ...

  /**
   * An optional list of keywords or tags that describe the domain, topics,
   * or capabilities of this implementation.
   *
   * Clients MAY use these keywords to route user requests to the most relevant
   * server, surface servers in search/discovery UIs, or pre-select servers
   * based on conversational context.
   */
  keywords?: string[];
}
```

Because `Implementation` is reused for both `clientInfo` (in
`InitializeRequestParams`) and `serverInfo` (in `InitializeResult`), both
peers MAY advertise keywords. The primary use case is `serverInfo`.

### Wire format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-11-25",
    "capabilities": { "tools": {} },
    "serverInfo": {
      "name": "atlassian-mcp",
      "version": "1.4.2",
      "keywords": [
        "jira",
        "bitbucket",
        "atlassian",
        "issue-tracking",
        "pull-request"
      ]
    }
  }
}
```

### Normative requirements

1. The `keywords` field is **OPTIONAL**. Clients and servers **MUST** treat its
   absence as equivalent to an empty array.
2. Each entry **SHOULD** be a short, lowercase token. Implementations
   **SHOULD NOT** include whitespace-separated phrases; multi-word concepts
   **SHOULD** use hyphens (e.g. `"issue-tracking"`).
3. Servers **SHOULD** keep the list small and focused (typically under ~10
   entries) and **SHOULD NOT** include their own `name` or generic terms such
   as `"server"` or `"mcp"` that provide no routing signal.
4. Clients **SHOULD** treat keyword comparisons as case-insensitive.
5. Clients **MAY** use `keywords` to:
   - Route a user's natural-language request to the most relevant server when
     the request contains or implies one of the advertised keywords, **even
     when no tool name, description, or resource directly matches**.
   - Rank or filter servers in discovery, search, and selection UIs.
   - Pre-load or pre-select servers based on conversational context, project
     type, or active workspace.
6. Clients **MUST NOT** use `keywords` as a security or authorization boundary.
   Keywords are advisory metadata only.
7. Clients **SHOULD NOT** require an exact substring match against tool names,
   descriptions, or resource URIs before considering a server relevant if a
   keyword matches.

### Documentation change

Add a `Keyword-based Server Routing` subsection under
`docs/specification/draft/basic/lifecycle.mdx` (between
`Capability Negotiation` and `Extension Negotiation`) describing the behavior
above, and add `keywords` to the example `clientInfo` and `serverInfo` payloads.

## Rationale

**Why on `Implementation` rather than `ServerCapabilities`?**
Capabilities describe _protocol features_ the peer supports (tools, resources,
sampling, ...). Keywords describe the _subject domain_ of the implementation,
which is metadata about the implementation itself — the same conceptual layer
as `name`, `description`, `version`, and `websiteUrl`, all of which already
live on `Implementation`.

**Why not infer from tool names / descriptions?**
Tool names are typically internal identifiers (`get_issue`, `create_pr`) that
do not contain the user-facing domain term (`jira`, `bitbucket`). Descriptions
are free-form prose tuned for LLM consumption, not for keyword matching.
Eagerly listing all tools across all connected servers just to extract routing
signals is expensive and noisy. A small explicit list authored by the server
operator is both cheaper and higher-precision.

**Why not a separate `tags` field on `ServerCapabilities`?**
Capabilities are negotiated and consumed by the protocol layer; keywords are
consumed by the _host UI / orchestration layer_. Co-locating them with other
implementation metadata (`name`, `description`) makes the contract clearer.

**Why an array of strings rather than a richer object?**
A flat string array is the smallest possible surface that solves the routing
problem. Richer structures (weights, categories, taxonomies) can be layered on
later via a future SEP without breaking this one.

**Prior art.**
Package ecosystems (npm `package.json`, PyPI, crates.io, VS Code extensions,
Homebrew) all expose a `keywords` array on the package manifest for exactly
this purpose: discovery and routing. The semantics here are a direct analogue
applied to MCP server discovery.

**Alternatives considered.**

- **Client-only config (status quo).** Each host invents its own `keywords`
  field in its local config file (e.g. Windsurf `mcp_config.json`). Rejected:
  not portable, requires every operator to re-author per host, and gives the
  _operator_ — not the _server author_ — the burden of knowing the server's
  domain.
- **Embed keywords in `description`.** Rejected: fragile substring matching,
  pollutes the human-readable description, and conflates two concerns.
- **A new MCP method `mcp/describe` returning richer metadata.** Rejected as
  overkill for the immediate problem; can be revisited if more discovery
  metadata is needed in the future.

## Backward Compatibility

Fully backward compatible.

- The field is optional. Servers that do not set it produce identical
  `initialize` responses to today.
- Clients that do not understand the field will ignore it (per existing JSON
  forward-compatibility rules in MCP).
- No existing field semantics are changed.
- No protocol version bump is required beyond the normal draft cycle.

## Security Implications

`keywords` is **advisory metadata only**. It does not change the protocol
surface, does not gate any request, and **MUST NOT** be used as an
authorization or trust signal.

Specific considerations:

- **Keyword squatting.** A malicious server could advertise broad or unrelated
  keywords (`"jira"`, `"github"`, `"stripe"`) to be selected over legitimate
  servers. This is mitigated by the fact that the _user_ (or operator) chose
  to install and connect the server in the first place; MCP already trusts
  installed servers to behave honestly about their `name` and `description`.
  Hosts **SHOULD** make the routing decision visible to the user (e.g. "Using
  `atlassian-mcp` because keyword 'jira' matched") and allow override.
- **Information disclosure.** Keywords are sent in the `initialize` response,
  which is already visible to the connected client. No new disclosure surface.
- **PII / secrets.** Servers **MUST NOT** put user data, credentials, or
  tenant identifiers in `keywords`; this is metadata about the server type,
  not about a session.

## Reference Implementation

Schema and spec changes:

- `schema/draft/schema.ts` — added `keywords?: string[]` to `Implementation`.
- `schema/draft/schema.json` — regenerated via `npm run generate:schema`.
- `docs/specification/draft/basic/lifecycle.mdx` — added the
  `Keyword-based Server Routing` subsection and updated the `clientInfo` and
  `serverInfo` example payloads to include `keywords`.

A host-side reference (consuming `serverInfo.keywords` to bias server
selection) is intended to land in a Windsurf / Codeium client release; link
to be added once the PR is open.

---

## Additional Optional Sections

### Testing Plan

- **Schema validation:** `npm run check:schema` confirms the JSON schema accepts
  `serverInfo` payloads both with and without `keywords`, and rejects
  non-string array entries.
- **Round-trip:** SDKs implementing `Implementation` should serialize/deserialize
  `keywords` losslessly and expose it on the public type.
- **Host behavior:** Reference host implementation should include tests that:
  1. A user prompt containing keyword `K` ranks a server advertising `K`
     above a server that does not, all else equal.
  2. Absence of `keywords` does not regress today's selection behavior.
  3. Routing decisions are surfaced in the UI / logs and overridable.

### Open Questions

- Should the spec recommend a maximum length per keyword and per array
  (e.g. ≤ 32 chars per entry, ≤ 16 entries)? Current draft says "typically
  under ~10" without a hard limit.
- Should keywords be allowed on individual `Tool` / `Resource` / `Prompt`
  objects in addition to `Implementation`? Deferred to a future SEP — the
  immediate routing problem is at the server granularity.
- Should we publish a curated "common keywords" list (e.g. `"jira"`,
  `"github"`, `"postgres"`) to encourage convergence, or leave it fully
  free-form? Recommend free-form for v1.

### Acknowledgments

Thanks to early Windsurf MCP users who surfaced the routing-by-keyword need
that motivated this proposal.
