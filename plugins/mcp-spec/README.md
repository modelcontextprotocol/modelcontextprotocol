# MCP Spec Plugin for Claude Code

Skills for researching and contributing to the Model Context Protocol specification.

## Installation

```bash
/plugin marketplace add modelcontextprotocol/modelcontextprotocol
```

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
