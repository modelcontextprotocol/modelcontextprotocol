#!/usr/bin/env node

/**
 * Migration script to convert SEP GitHub issues to the new seps/ markdown format.
 *
 * This script:
 * 1. Fetches all SEP issues with accepted, accepted-with-changes, or final status
 * 2. Converts them to the new SEP markdown format
 * 3. Saves them as files in the seps/ directory with the format SEP-{number}-{title}.md
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Status mappings from issue labels to SEP statuses
const STATUS_MAPPING = {
  'accepted': 'Accepted',
  'accepted-with-changes': 'Accepted',
  'final': 'Final',
  'draft': 'Draft',
  'in-review': 'In-Review'
};

// Fetch all SEP issues from GitHub
function fetchSEPIssues() {
  console.log('Fetching SEP issues from GitHub...');

  const result = execSync(
    'gh issue list --label SEP --state all --limit 500 --json number,title,state,labels,body,createdAt,closedAt,author',
    { encoding: 'utf-8' }
  );

  return JSON.parse(result);
}

// Determine SEP status from labels
function getStatusFromLabels(labels) {
  const labelNames = labels.map(l => l.name.toLowerCase());

  // Check for status labels in priority order
  if (labelNames.includes('final')) return 'Final';
  if (labelNames.includes('accepted-with-changes')) return 'Accepted';
  if (labelNames.includes('accepted')) return 'Accepted';
  if (labelNames.includes('in-review')) return 'In-Review';
  if (labelNames.includes('draft')) return 'Draft';
  if (labelNames.includes('proposal')) return 'Draft';

  return null;
}

// Check if issue should be migrated (has accepted, accepted-with-changes, or final status)
function shouldMigrate(issue) {
  const status = getStatusFromLabels(issue.labels);
  return status && ['Accepted', 'Final'].includes(status);
}

// Extract metadata from issue body
function parseIssueBody(body, issue) {
  if (!body) return null;

  const metadata = {
    title: issue.title.replace(/^\[?SEP-\d+\]?:?\s*/i, ''),
    status: getStatusFromLabels(issue.labels),
    type: 'Standards Track',
    created: issue.createdAt ? issue.createdAt.split('T')[0] : new Date().toISOString().split('T')[0],
    author: issue.author ? issue.author.login : 'Unknown',
    sponsor: null,
    pr: null
  };

  // Try to extract metadata from the body
  const lines = body.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Extract type
    if (trimmed.match(/\*?\*?Type\*?\*?:/i)) {
      const match = trimmed.match(/Type\*?\*?:\s*(.+)/i);
      if (match) metadata.type = match[1].trim();
    }

    // Extract author(s)
    if (trimmed.match(/\*?\*?Authors?\*?\*?:/i)) {
      const match = trimmed.match(/Authors?\*?\*?:\s*(.+)/i);
      if (match) metadata.author = match[1].trim();
    }

    // Extract sponsor
    if (trimmed.match(/\*?\*?Sponsor\*?\*?:/i)) {
      const match = trimmed.match(/Sponsor\*?\*?:\s*(.+)/i);
      if (match) metadata.sponsor = match[1].trim();
    }

    // Extract PR number
    if (trimmed.match(/\*?\*?PR\*?\*?:/i)) {
      const match = trimmed.match(/PR\*?\*?:\s*#?(\d+)/i);
      if (match) metadata.pr = match[1];
    }

    // Extract created date
    if (trimmed.match(/\*?\*?Created\*?\*?:/i)) {
      const match = trimmed.match(/Created\*?\*?:\s*(\d{4}-\d{2}-\d{2})/i);
      if (match) metadata.created = match[1];
    }
  }

  return metadata;
}

// Clean up the body content (remove preamble/metadata section)
function cleanBodyContent(body) {
  if (!body) return '';

  // Remove the preamble/metadata section at the start
  const lines = body.split('\n');
  let inPreamble = false;
  let preambleEnded = false;
  const contentLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Detect preamble start
    if (!preambleEnded && (trimmed.match(/^##?\s*Preamble/i) || trimmed.match(/^#\s*SEP-/))) {
      inPreamble = true;
      continue;
    }

    // Detect preamble end (next major section)
    if (inPreamble && trimmed.match(/^##\s*(Abstract|Motivation|Specification|Overview)/i)) {
      inPreamble = false;
      preambleEnded = true;
    }

    // Skip preamble lines and metadata lines
    if (inPreamble) continue;
    if (!preambleEnded && trimmed.match(/^[-*]\s*\*?\*?(SEP Number|Title|Authors?|Status|Type|Created|Sponsor|PR)\*?\*?:/i)) {
      continue;
    }

    // Add content lines
    if (preambleEnded || trimmed.length > 0 || contentLines.length > 0) {
      contentLines.push(line);
    }
  }

  return contentLines.join('\n').trim();
}

// Generate SEP markdown content
function generateSEPMarkdown(issue, metadata, body) {
  const sepNumber = issue.number;
  const title = metadata.title;

  let content = `# SEP-${sepNumber}: ${title}\n\n`;
  content += `- **Status**: ${metadata.status}\n`;
  content += `- **Type**: ${metadata.type}\n`;
  content += `- **Created**: ${metadata.created}\n`;
  content += `- **Author(s)**: ${metadata.author}\n`;

  if (metadata.sponsor) {
    content += `- **Sponsor**: ${metadata.sponsor}\n`;
  }

  if (metadata.pr) {
    content += `- **PR**: #${metadata.pr}\n`;
  }

  content += `- **Issue**: #${sepNumber}\n`;
  content += '\n';
  content += body;

  return content;
}

// Convert title to filename
function titleToFilename(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50); // Limit length
}

// Main migration function
function migrateSEPs() {
  const issues = fetchSEPIssues();
  console.log(`Found ${issues.length} total SEP issues`);

  const sepsDir = path.join(__dirname, 'seps');

  // Ensure seps directory exists
  if (!fs.existsSync(sepsDir)) {
    fs.mkdirSync(sepsDir, { recursive: true });
  }

  let migratedCount = 0;
  let skippedCount = 0;

  for (const issue of issues) {
    if (!shouldMigrate(issue)) {
      console.log(`Skipping #${issue.number}: ${issue.title} (status: ${getStatusFromLabels(issue.labels) || 'none'})`);
      skippedCount++;
      continue;
    }

    console.log(`\nMigrating #${issue.number}: ${issue.title}`);

    const metadata = parseIssueBody(issue.body, issue);
    if (!metadata) {
      console.log(`  ⚠️  Could not parse metadata, skipping`);
      skippedCount++;
      continue;
    }

    const cleanBody = cleanBodyContent(issue.body);
    const sepContent = generateSEPMarkdown(issue, metadata, cleanBody);

    const filename = `${issue.number}-${titleToFilename(metadata.title)}.md`;
    const filepath = path.join(sepsDir, filename);

    fs.writeFileSync(filepath, sepContent, 'utf-8');
    console.log(`  ✓ Created ${filename}`);
    migratedCount++;
  }

  console.log(`\n=== Migration Complete ===`);
  console.log(`Migrated: ${migratedCount}`);
  console.log(`Skipped: ${skippedCount}`);
  console.log(`Total: ${issues.length}`);
}

// Run migration
try {
  migrateSEPs();
} catch (error) {
  console.error('Error during migration:', error.message);
  process.exit(1);
}
