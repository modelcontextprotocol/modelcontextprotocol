# MCP Spec Plugin for Claude

Skills for researching and contributing to the Model Context Protocol specification.

## Installation

### Claude Code

```bash
/plugin marketplace add modelcontextprotocol/modelcontextprotocol
```

### Claude Cowork

Navigate to Customize >> Browse Plugins >> Personal >> Plus Button >> Add marketplace from GitHub and add `modelcontextprotocol/modelcontextprotocol`

## Available Skills

### `/search-mcp-github <topic>`

Search across MCP GitHub discussions, issues, and pull requests to find relevant information about a topic.

**Sources searched:**

- [Org-level Discussions](https://github.com/orgs/modelcontextprotocol/discussions)
- [Spec-level Discussions](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions)
- [Spec-level Issues](https://github.com/modelcontextprotocol/modelcontextprotocol/issues)
- [Spec-level Pull Requests](https://github.com/modelcontextprotocol/modelcontextprotocol/pulls)

**Example:**

```
/search-mcp-github Tool Annotations
```

**Note:** The skill searches both open AND closed issues/PRs, which is important for understanding past decisions and historical context.

### `/draft-sep <idea>`

Research and draft a Specification Enhancement Proposal that conforms to the [SEP governance process](https://modelcontextprotocol.io/community/sep-guidelines). Interviews the author, checks existing spec coverage and prior art, gates on whether the idea is SEP-worthy, then fills the template's required and optional sections and writes `seps/0000-{slug}.md`. Optionally opens a draft PR, backfills the SEP number, and runs `npm run generate:seps` so CI stays green.

**Example:**

```
/draft-sep add websocket transport
```

**Note:** The skill will ask clarifying questions (SEP type, breaking-change status, prototype, prior discussion, sponsor, security) before writing anything. The SEP guidelines advise discussing an idea in Discord or a Working Group before drafting — the skill will flag if that hasn't happened.
