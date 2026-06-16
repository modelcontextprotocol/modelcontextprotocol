#!/usr/bin/env tsx

import { exec } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Legacy schema versions that should remain as JSON Schema draft-07
const LEGACY_SCHEMAS = ['2024-11-05', '2025-03-26', '2025-06-18'];

// Modern schema versions that use JSON Schema 2020-12
const MODERN_SCHEMAS = ['2025-11-25', 'draft'];

// All schema versions to generate
const ALL_SCHEMAS = [...LEGACY_SCHEMAS, ...MODERN_SCHEMAS];

/**
 * Build the canonical `$id` for a given schema version, so the generated
 * `schema.json` is self-describing about which MCP protocol version it
 * represents (independent of the directory it lives in).
 */
function schemaId(version: string): string {
  return `https://modelcontextprotocol.io/schemas/${version}/schema.json`;
}

/**
 * Add a top-level `$id` to a generated schema document.
 *
 * `typescript-json-schema --id` is intentionally not used here: it additionally
 * rewrites every internal `$ref` to an absolute URL. We only want the
 * self-describing `$id` while keeping the existing fragment-only refs, so we
 * inject it directly after the opening brace (before `$schema`).
 */
function addSchemaId(content: string, version: string): string {
  return content.replace(
    /^\{\n/,
    `{\n    "$id": ${JSON.stringify(schemaId(version))},\n`
  );
}

// Check if we're in check mode (validate existing schemas match generated ones)
const CHECK_MODE = process.argv.includes('--check');

/**
 * Apply JSON Schema 2020-12 transformations to a schema file
 */
function applyJsonSchema202012Transformations(schemaPath: string): void {
  let content = readFileSync(schemaPath, 'utf-8');

  // Replace $schema URL
  content = content.replace(
    /http:\/\/json-schema\.org\/draft-07\/schema#/g,
    'https://json-schema.org/draft/2020-12/schema'
  );

  // Replace "definitions": with "$defs":
  content = content.replace(
    /"definitions":/g,
    '"$defs":'
  );

  // Replace #/definitions/ with #/$defs/
  content = content.replace(
    /#\/definitions\//g,
    '#/$defs/'
  );

  writeFileSync(schemaPath, content, 'utf-8');
}

/**
 * Generate JSON schema for a specific version
 */
async function generateSchema(version: string, check: boolean = false): Promise<boolean> {
  const schemaDir = join('schema', version);
  const schemaTs = join(schemaDir, 'schema.ts');
  const schemaJson = join(schemaDir, 'schema.json');

  if (check) {
    // Read existing schema
    const existingSchema = readFileSync(schemaJson, 'utf-8');

    // Generate schema to stdout and capture it
    try {
      const { stdout: generated } = await execAsync(
        `npx typescript-json-schema --defaultNumberType integer --required --skipLibCheck "${schemaTs}" "*"`
      );

      let expectedSchema = generated;

      // Apply transformations for non-legacy schemas
      if (!LEGACY_SCHEMAS.includes(version)) {
        expectedSchema = expectedSchema.replace(
          /http:\/\/json-schema\.org\/draft-07\/schema#/g,
          'https://json-schema.org/draft/2020-12/schema'
        );
        expectedSchema = expectedSchema.replace(/"definitions":/g, '"$defs":');
        expectedSchema = expectedSchema.replace(/#\/definitions\//g, '#/$defs/');
      }

      expectedSchema = addSchemaId(expectedSchema, version);

      // Compare
      if (existingSchema.trim() !== expectedSchema.trim()) {
        console.error(`  ✗ Schema ${version} is out of date!`);
        return false;
      }

      console.log(`  ✓ Schema ${version} is up to date`);
      return true;
    } catch (error) {
      console.error(`Failed to check schema for ${version}`);
      throw error;
    }
  } else {
    // Run typescript-json-schema
    try {
      await execAsync(
        `npx typescript-json-schema --defaultNumberType integer --required --skipLibCheck "${schemaTs}" "*" -o "${schemaJson}"`
      );
    } catch (error) {
      console.error(`Failed to generate schema for ${version}`);
      throw error;
    }

    // Apply transformations for non-legacy schemas
    if (!LEGACY_SCHEMAS.includes(version)) {
      applyJsonSchema202012Transformations(schemaJson);
    }

    // Add the self-describing `$id` for the protocol version
    writeFileSync(
      schemaJson,
      addSchemaId(readFileSync(schemaJson, 'utf-8'), version),
      'utf-8'
    );

    console.log(`  ✓ Generated schema for ${version}`);
    return true;
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  if (CHECK_MODE) {
    console.log('Checking JSON schemas in parallel...\n');

    const results = await Promise.all(
      ALL_SCHEMAS.map(version => generateSchema(version, true))
    );

    const allValid = results.every(valid => valid);

    console.log();
    if (!allValid) {
      console.error('Error: Some schemas are out of date. Run: npm run generate:schema:json');
      process.exit(1);
    } else {
      console.log('All schemas are up to date!');
    }
  } else {
    console.log('Generating JSON schemas in parallel...\n');

    await Promise.all(
      ALL_SCHEMAS.map(version => generateSchema(version, false))
    );

    console.log('\nSchema generation complete!');
    console.log(`- (draft-07): ${LEGACY_SCHEMAS.join(', ')}`);
    console.log(`- (2020-12): ${MODERN_SCHEMAS.join(', ')}`);
  }
}

main().catch(error => {
  console.error('Schema generation failed:', error);
  process.exit(1);
});
