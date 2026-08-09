# Vendored Agent Plugins schemas

These are verbatim copies of the official [Agent Plugins](https://agent-plugins.org) JSON Schemas, used by `scripts/validate-plugins.ts` (`npm run check:plugins`).

They are vendored rather than fetched because the Agent Plugins specification states that clients "MUST NOT retrieve a schema while loading a plugin" (§5.2, §7.2.1), and because CI must validate offline and deterministically.

| Path                       | Upstream source                                            |
| -------------------------- | ---------------------------------------------------------- |
| `1.0.0/plugin.schema.json` | https://agent-plugins.org/schemas/1.0.0/plugin.schema.json |
| `1.0.0/mcp.schema.json`    | https://agent-plugins.org/schemas/1.0.0/mcp.schema.json    |

## Adding a new specification version

Every Agent Plugins release publishes both schemas under a new version directory, even when a schema's contents are unchanged. To support a new version:

1. Create `<version>/` here and copy both schemas into it, unmodified.
2. Run `npm run check:plugins`. The validator discovers version directories automatically and accepts any `$schema` value matching a vendored version, so no code change is required.
3. Update a plugin to the new version by changing the `$schema` value in both its `plugin.json` and its `mcp.json` — the validator rejects a plugin whose two files target different versions.

Do not edit these files. If a copy drifts from upstream, the validator silently enforces the wrong contract.
