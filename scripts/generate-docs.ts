#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const source = path.join(root, "docs");
const output = path.join(root, ".build/docs");
const bin = (name: string) => path.join(root, "node_modules/.bin", name);

// Start clean so removed pages cannot survive in a later deployment.
rmSync(output, { recursive: true, force: true });
cpSync(source, output, {
  recursive: true,
  dereference: true, // Published skills must be files, not links outside the bundle.
  filter: (file) => {
    const relative = path.relative(source, file).split(path.sep).join("/");
    return !(
      relative === "docs.json" ||
      relative === "docs.source.json" ||
      relative === "seps" ||
      /^specification\/[^/]+\/schema\.mdx?$/.test(relative)
    );
  },
});

// Historical schemas without a page template have no generated reference page.
for (const version of readdirSync(path.join(root, "schema")).sort()) {
  const template = path.join(root, "schema", version, "schema.mdx");
  if (!existsSync(template)) continue;
  const page = execFileSync(
    bin("typedoc"),
    [
      "--entryPoints",
      path.join(root, "schema", version, "schema.ts"),
      "--schemaPageTemplate",
      template,
    ],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  if (!page.trim()) throw new Error(`Empty schema page: ${version}`);
  const directory = path.join(output, "specification", version);
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "schema.mdx"), page);
}

execFileSync(bin("tsx"), ["scripts/render-seps.ts", "--output-dir", output], {
  cwd: root,
  stdio: "inherit",
});
console.log("Website content generated in .build/docs/");
