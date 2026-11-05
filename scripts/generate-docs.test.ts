import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(__dirname, "..");

function fixture(t: { after: (fn: () => void) => void }) {
  const directory = mkdtempSync(path.join(tmpdir(), "docs-build-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const dir of [
    "scripts",
    "schema",
    "seps",
    "docs/seps",
    "docs/.mintlify/skills",
    "plugins/example",
  ]) {
    mkdirSync(path.join(directory, dir), { recursive: true });
  }
  for (const file of [
    "generate-docs.ts",
    "render-seps.ts",
    "check-mdx-comments.ts",
  ]) {
    cpSync(
      path.join(root, "scripts", file),
      path.join(directory, "scripts", file),
    );
  }
  symlinkSync(
    path.join(root, "node_modules"),
    path.join(directory, "node_modules"),
    "dir",
  );
  writeFileSync(
    path.join(directory, "docs/docs.source.json"),
    JSON.stringify({ navigation: { tabs: [] } }),
  );
  writeFileSync(
    path.join(directory, "docs/docs.json"),
    "stale generated configuration",
  );
  writeFileSync(
    path.join(directory, "docs/seps/stale.mdx"),
    "stale generated page",
  );
  writeFileSync(path.join(directory, "docs/page.mdx"), "# Example\n");
  writeFileSync(
    path.join(directory, "plugins/example/SKILL.md"),
    "# Example skill\n",
  );
  symlinkSync(
    "../../../plugins/example",
    path.join(directory, "docs/.mintlify/skills/example"),
    "dir",
  );
  return directory;
}

function run(directory: string, script: string, args: string[] = []) {
  return spawnSync(
    process.execPath,
    [
      path.join(root, "node_modules/tsx/dist/cli.mjs"),
      `scripts/${script}`,
      ...args,
    ],
    {
      cwd: directory,
      encoding: "utf8",
    },
  );
}

function snapshot(directory: string): Record<string, string> {
  return Object.fromEntries(
    readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const file = path.join(entry.parentPath, entry.name);
        return [path.relative(directory, file), readFileSync(file, "base64")];
      }),
  );
}

test("builds a repeatable, self-contained bundle without changing source", (t) => {
  const directory = fixture(t);
  const source = snapshot(path.join(directory, "docs"));
  const output = path.join(directory, ".build/docs");
  let result = run(directory, "generate-docs.ts");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(snapshot(path.join(directory, "docs")), source);
  assert.equal(existsSync(path.join(output, "seps/stale.mdx")), false);
  assert.equal(existsSync(path.join(output, "docs.source.json")), false);
  assert.equal(
    readFileSync(
      path.join(output, ".mintlify/skills/example/SKILL.md"),
      "utf8",
    ),
    "# Example skill\n",
  );
  assert.ok(existsSync(path.join(output, "seps/index.mdx")));
  const first = snapshot(output);
  result = run(directory, "generate-docs.ts");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(snapshot(output), first);
  rmSync(path.join(directory, "docs/page.mdx"));
  result = run(directory, "generate-docs.ts");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(path.join(output, "page.mdx")), false);
});

test("propagates schema generator failures", (t) => {
  const directory = fixture(t);
  for (const file of ["typedoc.config.mjs", "typedoc.plugin.mjs"])
    cpSync(path.join(root, file), path.join(directory, file));
  mkdirSync(path.join(directory, "schema/draft"));
  writeFileSync(
    path.join(directory, "schema/draft/schema.mdx"),
    "# Reference\n",
  );
  writeFileSync(
    path.join(directory, "schema/draft/schema.ts"),
    "export interface Broken {",
  );
  const result = run(directory, "generate-docs.ts");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /error|Error/);
});

test("rejects malformed MDX and ESM comments", (t) => {
  const directory = fixture(t);
  const page = path.join(directory, "docs/page.mdx");
  for (const content of [
    "<Unclosed>",
    "export const example = { /* unsupported */ value: 1 };\n",
  ]) {
    writeFileSync(page, content);
    const result = run(directory, "check-mdx-comments.ts");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Invalid MDX or JS comments/);
  }
});
