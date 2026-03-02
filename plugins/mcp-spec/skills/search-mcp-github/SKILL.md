---
name: search-mcp-github
description: Search MCP PRs, issues, and discussions across the modelcontextprotocol GitHub org
user_invocable: true
arguments:
  - name: topic
    description: The topic or keyword to search for
    required: true
---

# Searching MCP PRs, issues, and discussions

## Where to search

- **MCP Docs Server** (`mcp-docs` MCP server → `SearchModelContextProtocol` tool): Authoritative for current spec content. **Prefer this first** for specification details, API references, and protocol concepts.
- **Spec PRs & Issues**: `gh search prs` / `gh search issues` in `modelcontextprotocol/modelcontextprotocol` (searches open and closed by default)
- **Spec Discussions**: https://github.com/modelcontextprotocol/modelcontextprotocol/discussions (requires GraphQL — see below)
- **Org Discussions**: https://github.com/orgs/modelcontextprotocol/discussions (requires GraphQL — see below)

For historical decisions, prioritize merged PRs and closed issues over open items.

## Searching discussions

There is no `gh search discussions` command. Use the GraphQL API:

```bash
# Spec-repo discussions
gh api graphql -f query="query { search(query: \"repo:modelcontextprotocol/modelcontextprotocol <topic>\", type: DISCUSSION, first: 20) { nodes { ... on Discussion { title url body author { login } authorAssociation category { name } answer { author { login } authorAssociation body } } } } }"

# Org-wide discussions
gh api graphql -f query="query { search(query: \"org:modelcontextprotocol <topic>\", type: DISCUSSION, first: 20) { nodes { ... on Discussion { title url body author { login } authorAssociation category { name } answer { author { login } authorAssociation body } } } } }"
```

## Search term variants

GitHub search does **not** split camelCase tokens. `ToolAnnotations` and `Tool Annotations` return almost entirely different results — search both.

- **camelCase** (`ToolAnnotations`, `inputSchema`): matches identifiers in code and schema
- **Space-separated** (`Tool Annotations`, `input schema`): matches natural-language discussion text

Skip kebab-case variants (`tool-annotations`) — GitHub tokenizes on hyphens, so they behave like the space-separated form but tend to return noisier results.

## Deep diving into a PR

**When to deep dive:** a search result PR looks highly relevant to the topic, and you need to understand _why_ a change was made, not just _what_ changed

During a deep dive, look through:

- general conversation on the PR not tied to specific lines of code (`repos/modelcontextprotocol/modelcontextprotocol/issues/{pr_number}/comments`)
- comments left on specific lines of code during review (`repos/modelcontextprotocol/modelcontextprotocol/pulls/{pr_number}/comments`)
- top-level review bodies submitted with an approve/request-changes/comment verdict (`repos/modelcontextprotocol/modelcontextprotocol/pulls/{pr_number}/reviews`)

Each comment returned by these endpoints includes an `author_association` field — use it to identify maintainers (see [Notable maintainer quotes](#notable-maintainer-quotes)).

## Output format

### PRs

```markdown
- [#123](url) - PR Title (**Merged/Closed/Open** <date>)
  Brief summary of PR
```

### Issues

```markdown
- [#456](url) - Issue Title (**Open/Closed** <date>)
  Brief summary of issue
```

### Discussions

```markdown
- [#789](url) - Discussion Title (<date>)
  Brief summary of discussion content
```

### Notable maintainer quotes

**Identifying maintainers:** The GitHub API includes an `author_association` field (REST) or `authorAssociation` (GraphQL) on every comment. Treat users with association `MEMBER` or `OWNER` as maintainers.

When maintainers make comments that reveal design intent, set direction, or explain rationale, **quote them directly** with attribution and a footnote:

> "These would require a SEP. I think the general question here is about the taxonomy of hints." [^1]
> — @dsp-ant

Look for quotes that:

- Explain **why** a decision was made
- Set **direction** for future work
- **Reject** or **redirect** an approach
- Clarify the **intended semantics** of a feature

### Key insights

Summarize the most important findings and any decisions or consensus reached.

### Footnotes

Collect all sources as footnotes at the end. Every quote and claim presented in the output should have a corresponding footnote. For example:

```markdown
[^1]: [#616 inline review comment by @dsp-ant](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/616#discussion_r...)

[^2]: [#185 ToolAnnotations](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/185)

[^3]: [Spec: Tool Annotations (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
```

## General strategy

1. Generate search terms and variants (camelCase, space-separated, etc.)
2. Use `SearchModelContextProtocol` tool (if available) to search for current specification details and concepts
3. Expand search terms and variants based on new information
4. Search GitHub locations (use `gh` CLI tool if available)
5. Aggregate search results
6. Display output with summarized results, key insights, and direct attributions
