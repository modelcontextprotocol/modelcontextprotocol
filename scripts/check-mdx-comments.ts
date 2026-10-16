#!/usr/bin/env tsx

// Checks for JS comments inside MDX ESM blocks (imports / exports) because they
// break Mintlify's production parser even though they work locally.
//
// Uses remark-parse + remark-mdx (the same parser MDX uses) to reliably detect
// comments.

import { readFile } from "fs/promises";
import { glob } from "glob";
import { dirname, join } from "path";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const mdxFiles = await glob("docs/**/*.mdx", { cwd: join(__dirname, "..") });

  process.stdout.write(
    `Checking ${mdxFiles.length} MDX files for JS comments in ESM blocks... `
  );

  const parser = unified().use(remarkParse).use(remarkMdx);

  const promises = mdxFiles.map(async (file) => {
    const content = await readFile(join(__dirname, "..", file), "utf8");

    let tree;
    try {
      tree = parser.parse(content);
    } catch {
      return []; // Parse error -- let other checks catch it
    }

    const locations: string[] = [];
    for (const node of tree.children) {
      if (node.type === "mdxjsEsm") {
        const comments = node.data?.estree?.comments || [];

        for (const comment of comments) {
          const line = comment.loc?.start?.line;
          locations.push(line ? `${file}:${line}` : file);
        }
      }
    }
    return locations;
  });

  const commentLocations = (await Promise.all(promises)).flat();

  if (commentLocations.length > 0) {
    console.error("\nError: JS comments found in MDX ESM blocks:\n");
    for (const loc of commentLocations) {
      console.error(`- ${loc}`);
    }
    console.error("\nJS comments break Mintlify's production MDX parser.");
    process.exit(1);
  } else {
    console.log("OK");
  }
}

main();
