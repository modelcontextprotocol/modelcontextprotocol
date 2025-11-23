#!/usr/bin/env tsx

import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

// Legacy schema versions that should remain as JSON Schema draft-07
const LEGACY_SCHEMAS = ["2024-11-05", "2025-03-26", "2025-06-18"];

// All schema versions to generate
const ALL_SCHEMAS = [...LEGACY_SCHEMAS, "draft"];

// Check if we're in check mode (validate existing schemas match generated ones)
const CHECK_MODE = process.argv.includes("--check");

/**
 * Apply JSON Schema 2020-12 transformations to a schema file
 */
function applyJsonSchema202012Transformations(schemaPath: string): void {
  let content = readFileSync(schemaPath, "utf-8");

  // Replace $schema URL
  content = content.replace(
    /http:\/\/json-schema\.org\/draft-07\/schema#/g,
    "https://json-schema.org/draft/2020-12/schema",
  );

  // Replace "definitions": with "$defs":
  content = content.replace(/"definitions":/g, '"$defs":');

  // Replace #/definitions/ with #/$defs/
  content = content.replace(/#\/definitions\//g, "#/$defs/");

  writeFileSync(schemaPath, content, "utf-8");
}

/**
 * Generate JSON schema for a specific version
 */
function generateSchema(version: string, check: boolean = false): boolean {
  const schemaDir = join("schema", version);
  const schemaTs = join(schemaDir, "schema.ts");
  const schemaJson = join(schemaDir, "schema.json");

  if (check) {
    console.log(`Checking schema for ${version}...`);

    // Read existing schema
    const existingSchema = readFileSync(schemaJson, "utf-8");

    // Generate schema to stdout and capture it
    try {
      const generated = execSync(
        `npx typescript-json-schema --defaultNumberType integer --required --skipLibCheck "${schemaTs}" "*"`,
        { encoding: "utf-8" },
      );

      let expectedSchema = generated;

      // Apply transformations for non-legacy schemas
      if (!LEGACY_SCHEMAS.includes(version)) {
        expectedSchema = expectedSchema.replace(
          /http:\/\/json-schema\.org\/draft-07\/schema#/g,
          "https://json-schema.org/draft/2020-12/schema",
        );
        expectedSchema = expectedSchema.replace(/"definitions":/g, '"$defs":');
        expectedSchema = expectedSchema.replace(
          /#\/definitions\//g,
          "#/$defs/",
        );
      }

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
    console.log(`Generating schema for ${version}...`);

    // Run typescript-json-schema
    try {
      execSync(
        `npx typescript-json-schema --defaultNumberType integer --required --skipLibCheck "${schemaTs}" "*" -o "${schemaJson}"`,
        { stdio: "inherit" },
      );
    } catch (error) {
      console.error(`Failed to generate schema for ${version}`);
      throw error;
    }

    // Apply transformations for non-legacy schemas
    if (!LEGACY_SCHEMAS.includes(version)) {
      console.log(
        `Applying JSON Schema 2020-12 transformations to ${version}...`,
      );
      applyJsonSchema202012Transformations(schemaJson);
    }

    return true;
  }
}

/**
 * Main function
 */
function main(): void {
  if (CHECK_MODE) {
    console.log("Checking JSON schemas...\n");

    let allValid = true;
    for (const version of ALL_SCHEMAS) {
      const valid = generateSchema(version, true);
      if (!valid) {
        allValid = false;
      }
    }

    console.log();
    if (!allValid) {
      console.error(
        "Error: Some schemas are out of date. Run: npm run generate:schema:json",
      );
      process.exit(1);
    } else {
      console.log("All schemas are up to date!");
    }
  } else {
    console.log("Generating JSON schemas...\n");

    for (const version of ALL_SCHEMAS) {
      generateSchema(version, false);
    }

    console.log("\nSchema generation complete!");
    console.log(`- (draft-07): ${LEGACY_SCHEMAS.join(", ")}`);
    console.log(`- (2020-12): draft`);
  }
}

main();
