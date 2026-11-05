import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(__dirname, "..");

test("MDX validation rejects parser errors and ESM comments", (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "mdx-check-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const [content, expected] of [
    ["# Valid page\n", 0],
    ["<Unclosed>", 1],
    ["export const example = { /* unsupported */ value: 1 };\n", 1],
  ] as const) {
    writeFileSync(path.join(directory, "page.mdx"), content);
    const result = spawnSync(
      process.execPath,
      [
        path.join(root, "node_modules/tsx/dist/cli.mjs"),
        path.join(root, "scripts/check-mdx-comments.ts"),
        directory,
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, expected, result.stderr);
    if (expected !== 0)
      assert.match(result.stderr, /Invalid MDX or JS comments/);
  }
});
