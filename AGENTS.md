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

## Commit Guidelines

- Do not include model names or details (e.g., "Claude", "Opus") in commit messages
