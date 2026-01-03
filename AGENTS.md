# Model Context Protocol (MCP)

This repository contains the MCP specification, documentation, and blog.

## Documentation Structure

- `docs/` - Mintlify site (`npm run serve:docs`)
  - `docs/docs/` - guides and tutorials
  - `docs/specification/` - MCP specification (more formal, versioned)
- `blog/` - Hugo blog (`npm run serve:blog`)

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
npm run serve:docs       # Local Mintlify docs server
npm run serve:blog       # Local Hugo blog server
npm run generate:schema  # Generate JSON schemas + MDX from TypeScript
npm run check:docs       # Check formatting and links
npm run check            # Run all checks
```
