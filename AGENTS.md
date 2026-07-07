# Model Context Protocol (MCP)

This repository contains the MCP specification, documentation, and blog.

## Documentation Structure

- `docs/` - Mintlify site (`npm run serve:docs`)
  - `docs/docs/` - guides and tutorials
  - `docs/specification/` - MCP specification (more formal, versioned)
- `blog/` - Hugo blog (`npm run serve:blog`)

### Documentation Guidelines

- When creating flowcharts, and graphs to visualize aspect of the protocol, use mermaid diagrams where
  possible.
- When writing tables, ensure column headers and columns are aligned with whitespace.
- Before pushing or creating PR's ensure that `npm run prep` is free of warnings and errors.

## Specification Versioning

Specifications use **date-based versioning** (YYYY-MM-DD), not semantic versioning:

- `schema/[YYYY-MM-DD]/` and `docs/specification/[YYYY-MM-DD]/` - released versions
- `schema/draft/` and `docs/specification/draft/` - in-progress work

## Schema Generation

TypeScript files are the **source of truth** for the protocol schema:

- Edit: `schema/[version]/schema.ts`
- Generate JSON + docs: `npm run generate:schema`
- This creates both `schema/[version]/schema.json` and the Schema Reference document in `docs/specification/[version]/schema.mdx`

Always regenerate after editing schema files.

## Schema Examples

JSON examples live in `schema/[version]/examples/[TypeName]/`:

- Directory name = schema type (e.g., `Tool/`, `Resource/`)
- Files validate against their directory's type: `Tool/example-name.json` → Tool schema
- Referenced in `schema.ts` via `@includeCode` JSDoc tags

## Agent Skills

When adding a new skill, also add a directory symlink at `docs/.mintlify/skills/<name>` pointing to `../../../plugins/<plugin-name>/skills/<name>` so Mintlify's `.well-known/agent-skills/` and MCP server auto-scan exposes it.

## Useful Commands

```bash
# Dev servers
npm run serve:docs       # Local Mintlify docs server
npm run serve:blog       # Local Hugo blog server

# Generation (run after editing source files)
npm run generate         # Generate all (schema + SEPs)
npm run generate:schema  # Generate JSON schemas + MDX from TypeScript
npm run generate:seps    # Generate SEP documents

# Formatting
npm run format           # Format all (docs + schema)
npm run format:docs      # Format markdown/MDX files
npm run format:schema    # Format schema TypeScript files

# Checks
npm run check            # Run all checks
npm run check:schema     # Check schema (TS, JSON, examples, MDX)
npm run check:docs       # Check docs (format, comments, links)
npm run check:seps       # Check SEP documents

# Workflow
npm run prep             # Full prep before committing (check, generate, format)
```

## Issue Creation

Blank issues are disabled. `gh issue create` and the API bypass the template
chooser, so when filing via CLI or API you **must** use one of the forms in
`.github/ISSUE_TEMPLATE/` and fill in its required fields.

Before filing, check `.github/ISSUE_TEMPLATE/config.yml` — some categories
are redirected out of this repo entirely:

- **SEPs** are pull requests adding a file to `seps/`, not issues
- **SDK bugs** belong in the individual SDK repository
- **Claude MCP behavior** belongs in `anthropics/claude-ai-mcp`

## Commit Guidelines

- Do not include model names or details (e.g., "Claude", "Opus") in commit messages

## For AI coding agents

- **Purpose:** Quick, actionable guidance for assistants working in this repo.
- **Quick start:**
  - Install dependencies: `npm install`
  - Run full validation + generation: `npm run prep`
  - Useful targets: `npm run generate:schema`, `npm run check`, `npm run format`
- **Key locations:**
  - Schema source (source-of-truth): [schema/2025-11-25/schema.ts](schema/2025-11-25/schema.ts)
  - Generated schema/docs: [schema/*/schema.json](schema/2025-11-25/schema.json) and [docs/specification](docs/specification)
  - SEPs: [seps/](seps/)
  - Doc site: [docs/](docs/) (Mintlify)
  - Generation scripts: [scripts/](scripts/)
- **Conventions & pitfalls:**
  - Schemas use date-based versioning. Edit the TypeScript source, then run `npm run generate`.
  - Always run `npm run check:schema:md` after schema changes to keep generated MDX in sync.
  - Do not duplicate documentation — link to existing pages (see `docs/` and `CONTRIBUTING.md`).
- **PR guidance:**
  - SEPs are submitted as PRs that add files under `seps/`.
  - Use the templates in `.github/ISSUE_TEMPLATE/` when filing issues.
- **Where to look first:** `README.md`, `CONTRIBUTING.md`, `package.json`, and `AGENTS.md` itself for workflow and commands.

