# Plugins

Plugins in this directory package the repository's Agent Skills and MCP servers for use in AI coding agents. Each one is a conformant [Agent Plugins v1.0.0](https://agent-plugins.org) package, so it loads in any client that implements the open plugin format, and each one also ships a Claude Code adapter so it keeps working in the client the plugins were originally written for.

Run `npm run check:plugins` to validate every plugin here. It runs in CI. See [Testing](#testing) for the Claude Code checks that run locally.

## Layout

```text
plugins/<plugin-name>/
├── plugin.json              # Agent Plugins manifest — canonical plugin identity
├── mcp.json                 # Agent Plugins MCP configuration (optional)
├── skills/
│   └── <skill-name>/
│       ├── SKILL.md         # Agent Skills format
│       ├── references/      # optional
│       └── scripts/         # optional
├── .claude-plugin/
│   └── plugin.json          # Claude Code adapter — see below
└── README.md
```

## The portable core

`plugin.json` at the plugin root is the canonical manifest. Its schema is closed: the only permitted fields are `$schema`, `name`, `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`, and `extensions`. Client-specific settings never go at the top level — they belong under a reverse-domain namespace in `extensions`, or in a top-level directory named for that namespace.

`mcp.json` at the plugin root declares MCP servers in the portable format. It uses the spec's transport names (`stdio`, `streamable-http`, `sse`) and the `${PLUGIN_ROOT}` / `${PLUGIN_DATA}` placeholders, which conforming clients expand and supply to plugin subprocesses. MCP configuration must not be inlined into `plugin.json`.

Skills are discovered from `skills/`. Every immediate child directory containing a `SKILL.md` is one skill; nothing deeper is scanned, so a skill nested two levels down is silently invisible to clients. `SKILL.md` follows the [Agent Skills specification](https://agentskills.io/specification): the frontmatter `name` is required and must match its directory name, and `description` is required. Keep frontmatter to the spec's six fields — see below.

## The Claude Code adapter

Claude Code does not read the Agent Plugins manifest (checked against its documentation on 2026-10-21, Claude Code 2.1.306). It looks for its manifest at `.claude-plugin/plugin.json`, so the portable `plugin.json` is invisible to it and the two formats coexist without conflicting.

`.claude-plugin/plugin.json` is therefore an adapter, not a second source of truth. It mirrors the shared metadata and sets `"mcpServers": "./mcp.json"`, which makes Claude Code read the portable MCP configuration directly. Claude Code accepts `streamable-http` as an alias for its own `http` transport and ignores the `$schema` key, so the servers are declared once. `npm run check:plugins` fails if the adapter disagrees with the portable manifest on `name`, `version`, `description`, `author`, `homepage`, `repository`, `license`, or `keywords`, or if `mcpServers` points anywhere other than `./mcp.json`. When you change shared metadata in one file, change the other.

Remove the adapter once Claude Code loads the portable manifest directly.

### Keep skill frontmatter to the six portable fields

Claude Code accepts a large set of `SKILL.md` frontmatter fields, but only `name`, `description`, `license`, `compatibility`, `metadata`, and `allowed-tools` are defined by the Agent Skills specification. The other distribution paths for these skills — the Skills API, claude.ai uploads, and `package_skill.py` — reject any other key with a hard error rather than ignoring it, so a Claude Code-only field makes a skill unpublishable everywhere else. `npm run check:plugins` warns when it finds one.

Express argument expectations in the `description` rather than in frontmatter. Claude Code appends `ARGUMENTS: <value>` to a skill's content when the body has no `$ARGUMENTS` placeholder, so a skill that just needs its argument as prose does not need `arguments` or `argument-hint` declared at all.

### Known deviation: the adapter directory

§8 of the Agent Plugins specification says client-specific files belong in a top-level directory named for a reverse-domain namespace, such as `com.anthropic.claude-code/`. `.claude-plugin/` is not that. Claude Code hardcodes the path and does not define an Agent Plugins extension namespace, so the adapter cannot be moved without breaking it.

This is invisible to conforming clients: `.claude-plugin/` is not a fixed component location, so an Agent Plugins client never reads it, and the portable core validates on its own. The alternative — shipping the adapter as a separate sibling package — would duplicate the skills. Revisit if Claude Code publishes a namespace.

## Adding a plugin

1. Create `plugins/<name>/` with `plugin.json`, using `$schema` `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`. Plugin names are 1–64 characters of lowercase letters, digits, hyphens, and periods, must start and end with an alphanumeric character, and may not contain `--` or `..`.
2. Add skills under `skills/<skill-name>/SKILL.md` and MCP servers in `mcp.json`.
3. Add the Claude Code adapter at `.claude-plugin/plugin.json`, mirroring the shared metadata and setting `"mcpServers": "./mcp.json"` if the plugin has MCP servers.
4. Register the plugin in the repository's marketplace at [`.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json). Its `name` and `description` must match the plugin's manifest.
5. For each new skill, add a directory symlink at `docs/.mintlify/skills/<skill-name>` pointing to `../../../plugins/<plugin-name>/skills/<skill-name>`, so Mintlify's `.well-known/agent-skills/` scan exposes it.
6. Run `npm run check:plugins` and the checks under [Testing](#testing).

## Testing

`npm run check:plugins` covers the portable format and the adapter's agreement with it. Claude Code's own tooling covers what Claude Code will actually load. These need the `claude` CLI, so they run locally rather than in CI:

```bash
# Claude Code's manifest, marketplace, and skill validation. --strict turns warnings into errors.
claude plugin validate ./plugins/mcp-spec --strict
claude plugin validate . --strict

# What Claude Code loads from the plugin: skills, MCP servers, and token cost.
claude --plugin-dir ./plugins/mcp-spec plugin details mcp-spec

# Whether the MCP servers declared in mcp.json connect. Look for the plugin:mcp-spec:* lines.
claude --plugin-dir ./plugins/mcp-spec mcp list
```

`claude plugin validate` warns about a missing icon and privacy policy URL. Those are requirements of the Anthropic plugin directory, not of loading the plugin, and are ignored here.

Codex is the easiest check of the portable core, because it ignores `.claude-plugin/plugin.json` and loads only `plugin.json`, `mcp.json`, and `skills/`. It reads `.claude-plugin/marketplace.json` as a marketplace, so the repository checkout works as one directly:

```bash
# From the repository root. Use owner/repo --ref <branch> to test a pushed branch instead.
codex plugin marketplace add .
codex plugin add mcp-spec@modelcontextprotocol

# The server from mcp.json should be listed as enabled.
codex mcp list

# Remove when done.
codex plugin remove mcp-spec@modelcontextprotocol
codex plugin marketplace remove modelcontextprotocol
```

For other clients, point the client at the plugin directory and confirm it discovers both skills and connects to the `mcp-docs` server. The [agent-plugins-example](https://github.com/agentplugins/agent-plugins-example) repository has a validation checklist for the portable package.
