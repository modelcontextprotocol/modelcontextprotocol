#!/usr/bin/env tsx
/**
 * Validates every plugin under `plugins/` against the Agent Plugins v1 portable
 * package format (https://agent-plugins.org), plus the repository conventions
 * that keep the Claude Code adapter in `.claude-plugin/` in sync with it.
 *
 * Checks performed per plugin:
 * 1. Root `plugin.json` exists and validates against the Agent Plugins manifest schema.
 * 2. Root `mcp.json`, when present, validates against the Agent Plugins MCP schema,
 *    targets the same spec version as `plugin.json`, and satisfies the semantic rules
 *    the JSON Schema cannot express (command tokens, path containment, URL safety).
 * 3. Skills under `skills/` are discoverable where the spec looks for them and their
 *    frontmatter conforms to the Agent Skills specification.
 * 4. The Claude Code adapter (`.claude-plugin/plugin.json`) agrees with the portable
 *    manifest on shared metadata and declares the same MCP servers.
 * 5. `.claude-plugin/marketplace.json` entries point at real plugin directories and
 *    agree with those plugins' manifests.
 *
 * Schemas are vendored under `scripts/schemas/agent-plugins/` because the spec forbids
 * clients from retrieving a schema while loading a plugin, and CI runs offline.
 *
 * Usage: npx tsx scripts/validate-plugins.ts
 */

import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.join(__dirname, "..");
const PLUGINS_DIR = path.join(REPO_ROOT, "plugins");
const MARKETPLACE_PATH = path.join(REPO_ROOT, ".claude-plugin", "marketplace.json");
const AP_SCHEMA_DIR = path.join(__dirname, "schemas", "agent-plugins");

/** Agent Plugins spec versions this repository ships schemas for. */
const SUPPORTED_AP_VERSIONS = fs
  .readdirSync(AP_SCHEMA_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const pluginSchemaId = (v: string) => `https://agent-plugins.org/schemas/${v}/plugin.schema.json`;
const mcpSchemaId = (v: string) => `https://agent-plugins.org/schemas/${v}/mcp.schema.json`;

/** Metadata fields the portable manifest and the Claude Code adapter must agree on. */
const SHARED_MANIFEST_FIELDS = [
  "name",
  "version",
  "description",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
] as const;

/** Claude Code transport name -> Agent Plugins transport name. */
const CLAUDE_TRANSPORTS: Record<string, string> = {
  stdio: "stdio",
  http: "streamable-http",
  sse: "sse",
};

/**
 * The only frontmatter fields defined by the Agent Skills specification. Claude Code
 * accepts many more, but the Skills API, claude.ai uploads, and `package_skill.py`
 * reject any other key with a hard error, so a non-spec field makes a skill
 * unpublishable outside Claude Code.
 */
const AGENT_SKILLS_FRONTMATTER = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
]);

interface Result {
  name: string;
  errors: string[];
  warnings: string[];
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validators = new Map<string, ValidateFunction>();

/** Compiles a vendored schema once; Ajv rejects registering the same `$id` twice. */
function compileVendoredSchema(version: string, file: string): ValidateFunction {
  const key = `${version}/${file}`;
  let validate = validators.get(key);
  if (!validate) {
    const schema = JSON.parse(fs.readFileSync(path.join(AP_SCHEMA_DIR, version, file), "utf-8"));
    validate = ajv.compile(schema);
    validators.set(key, validate);
  }
  return validate;
}

function formatAjvErrors(validate: ValidateFunction, label: string): string[] {
  return (validate.errors ?? []).map((err) => {
    const offender = (err.params as { additionalProperty?: string }).additionalProperty;
    const detail = offender ? `${err.message} ("${offender}")` : err.message;
    return `${label}${err.instancePath || ""}: ${detail}`;
  });
}

function readJson(filePath: string): { value?: unknown; error?: string } {
  try {
    return { value: JSON.parse(fs.readFileSync(filePath, "utf-8")) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Resolves `candidate` against `root` and reports whether it escapes the plugin root. */
function isContained(root: string, candidate: string): boolean {
  const realRoot = fs.realpathSync(root);
  let resolved = path.resolve(realRoot, candidate);
  // Resolve any existing prefix through symlinks before comparing.
  let existing = resolved;
  while (!fs.existsSync(existing) && path.dirname(existing) !== existing) {
    existing = path.dirname(existing);
  }
  if (fs.existsSync(existing)) {
    resolved = path.join(fs.realpathSync(existing), path.relative(existing, resolved));
  }
  const rel = path.relative(realRoot, resolved);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Extracts top-level scalar keys from a `SKILL.md` frontmatter block. Skill
 * validation only needs `name` and `description`, both of which are plain scalars,
 * so this avoids adding a YAML dependency.
 */
function parseFrontmatterScalars(content: string): Record<string, string> | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return null;

  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    // Only top-level, unindented `key: value` pairs.
    const kv = line.match(/^([A-Za-z0-9_-]+):[ \t]*(.*)$/);
    if (!kv) continue;
    let value = kv[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    fields[kv[1]] = value;
  }
  return fields;
}

/** §7.2.1 rules for an MCP server entry that JSON Schema cannot express. */
function validateMcpServer(pluginRoot: string, name: string, server: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const where = `mcp.json /mcpServers/${name}`;

  if (server.type === "stdio") {
    const command = server.command as string;
    if (command.startsWith("./")) {
      // A plugin-relative path may legitimately contain spaces.
      if (!isContained(pluginRoot, command)) {
        errors.push(`${where}: "command" resolves outside the plugin root`);
      }
    } else if (/\s/.test(command)) {
      errors.push(`${where}: "command" must be a single executable token, not a shell command line`);
    } else if (/[/\\]/.test(command)) {
      errors.push(`${where}: a path "command" must be plugin-relative and begin with "./"`);
    }
    if (command.includes("${PLUGIN_ROOT}") || command.includes("${PLUGIN_DATA}")) {
      errors.push(`${where}: placeholders are not expanded in "command"`);
    }

    const cwd = server.cwd as string | undefined;
    if (cwd !== undefined && cwd.startsWith("./") && !isContained(pluginRoot, cwd)) {
      errors.push(`${where}: "cwd" resolves outside the plugin root`);
    }
    if (cwd !== undefined && cwd.startsWith("${PLUGIN_ROOT}")) {
      const rel = cwd.slice("${PLUGIN_ROOT}".length).replace(/^\//, "");
      if (rel && !isContained(pluginRoot, rel)) {
        errors.push(`${where}: "cwd" resolves outside the plugin root`);
      }
    }
    return errors;
  }

  // streamable-http and sse
  let url: URL;
  try {
    url = new URL(server.url as string);
  } catch {
    errors.push(`${where}: "url" is not an absolute URL`);
    return errors;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    errors.push(`${where}: "url" must use http or https`);
  }
  if (url.username || url.password) {
    errors.push(`${where}: "url" must not contain user information`);
  }
  if (url.hash) {
    errors.push(`${where}: "url" must not contain a fragment`);
  }
  const loopback = url.hostname === "localhost" || /^(127\.|\[?::1\]?$)/.test(url.hostname);
  if (url.protocol === "http:" && !loopback) {
    errors.push(`${where}: non-loopback "url" must use HTTPS`);
  }

  const headers = server.headers as Record<string, string> | undefined;
  if (headers) {
    const seen = new Set<string>();
    for (const header of Object.keys(headers)) {
      const lower = header.toLowerCase();
      if (seen.has(lower)) {
        errors.push(`${where}: duplicate header name "${header}" (header names are case-insensitive)`);
      }
      seen.add(lower);
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(header)) {
        errors.push(`${where}: "${header}" is not a valid HTTP header name`);
      }
    }
  }

  return errors;
}

function validateSkills(pluginRoot: string, warnings: string[]): string[] {
  const errors: string[] = [];
  const skillsDir = path.join(pluginRoot, "skills");
  if (!fs.existsSync(skillsDir)) return errors;
  if (!fs.statSync(skillsDir).isDirectory()) {
    return [`skills: exists but is not a directory`];
  }

  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillDir = path.join(skillsDir, entry.name);
    const skillFile = path.join(skillDir, "SKILL.md");

    if (!fs.existsSync(skillFile) || !fs.statSync(skillFile).isFile()) {
      // Not an error under §7.1 — the directory is simply not a skill — but in this
      // repository it is almost always a misplaced or half-added skill.
      warnings.push(`skills/${entry.name}: no SKILL.md, so this directory is not a skill`);
      continue;
    }
    if (!isContained(pluginRoot, path.relative(pluginRoot, skillFile))) {
      errors.push(`skills/${entry.name}/SKILL.md: resolves outside the plugin root`);
      continue;
    }

    const fields = parseFrontmatterScalars(fs.readFileSync(skillFile, "utf-8"));
    const where = `skills/${entry.name}/SKILL.md`;
    if (!fields) {
      errors.push(`${where}: missing YAML frontmatter`);
      continue;
    }
    const name = fields.name;
    if (!name) {
      errors.push(`${where}: frontmatter is missing the required "name" field`);
    } else {
      if (name !== entry.name) {
        errors.push(`${where}: frontmatter name "${name}" must match the directory name "${entry.name}"`);
      }
      if (name.length > 64) {
        errors.push(`${where}: name exceeds 64 characters`);
      }
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
        errors.push(
          `${where}: name must be lowercase letters, numbers, and single hyphens, and must not start or end with a hyphen`
        );
      }
    }
    const description = fields.description;
    if (!description) {
      errors.push(`${where}: frontmatter is missing the required "description" field`);
    } else if (description.length > 1024) {
      errors.push(`${where}: description exceeds 1024 characters`);
    }

    for (const field of Object.keys(fields)) {
      if (!AGENT_SKILLS_FRONTMATTER.has(field)) {
        warnings.push(
          `${where}: "${field}" is not an Agent Skills frontmatter field; the Skills API, claude.ai uploads, and package_skill.py reject it with a hard error`
        );
      }
    }

    // Skills nested deeper than one level are never discovered (§7.1).
    for (const nested of fs.readdirSync(skillDir, { withFileTypes: true })) {
      if (!nested.isDirectory()) continue;
      if (fs.existsSync(path.join(skillDir, nested.name, "SKILL.md"))) {
        errors.push(
          `skills/${entry.name}/${nested.name}/SKILL.md: nested skills are not discovered; move it to skills/${nested.name}/`
        );
      }
    }
  }

  return errors;
}

function equalValues(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The Claude Code adapter must not drift from the portable manifest it mirrors. */
function validateClaudeAdapter(
  pluginRoot: string,
  manifest: Record<string, unknown>,
  mcp: Record<string, unknown> | undefined
): string[] {
  const errors: string[] = [];
  const adapterPath = path.join(pluginRoot, ".claude-plugin", "plugin.json");
  if (!fs.existsSync(adapterPath)) return errors;

  const { value, error } = readJson(adapterPath);
  if (error) return [`.claude-plugin/plugin.json: ${error}`];
  const adapter = value as Record<string, unknown>;

  for (const field of SHARED_MANIFEST_FIELDS) {
    if (!(field in manifest) && !(field in adapter)) continue;
    if (!equalValues(manifest[field], adapter[field])) {
      errors.push(
        `.claude-plugin/plugin.json: "${field}" (${JSON.stringify(adapter[field])}) does not match plugin.json (${JSON.stringify(manifest[field])})`
      );
    }
  }

  const portableServers = (mcp?.mcpServers ?? {}) as Record<string, Record<string, unknown>>;
  const adapterServers = adapter.mcpServers;
  if (adapterServers !== undefined && typeof adapterServers !== "object") {
    // A string or array points at another config file; nothing to cross-check.
    return errors;
  }
  const claudeServers = (adapterServers ?? {}) as Record<string, Record<string, unknown>>;

  for (const name of Object.keys(portableServers)) {
    if (!(name in claudeServers)) {
      errors.push(`.claude-plugin/plugin.json: MCP server "${name}" from mcp.json is missing`);
    }
  }
  for (const [name, claudeServer] of Object.entries(claudeServers)) {
    const portable = portableServers[name];
    if (!portable) {
      errors.push(`mcp.json: MCP server "${name}" from .claude-plugin/plugin.json is missing`);
      continue;
    }
    const mapped = CLAUDE_TRANSPORTS[claudeServer.type as string];
    if (mapped && mapped !== portable.type) {
      errors.push(
        `.claude-plugin/plugin.json: MCP server "${name}" transport "${claudeServer.type}" maps to "${mapped}", but mcp.json declares "${portable.type}"`
      );
    }
    for (const field of ["url", "command"] as const) {
      if (field in portable || field in claudeServer) {
        if (!equalValues(portable[field], claudeServer[field])) {
          errors.push(
            `.claude-plugin/plugin.json: MCP server "${name}" "${field}" does not match mcp.json`
          );
        }
      }
    }
  }

  return errors;
}

function validatePlugin(pluginRoot: string): Result {
  const label = path.relative(REPO_ROOT, pluginRoot).replace(/\\/g, "/");
  const errors: string[] = [];
  const warnings: string[] = [];

  const manifestPath = path.join(pluginRoot, "plugin.json");
  if (!fs.existsSync(manifestPath) || !fs.statSync(manifestPath).isFile()) {
    return { name: label, errors: ["plugin.json: missing at the plugin root"], warnings };
  }

  const { value: manifestValue, error: manifestError } = readJson(manifestPath);
  if (manifestError) {
    return { name: label, errors: [`plugin.json: ${manifestError}`], warnings };
  }
  const manifest = manifestValue as Record<string, unknown>;

  const apVersion = SUPPORTED_AP_VERSIONS.find((v) => manifest.$schema === pluginSchemaId(v));
  if (!apVersion) {
    return {
      name: label,
      errors: [
        `plugin.json: "$schema" must be one of ${SUPPORTED_AP_VERSIONS.map(pluginSchemaId).join(", ")}`,
      ],
      warnings,
    };
  }

  const validateManifest = compileVendoredSchema(apVersion, "plugin.schema.json");
  if (!validateManifest(manifest)) {
    errors.push(...formatAjvErrors(validateManifest, "plugin.json"));
  }

  let mcp: Record<string, unknown> | undefined;
  const mcpPath = path.join(pluginRoot, "mcp.json");
  if (fs.existsSync(mcpPath)) {
    if (!fs.statSync(mcpPath).isFile()) {
      errors.push("mcp.json: exists but is not a regular file");
    } else {
      const { value: mcpValue, error: mcpError } = readJson(mcpPath);
      if (mcpError) {
        errors.push(`mcp.json: ${mcpError}`);
      } else {
        mcp = mcpValue as Record<string, unknown>;
        if (mcp.$schema !== mcpSchemaId(apVersion)) {
          errors.push(
            `mcp.json: "$schema" must be "${mcpSchemaId(apVersion)}" to match the version declared by plugin.json`
          );
          mcp = undefined;
        } else {
          const validateMcp = compileVendoredSchema(apVersion, "mcp.schema.json");
          if (!validateMcp(mcp)) {
            errors.push(...formatAjvErrors(validateMcp, "mcp.json"));
            mcp = undefined;
          } else {
            const servers = mcp.mcpServers as Record<string, Record<string, unknown>>;
            for (const [name, server] of Object.entries(servers)) {
              errors.push(...validateMcpServer(pluginRoot, name, server));
            }
          }
        }
      }
    }
  }

  errors.push(...validateSkills(pluginRoot, warnings));
  errors.push(...validateClaudeAdapter(pluginRoot, manifest, mcp));

  return { name: label, errors, warnings };
}

function validateMarketplace(): Result {
  const label = ".claude-plugin/marketplace.json";
  if (!fs.existsSync(MARKETPLACE_PATH)) return { name: label, errors: [], warnings: [] };

  const { value, error } = readJson(MARKETPLACE_PATH);
  if (error) return { name: label, errors: [error], warnings: [] };

  const errors: string[] = [];
  const entries = ((value as Record<string, unknown>).plugins ?? []) as Record<string, unknown>[];
  for (const entry of entries) {
    const source = entry.source as string | undefined;
    if (typeof source !== "string" || !source.startsWith("./")) continue;

    const pluginRoot = path.join(REPO_ROOT, source);
    const manifestPath = path.join(pluginRoot, "plugin.json");
    if (!fs.existsSync(manifestPath)) {
      errors.push(`"${entry.name}": source "${source}" has no plugin.json`);
      continue;
    }
    const { value: manifestValue, error: manifestError } = readJson(manifestPath);
    if (manifestError) continue; // Already reported by the per-plugin check.
    const manifest = manifestValue as Record<string, unknown>;

    if (entry.name !== manifest.name) {
      errors.push(`"${entry.name}": name does not match plugin.json name "${manifest.name}"`);
    }
    if (entry.description !== undefined && entry.description !== manifest.description) {
      errors.push(`"${entry.name}": description does not match plugin.json description`);
    }
  }

  return { name: label, errors, warnings: [] };
}

function main() {
  console.log("Validating plugins against the Agent Plugins v1 format...\n");

  if (!fs.existsSync(PLUGINS_DIR)) {
    console.log("No plugins/ directory; nothing to validate.");
    return;
  }

  const results = fs
    .readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => validatePlugin(path.join(PLUGINS_DIR, d.name)));

  results.push(validateMarketplace());

  let passed = 0;
  let failed = 0;
  let warned = 0;
  for (const { name, errors, warnings } of results) {
    if (errors.length === 0) {
      console.log(`✓ ${name}`);
      passed += 1;
    } else {
      console.log(`✗ ${name}`);
      for (const err of errors) {
        console.log(`    ${err}`);
      }
      failed += 1;
    }
    for (const warning of warnings) {
      console.log(`  ! ${warning}`);
      warned += 1;
    }
  }

  const warningSummary = warned > 0 ? `, ${warned} warning${warned === 1 ? "" : "s"}` : "";
  console.log(`\nResults: ${passed} passed, ${failed} failed${warningSummary}`);

  if (failed > 0) process.exit(1);
}

main();
