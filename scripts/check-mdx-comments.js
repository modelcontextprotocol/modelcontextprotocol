// Checks for JS comments inside MDX export blocks.
// These break Mintlify's production parser even though they work locally.
const fs = require("fs");
const path = require("path");
const { globSync } = require("glob");

const docsDir = path.join(__dirname, "../docs");
const mdxFiles = globSync("**/*.mdx", { cwd: docsDir });

let hasError = false;

for (const file of mdxFiles) {
  const filePath = path.join(docsDir, file);
  const content = fs.readFileSync(filePath, "utf8");

  // Match export blocks (from 'export' to closing '};')
  const exportBlocks = content.match(/^export\s+const\s+\w+[\s\S]*?^};/gm) || [];

  for (const block of exportBlocks) {
    const lines = block.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*\/[\/\*]/.test(lines[i])) {
        console.error(`Error in ${file}: JS comment in MDX export block:`);
        console.error(`  ${lines[i].trim()}`);
        console.error(`JS comments break Mintlify's production parser.`);
        console.error(`Remove the comment or move code to a separate .js file.\n`);
        hasError = true;
      }
    }
  }
}

if (hasError) {
  process.exit(1);
}
