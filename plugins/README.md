# Plugins

Plugins in this directory package the repository's Agent Skills and MCP servers for use in AI coding agents. Each one is a conformant [Agent Plugins v1.0.0](https://agent-plugins.org) package, so it loads in any client that implements the open plugin format, and each one also ships a Claude Code adapter so it keeps working in the client the plugins were originally written for.

Run `npm run check:plugins` to validate every plugin here. It runs in CI.

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

Claude Code does not yet read the Agent Plugins format. It looks for its manifest at `.claude-plugin/plugin.json` and for MCP configuration at `.mcp.json` or inline in that manifest, so the portable `plugin.json` and `mcp.json` are invisible to it and the two formats coexist without conflicting.

`.claude-plugin/plugin.json` is therefore an adapter, not a second source of truth. It exists to carry Claude Code's MCP transport names (`http` where the portable format says `streamable-http`) and any Claude-specific fields. `npm run check:plugins` fails if it disagrees with the portable manifest on `name`, `version`, `description`, `author`, `homepage`, `repository`, `license`, or `keywords`, or if the two files declare different MCP servers. When you change one, change the other.

Remove the adapter once Claude Code loads the portable format directly.

### Keep skill frontmatter to the six portable fields

Claude Code accepts a large set of `SKILL.md` frontmatter fields, but only `name`, `description`, `license`, `compatibility`, `metadata`, and `allowed-tools` are defined by the Agent Skills specification. The other distribution paths for these skills — the Skills API, claude.ai uploads, and `package_skill.py` — reject any other key with a hard error rather than ignoring it, so a Claude Code-only field makes a skill unpublishable everywhere else. `npm run check:plugins` warns when it finds one.

Express argument expectations in the `description` rather than in frontmatter. Claude Code appends `ARGUMENTS: <value>` to a skill's content when the body has no `$ARGUMENTS` placeholder, so a skill that just needs its argument as prose does not need `arguments` or `argument-hint` declared at all.

### Known deviation: the adapter directory

§8 of the Agent Plugins specification says client-specific files belong in a top-level directory named for a reverse-domain namespace, such as `com.anthropic.claude-code/`. `.claude-plugin/` is not that. Claude Code hardcodes the path and does not define an Agent Plugins extension namespace, so the adapter cannot be moved without breaking it.

This is invisible to conforming clients: `.claude-plugin/` is not a fixed component location, so an Agent Plugins client never reads it, and the portable core validates on its own. The alternative — shipping the adapter as a separate sibling package — would duplicate the skills. Revisit if Claude Code publishes a namespace.

## Adding a plugin

1. Create `plugins/<name>/` with `plugin.json`, using `$schema` `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`. Plugin names are 1–64 characters of lowercase letters, digits, hyphens, and periods, must start and end with an alphanumeric character, and may not contain `--` or `..`.
2. Add skills under `skills/<skill-name>/SKILL.md` and MCP servers in `mcp.json`.
3. Add the Claude Code adapter at `.claude-plugin/plugin.json`, mirroring the shared metadata.
4. Register the plugin in the repository's marketplace at [`.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json). Its `name` and `description` must match the plugin's manifest.
5. For each new skill, add a directory symlink at `docs/.mintlify/skills/<skill-name>` pointing to `../../../plugins/<plugin-name>/skills/<skill-name>`, so Mintlify's `.well-known/agent-skills/` scan exposes it.
6. Run `npm run check:plugins`.
