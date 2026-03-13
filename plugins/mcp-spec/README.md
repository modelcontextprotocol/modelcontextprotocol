# MCP Spec Plugin for Claude

Skills for researching the Model Context Protocol specification via GitHub.

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

## MCP Servers

This plugin includes an MCP server for searching the MCP documentation:

- **mcp-docs** — Search the Model Context Protocol documentation at modelcontextprotocol.io

## Related Plugins

For SEP annotation and review workflows, see [mcp-spec-annotator](../mcp-spec-annotator/).
