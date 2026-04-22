# SEP-2633: Standard Client-Side Configuration Format - mcp.json

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-04-21
- **Author(s)**: Bob Dickinson (@BobDickinson), Tadas Antanavicius (@tadasant)
- **Sponsor**:
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2633

## Abstract

The MCP ecosystem has server.json (the MCP Registry package specification), and soon the related ServerCard, for describing how servers can be configured. But there's no standard for the other side: how a client will connect to its servers.

mcp.json is a proposal for a minimal, client-side configuration format that any MCP client can adopt, and that will provide interoperability of MCP server configurations across clients.

## Motivation

Today every MCP client invents its own format for server configuration. Clients use different file names, and even different file types (JSON, JSONC, and TOML). They use different top-level keys (including "servers" and "mcpServers"). They use different values for the `type` field. They use different mechanisms and encodings for secret interpolation. The list goes on. This makes it hard to share MCP server configurations across clients.

As just one example of why this is an issue, consider that many clients allow MCP servers to be configured at the project level. In such a case, if developers of that project used different clients, they would be unable to share a common definition of project-level MCP servers.

Consider this example of the same GitHub MCP server configuration in two popular clients: VS Code and Claude Code.

### VS Code: .vscode/mcp.json (JSONC file)

```jsonc
{
  "servers": {
    // Comments don't break me
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": {
        "Authorization": "Bearer ${input:github_mcp_pat}", // <- trailing comma
      },
    },
  },
  "inputs": [
    {
      "type": "promptString",
      "id": "github_mcp_pat",
      "description": "GitHub Personal Access Token",
      "password": true,
    },
  ],
}
```

### Claude: .mcp.json (JSON file)

```json
{
  "mcpServers": {
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp",
      "headers": {
        "authorization": "Bearer ${GITHUB_MCP_PAT}"
      }
    }
  }
}
```

These two clients use different file names, different file types (JSONC vs JSON), different top-level keys, and different mechanisms of injecting secrets.

While these two clients (and many others) use the `type` value "http" to represent streamable HTTP, there are many exceptions: RooCode/Cline uses "streamable-http". Goose uses "streamable_http". LangChain used "streamable_http" until December of 2025 when they widened it to also allow "streamable-http" or just "http". Also, many clients infer the `type` value from the presence of "command" or "url" attributes (presumably modern clients infer the type to be streamable http when url is present, but it's not clear that can be relied upon).

This disparity also complicates life for server publishers trying to help with installation guidance. Consider the GitHub MCP server: [https://github.com/github/github-mcp-server](https://github.com/github/github-mcp-server)

In the documentation for that server there are 11 separate server configuration examples to show how to install that one server into different clients. There are VSCode instructions on the main page, then seven additional pages for installing into other clients, including one for installing it into other IDEs supporting Copilot, of which there are four variants (bringing the total to 11). Granted, server.json and ServerCards are a better solution to this, but even with those solutions, JSON configuration examples will likely still persist.

## Specification

We will establish a standard format for mcp.json as defined below.

### Relationship to server.json

| Format      | Purpose                                     | Configurability                                                        |
| :---------- | :------------------------------------------ | :--------------------------------------------------------------------- |
| server.json | Server package specification for registries | Highly configurable — variables, templates, user-adjustable parameters |
| mcp.json    | Client-side server configuration            | Fully resolved — only auth secrets remain as interpolatable variables  |

- server.json = "Here's how this server can be configured"
- mcp.json = "Here's exactly how this client will connect to its servers"

Each entry in an mcp.json is what you get after resolving a server.json template with concrete values.

### File Name, Type, and Structure

The file will be named `mcp.json` and will be a JSON file (and explicitly not a JSONC file). MCP servers will be under the top-level key `mcpServers`, and will consist of a map of server names to server configurations:

```json
{
  "mcpServers": {
    "server-name": { ... },
    "another-server": { ... }
  }
}
```

Server names must match `^[a-zA-Z0-9_\[\]-]+$` (alphanumeric, hyphens, underscores, brackets).

### Server Configuration Fields

| Field         | Type     | Required     | Description                                                |
| ------------- | -------- | ------------ | ---------------------------------------------------------- |
| `title`       | string   | No           | Human-readable display name (max 100 chars)                |
| `description` | string   | No           | What the server provides (max 500 chars)                   |
| `type`        | string   | **Yes**      | Transport type: `"stdio"`, `"sse"`, or `"streamable-http"` |
| `command`     | string   | Yes (stdio)  | Executable command for stdio servers                       |
| `args`        | string[] | No (stdio)   | Command-line arguments                                     |
| `env`         | object   | No (stdio)   | Environment variables (string values)                      |
| `url`         | string   | Yes (remote) | Endpoint URL for sse/streamable-http servers               |
| `headers`     | object   | No (remote)  | HTTP headers for remote servers (string values)            |
| `oauth`       | object   | No (remote)  | OAuth configuration for servers using OAuth authorization  |

#### Transport-Specific Requirements

**stdio servers** (`type: "stdio"`):

- `command` is required
- `args` is allowed
- `env` is allowed
- `url` and `headers` are not allowed

**Remote servers** (`type: "sse"` or `type: "streamable-http"`):

- `url` is required
- `headers` is allowed
- `oauth` is allowed (see [OAuth Configuration](#oauth-configuration))
- `command`, `args`, and `env` are not allowed

### Transport Types

#### stdio — Local Process

Runs a local process that communicates via stdin/stdout:

```json
{
  "github": {
    "title": "GitHub",
    "description": "Create and manage issues, PRs, branches, and files.",
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github@0.6.2"],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "${env:GITHUB_PERSONAL_ACCESS_TOKEN}"
    }
  }
}
```

#### sse — Server-Sent Events

For remote servers using the SSE transport:

```json
{
  "monitoring": {
    "title": "Monitoring",
    "type": "sse",
    "url": "https://mcp.monitoring.example.com/sse",
    "headers": {
      "Authorization": "Bearer ${env:MONITORING_TOKEN}"
    }
  }
}
```

#### streamable-http — HTTP Streaming

For remote servers using HTTP streaming:

```json
{
  "analytics": {
    "title": "Analytics",
    "type": "streamable-http",
    "url": "https://mcp.analytics.example.com/mcp",
    "headers": {
      "X-API-Key": "${env:ANALYTICS_API_KEY}"
    }
  }
}
```

### OAuth Configuration

Remote servers can use OAuth for authorization. The `oauth` object configures how the MCP client initiates the OAuth flow:

| Field         | Type     | Required | Description                                                                                                                   |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `clientId`    | string   | No       | OAuth client ID. If omitted, the client uses Dynamic Client Registration (DCR) or discovery.                                  |
| `scopes`      | string[] | No       | OAuth scopes to request in the authorization request. Passed as the `scope` parameter (RFC 6749 §3.3).                        |
| `redirectUri` | string   | No       | Redirect URI for the OAuth callback. For CLI/desktop clients this is typically `http://localhost:{port}/callback` (RFC 8252). |

All `oauth` fields are optional. Servers that support automatic discovery (RFC 8414, RFC 9728) and Dynamic Client Registration may need no configuration at all — just a `url`:

```json
{
  "linear": {
    "title": "Linear",
    "type": "streamable-http",
    "url": "https://mcp.linear.app/mcp"
  }
}
```

Servers that require a pre-registered client ID (no DCR support) specify it explicitly:

```json
{
  "slack": {
    "title": "Slack",
    "type": "streamable-http",
    "url": "https://mcp.slack.com/mcp",
    "oauth": {
      "clientId": "1601185624273.8899143856786",
      "redirectUri": "http://localhost:3118/callback"
    }
  }
}
```

The `scopes` field allows a single server to be configured with different access levels under different names. Each entry gets its own OAuth session and consent grant:

```json
{
  "bigquery-readonly": {
    "title": "BigQuery (Read-Only)",
    "description": "Read-only analytical queries against BigQuery.",
    "type": "streamable-http",
    "url": "https://mcp.bigquery.example.com/mcp",
    "oauth": {
      "clientId": "bigquery-mcp-client",
      "scopes": ["https://www.googleapis.com/auth/bigquery.readonly"]
    }
  },
  "bigquery-readwrite": {
    "title": "BigQuery (Read-Write)",
    "description": "Full read-write access to BigQuery.",
    "type": "streamable-http",
    "url": "https://mcp.bigquery.example.com/mcp",
    "oauth": {
      "clientId": "bigquery-mcp-client",
      "scopes": [
        "https://www.googleapis.com/auth/bigquery.readonly",
        "https://www.googleapis.com/auth/bigquery"
      ]
    }
  }
}
```

This enables shareable configurations: a recipient copies the file, authenticates with their own identity, and each entry is scoped correctly via the OAuth consent flow.

**Validation rules:**

- `oauth` is forbidden for `stdio` entries
- `oauth` and `headers` with an `Authorization` key should not both be present on the same entry — use one auth mechanism or the other

### Version Pinning

**Always pin packages to specific versions:**

- **npm**: `@scope/package@0.6.2` (not `@latest` or `@^1.0.0`)
- **PyPI**: `package==0.5.0` (not `package` or `package>=0.5`)
- **OCI**: `image:1.0.2` (not `image:latest`)

Unpinned versions cause security issues and non-deterministic behavior, and make debugging difficult.

### Secret Value Interpolation

All string values support secret value interpolation. The MCP client is responsible for resolving these values at runtime.

Interpolated values are enclosed in `${...}` wrapping and can occur anywhere in a string value, including multiple times in the same string value. The values are encoded as URIs per [RFC 3986](https://www.rfc-editor.org/rfc/rfc3986) with a limited set of defined schemes representing value sources. For environment variables the scheme is "env" and the token would be represented as `${env:ENV_VAR_NAME}`.

Interpolated values can be resolved by pipe chaining multiple URIs, where the first element to resolve to a non-empty value is used. For example: `${env:ENV_VAR_NAME | value:Foo}`.

The use of schemes to represent values other than environment variables allows clients to reference secrets stored in other systems or by other means, while still being shared by multiple clients.

For example, a [OnePassword URI](https://developer.1password.com/docs/cli/secret-reference-syntax/) in the form: `op://<vault-name>/<item-name>/[section-name/]<field-name>` as traditionally used in apps supporting OnePassword, could be used directly and shared by different clients as long as they supported OnePassword and had access to the specified vault. This would be true of any supported secret manager or technology.

As another example, VS Code and related products use a scheme of "input" to specify that the client should collect the value from the user, store it securely, and inject it at runtime. While this does not support sharing of the secret value across clients, it does at least support interoperability as each client understands it is responsible for collecting, securing, and injecting the value. It should be noted that shared secrets is preferred to this method, but "input" is still supported due to its wide use.

#### Initial Schemes

| Scheme  | Description     | Example                       |
| ------- | --------------- | ----------------------------- |
| `env`   | Environment var | `env:ENV_VAR_NAME`            |
| `value` | Literal value   | `value:Foo`                   |
| `input` | Collected value | `input:input_name`            |
| `op`    | OnePassword URI | `op://myVault/theItem/secret` |
| ...     | More to come    |                               |

Interpolation is primarily intended for authentication secrets:

- API keys: `"${env:OPENAI_API_KEY}"`
- Bearer tokens: `"Bearer ${env:AUTH_TOKEN}"`
- Database credentials: `"postgresql://${env:PG_USER}:${env:PG_PASS}@host/db"`

Non-secret values should use literals. The mcp.json file is meant to be a fully-formed configuration — using interpolation for non-secrets undermines that purpose.

## Rationale

In designing this format, the authors conducted a survey of many popular clients, including: Claude Code, VS Code (and related products), Cursor, Goose, Kiro, Codex, RooCode/Cline, and LangChain, in part to determine if there was some broad standardization that could be adopted to work with most or many clients. As stated above, these clients differ in almost all aspects, with no two being fully compatible. For example, even for clients who supported compatible secret interpolation, they often didn't support them in the same set of fields, and only some of them supported Posix-style param expansion for defaults.

For secret interpolation in particular, the desire to support different sources of secret values led to the decision to make the scheme (including "env") explicit.

Since there was no one format that would be broadly compatible with many clients, we decided to focus on creating the most fully specified and unambiguous representation that supported the desired goals and functionality, exposing all client vendors to a comparable (but ideally, small) amount of pain.

## Backward Compatibility

While technically not a backward compatibility concern of MCP itself, since mcp.json has not been part of the spec, most clients use some variation of mcp.json as specified here to manage server configurations, and few, if any, of them will be compatible with the format specified here.

## Security Implications

It should be stated plainly that the mcp.json file presents a significant attack surface. It will frequently be in client or agent writable directories. If clients simply run (or make available) the defined servers they find in an mcp.json they will subject their users to a wide variety of significant attacks, including remote code execution (for stdio servers) and environment/secret exfiltration (for http servers).

In the past, the MCP protocol has been criticized for the mcp.json attack surface (with numerous reported CVEs). But, even though widely adopted, mcp.json was not part of the MCP spec and therefore this entire area has largely been considered a client problem, not an MCP problem. If we standardize mcp.json, it now becomes an MCP problem.

This related SEP details issues with "one-click" installation of servers by clients: [SEP-1024: MCP Client Security Requirements for Local Server Installation](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/1024-mcp-client-security-requirements-for-local-server-.md).

The same consent issues apply to servers discovered in an mcp.json. When a client loads an mcp.json it should require consent for each server discovered and it should store that consent securely. If any part of a server configuration changes, consent must be re-established. If new servers show up on a subsequent load of an mcp.json, the client should identify them and seek consent.

For proper management of interpolated secrets, any secrets represented in the server configuration must be clearly identified in the consent interface, and the consent to use a given secret should be specific to the server for which consent was given.

## Reference Implementation

**TODO** We need to publish a JSON schema that can be used to describe and validate mcp.json as defined in this document.

### Alternatives Considered

We considered directly adopting the VS Code format as it supported the secret value interpolation with multiple providers/schemes, but it was the least compatible format in almost every other way.

We also considered directly adopting the Claude Code format as it is the most widely used and the most compatible, but it lacked the multi-provider secret interpolation support and its POSIX-style param expansion wouldn't have supported multiple values. And while its shape was most consistent with other clients, it still would have broken almost all of them in some way.

### Open Questions

Should value interpolation apply to non-secret configuration values? What are the use-cases?

We need the ability to reference the registry entry or ServerCard used to configure the server originally (where it supplied the configuration shape), in part so that clients can display server configurations with greater UX fidelty, and so that they can reconfigure servers after initial configuration.

Do we need more exhaustive or complete examples of configurations?

Should we support `cwd` in stdio configs?

Should our Security "shoulds" be "MUSTS"?

### Acknowledgments

This topic was discussed at the MCP Maintainers meeting held before the MCP Dev Summit on March 31, 2026 in NYC, where it was agreed by consensus that we should pursue a standard SEP. Many maintainers contributed to that discussion and their comments and concerns were incorporated into this specification.

This specification was inspired by [mcp.json — A Proposed Client-Side Configuration Format](https://github.com/pulsemcp/air/blob/d86c6bf3637276f7c49c33dcbc361628d5a6ac7b/docs/mcp-json-proposal.md).
