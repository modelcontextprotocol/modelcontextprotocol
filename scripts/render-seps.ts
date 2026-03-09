#!/usr/bin/env tsx
/**
 * Script to render SEPs (Specification Enhancement Proposals) into Mintlify docs format.
 *
 * This script:
 * 1. Reads all SEP markdown files from the seps/ directory
 * 2. Parses their metadata (title, status, type, authors, etc.)
 * 3. Generates an index page with a tabular overview
 * 4. Generates individual MDX files for each SEP in docs/community/seps/
 *
 * Usage: npx tsx scripts/render-seps.ts [--check]
 *   --check: Verify generated files are up to date (exit 1 if not)
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const SEPS_DIR = path.join(__dirname, "..", "seps");
const DOCS_SEPS_DIR = path.join(__dirname, "..", "docs", "community", "seps");
const DOCS_JSON_PATH = path.join(__dirname, "..", "docs", "docs.json");

interface SEPMetadata {
  number: string;
  title: string;
  status: string;
  type: string;
  created: string;
  accepted?: string;
  authors: string;
  sponsor: string;
  prNumber: string;
  slug: string;
  filename: string;
}

/**
 * Parse SEP metadata from markdown content
 */
function parseSEPMetadata(content: string, filename: string): SEPMetadata | null {
  // Skip template and README files
  if (filename === "TEMPLATE.md" || filename === "README.md") {
    return null;
  }

  // Extract SEP number and slug from filename (e.g., "1850-pr-based-sep-workflow.md")
  const filenameMatch = filename.match(/^(\d+)-(.+)\.md$/);
  if (!filenameMatch) {
    // Skip files that don't match SEP naming convention (like 0000-*.md drafts)
    if (filename.match(/^0000-/)) {
      return null;
    }
    console.warn(`Warning: Skipping ${filename} - doesn't match SEP naming convention`);
    return null;
  }

  const [, number, slug] = filenameMatch;

  // Parse title from first heading
  const titleMatch = content.match(/^#\s+SEP-\d+:\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : "Untitled";

  // Parse metadata fields using regex
  const statusMatch = content.match(/^\s*-\s*\*\*Status\*\*:\s*(.+)$/m);
  const typeMatch = content.match(/^\s*-\s*\*\*Type\*\*:\s*(.+)$/m);
  const createdMatch = content.match(/^\s*-\s*\*\*Created\*\*:\s*(.+)$/m);
  const acceptedMatch = content.match(/^\s*-\s*\*\*Accepted\*\*:\s*(.+)$/m);
  const authorsMatch = content.match(/^\s*-\s*\*\*Author\(s\)\*\*:\s*(.+)$/m);
  const sponsorMatch = content.match(/^\s*-\s*\*\*Sponsor\*\*:\s*(.+)$/m);
  const prMatch = content.match(/^\s*-\s*\*\*PR\*\*:.*?(?:#|\/pull\/)(\d+)/m);

  return {
    number,
    title,
    status: statusMatch ? statusMatch[1].trim() : "Unknown",
    type: typeMatch ? typeMatch[1].trim() : "Unknown",
    created: createdMatch ? createdMatch[1].trim() : "Unknown",
    accepted: acceptedMatch ? acceptedMatch[1].trim() : undefined,
    authors: authorsMatch ? authorsMatch[1].trim() : "Unknown",
    sponsor: sponsorMatch ? sponsorMatch[1].trim() : "None",
    prNumber: prMatch ? prMatch[1] : number,
    slug,
    filename,
  };
}

/**
 * Convert GitHub usernames to links
 */
function formatAuthors(authors: string): string {
  return authors.replace(/@([\w-]+)/g, "[@$1](https://github.com/$1)");
}

/**
 * Format PR number as a GitHub link
 */
function formatPrLink(prNumber: string): string {
  return `[#${prNumber}](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/${prNumber})`;
}

/**
 * Truncate title to max length, adding ellipsis if needed
 */
function truncateTitle(title: string, maxLength: number): string {
  if (title.length <= maxLength) return title;
  return title.slice(0, maxLength - 1).trim() + "…";
}

/**
 * Get status badge color for Mintlify
 */
function getStatusBadgeColor(status: string): string {
  const statusLower = status.toLowerCase();
  if (statusLower === "final") return "green";
  if (statusLower === "accepted") return "blue";
  if (statusLower === "in-review") return "yellow";
  if (statusLower === "draft") return "gray";
  if (statusLower === "rejected" || statusLower === "withdrawn") return "red";
  if (statusLower === "dormant") return "orange";
  if (statusLower === "superseded") return "purple";
  return "gray";
}

/**
 * Generate MDX content for a single SEP page
 */
function generateSEPPage(sep: SEPMetadata, originalContent: string): string {
  // Remove the header metadata section and title from original content for the body
  // Find where the Abstract section starts
  const abstractIndex = originalContent.indexOf("## Abstract");
  const body = abstractIndex !== -1 ? originalContent.slice(abstractIndex) : originalContent;

  return `---
title: "SEP-${sep.number}: ${sep.title}"
sidebarTitle: "SEP-${sep.number}: ${truncateTitle(sep.title, 40)}"
description: "${sep.title}"
---

<div className="flex items-center gap-2 mb-4">
  <Badge color="${getStatusBadgeColor(sep.status)}" shape="pill">${sep.status}</Badge>
  <Badge color="gray" shape="pill">${sep.type}</Badge>
</div>

| Field | Value |
|-------|-------|
| **SEP** | ${sep.number} |
| **Title** | ${sep.title} |
| **Status** | ${sep.status} |
| **Type** | ${sep.type} |
| **Created** | ${sep.created} |
${sep.accepted ? `| **Accepted** | ${sep.accepted} |\n` : ""}| **Author(s)** | ${formatAuthors(sep.authors)} |
| **Sponsor** | ${formatAuthors(sep.sponsor)} |
| **PR** | ${formatPrLink(sep.prNumber)} |

---

${body}
`;
}

/**
 * Generate the SEP index page with tabular overview
 */
function generateIndexPage(seps: SEPMetadata[]): string {
  // Sort SEPs by number (descending - newest first)
  const sortedSeps = [...seps].sort((a, b) => parseInt(b.number) - parseInt(a.number));

  // Group by status for summary
  const byStatus = sortedSeps.reduce(
    (acc, sep) => {
      const status = sep.status.toLowerCase();
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Generate table rows
  const tableRows = sortedSeps
    .map((sep) => {
      const statusBadge = `<Badge color="${getStatusBadgeColor(sep.status)}" shape="pill">${sep.status}</Badge>`;
      return `| [SEP-${sep.number}](/community/seps/${sep.number}-${sep.slug}) | ${sep.title} | ${statusBadge} | ${sep.type} | ${sep.created} |`;
    })
    .join("\n");

  // Generate status summary
  const statusSummary = Object.entries(byStatus)
    .map(([status, count]) => `- **${status.charAt(0).toUpperCase() + status.slice(1)}**: ${count}`)
    .join("\n");

  return `---
title: Specification Enhancement Proposals (SEPs)
sidebarTitle: SEP Index
description: Index of all MCP Specification Enhancement Proposals
---

Specification Enhancement Proposals (SEPs) are the primary mechanism for proposing major changes to the Model Context Protocol. Each SEP provides a concise technical specification and rationale for proposed features.

<Card title="Submit a SEP" icon="file-plus" href="/community/sep-guidelines">
  Learn how to submit your own Specification Enhancement Proposal
</Card>

## Summary

${statusSummary}

## All SEPs

| SEP | Title | Status | Type | Created |
|-----|-------|--------|------|---------|
${tableRows}

## SEP Status Definitions

| Status | Definition |
| --- | --- |
| <Badge color="gray" shape="pill">Draft</Badge> | SEP proposal with a sponsor, undergoing informal review |
| <Badge color="yellow" shape="pill">In-Review</Badge> | SEP proposal ready for formal review by Core Maintainers |
| <Badge color="blue" shape="pill">Accepted</Badge> | SEP accepted, awaiting reference implementation |
| <Badge color="green" shape="pill">Final</Badge> | SEP finalized with reference implementation complete |
| <Badge color="red" shape="pill">Rejected</Badge> | SEP rejected by Core Maintainers |
| <Badge color="red" shape="pill">Withdrawn</Badge> | SEP withdrawn by the author |
| <Badge color="purple" shape="pill">Superseded</Badge> | SEP replaced by a newer SEP |
| <Badge color="orange" shape="pill">Dormant</Badge> | SEP without a sponsor, closed after 6 months |
`;
}

/**
 * Read all SEP files and parse their metadata
 */
function readAllSEPs(): { metadata: SEPMetadata; content: string }[] {
  const files = fs.readdirSync(SEPS_DIR).filter((f) => f.endsWith(".md"));
  const seps: { metadata: SEPMetadata; content: string }[] = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(SEPS_DIR, file), "utf-8");
    const metadata = parseSEPMetadata(content, file);
    if (metadata) {
      seps.push({ metadata, content });
    }
  }

  return seps;
}

/**
 * Group SEPs by status for navigation
 */
function groupSepsByStatus(seps: SEPMetadata[]): Record<string, SEPMetadata[]> {
  const groups: Record<string, SEPMetadata[]> = {};

  // Define status order for navigation
  const statusOrder = ["Final", "Accepted", "In-Review", "Draft", "Withdrawn", "Rejected", "Superseded", "Dormant"];

  for (const sep of seps) {
    // Normalize status to title case
    const status = sep.status.charAt(0).toUpperCase() + sep.status.slice(1).toLowerCase();
    if (!groups[status]) {
      groups[status] = [];
    }
    groups[status].push(sep);
  }

  // Sort each group by SEP number
  for (const status of Object.keys(groups)) {
    groups[status].sort((a, b) => parseInt(a.number) - parseInt(b.number));
  }

  // Return in preferred order
  const orderedGroups: Record<string, SEPMetadata[]> = {};
  for (const status of statusOrder) {
    if (groups[status]) {
      orderedGroups[status] = groups[status];
    }
  }
  // Add any remaining statuses not in the predefined order
  for (const status of Object.keys(groups)) {
    if (!orderedGroups[status]) {
      orderedGroups[status] = groups[status];
    }
  }

  return orderedGroups;
}

/**
 * Update docs.json to include SEPs in navigation, grouped by status
 */
function updateDocsJson(seps: SEPMetadata[]): string {
  const docsJson = JSON.parse(fs.readFileSync(DOCS_JSON_PATH, "utf-8"));

  // Group SEPs by status
  const groupedSeps = groupSepsByStatus(seps);

  // Build nested navigation structure
  const sepSubgroups: Array<string | { group: string; pages: string[] }> = [];

  for (const [status, statusSeps] of Object.entries(groupedSeps)) {
    if (statusSeps.length === 0) continue;

    const pages = statusSeps.map((sep) => `community/seps/${sep.number}-${sep.slug}`);

    sepSubgroups.push({
      group: status,
      pages,
    });
  }

  // Find the Community tab and add/update SEPs group
  const communityTab = docsJson.navigation.tabs.find((tab: { tab: string }) => tab.tab === "Community");
  if (communityTab) {
    // Check if SEPs group already exists
    const sepsGroupIndex = communityTab.pages.findIndex(
      (item: { group?: string } | string) => typeof item === "object" && item.group === "SEPs"
    );

    const sepsGroup = {
      group: "SEPs",
      pages: ["community/seps/index", ...sepSubgroups],
    };

    if (sepsGroupIndex >= 0) {
      communityTab.pages[sepsGroupIndex] = sepsGroup;
    } else {
      // Insert after Governance group (index 1)
      communityTab.pages.splice(2, 0, sepsGroup);
    }
  }

  return JSON.stringify(docsJson, null, 2) + "\n";
}

/**
 * Main function
 */
async function main() {
  const checkMode = process.argv.includes("--check");

  console.log("Reading SEP files...");
  const seps = readAllSEPs();
  console.log(`Found ${seps.length} SEP(s)`);

  if (seps.length === 0) {
    console.log("No SEPs found to render.");
    return;
  }

  // Ensure output directory exists
  if (!fs.existsSync(DOCS_SEPS_DIR)) {
    fs.mkdirSync(DOCS_SEPS_DIR, { recursive: true });
  }

  // Track all expected files for check mode
  const expectedFiles: { path: string; content: string }[] = [];

  // Generate index page
  const indexPath = path.join(DOCS_SEPS_DIR, "index.mdx");
  const indexContent = generateIndexPage(seps.map((s) => s.metadata));
  expectedFiles.push({ path: indexPath, content: indexContent });

  // Generate individual SEP pages
  for (const { metadata, content } of seps) {
    const sepPath = path.join(DOCS_SEPS_DIR, `${metadata.number}-${metadata.slug}.mdx`);
    const sepContent = generateSEPPage(metadata, content);
    expectedFiles.push({ path: sepPath, content: sepContent });
  }

  // Generate updated docs.json
  const docsJsonContent = updateDocsJson(seps.map((s) => s.metadata));
  expectedFiles.push({ path: DOCS_JSON_PATH, content: docsJsonContent });

  if (checkMode) {
    // Check mode: verify all files match expected content (after formatting)
    // Write to temp files, format with Prettier, then compare
    const tempDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "seps-check-"));
    let hasChanges = false;

    try {
      // Write expected content to temp files
      const tempFiles: { original: string; temp: string }[] = [];
      for (const { path: filePath, content } of expectedFiles) {
        const tempPath = path.join(tempDir, path.basename(filePath));
        fs.writeFileSync(tempPath, content, "utf-8");
        tempFiles.push({ original: filePath, temp: tempPath });
      }

      // Format MDX files with Prettier
      const mdxTempFiles = tempFiles.filter(({ temp }) => temp.endsWith(".mdx")).map(({ temp }) => temp);
      if (mdxTempFiles.length > 0) {
        execSync(`npx prettier --write ${mdxTempFiles.join(" ")}`, { stdio: "pipe" });
      }

      // Compare formatted temp files with existing files
      for (const { original, temp } of tempFiles) {
        if (!fs.existsSync(original)) {
          console.error(`Missing file: ${original}`);
          hasChanges = true;
          continue;
        }
        const existing = fs.readFileSync(original, "utf-8");
        const formatted = fs.readFileSync(temp, "utf-8");
        if (existing !== formatted) {
          console.error(`File out of date: ${original}`);
          hasChanges = true;
        }
      }
    } finally {
      // Clean up temp directory
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    if (hasChanges) {
      console.error("\nSEP documentation is out of date. Run 'npm run generate:seps' to update.");
      process.exit(1);
    }
    console.log("All SEP documentation is up to date.");
  } else {
    // Write mode: generate all files
    for (const { path: filePath, content } of expectedFiles) {
      fs.writeFileSync(filePath, content, "utf-8");
      console.log(`Generated: ${path.relative(process.cwd(), filePath)}`);
    }

    // Format generated files with Prettier
    const filesToFormat = expectedFiles
      .filter(({ path: p }) => p.endsWith(".mdx"))
      .map(({ path: p }) => path.relative(process.cwd(), p));
    if (filesToFormat.length > 0) {
      console.log("\nFormatting generated files with Prettier...");
      execSync(`npx prettier --write ${filesToFormat.join(" ")}`, { stdio: "inherit" });
    }

    console.log("\nSEP documentation generated successfully!");
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
