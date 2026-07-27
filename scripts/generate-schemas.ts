#!/usr/bin/env tsx

import { readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import * as TJS from 'typescript-json-schema';
import * as ts from 'typescript';

// Legacy schema versions that should remain as JSON Schema draft-07
const LEGACY_SCHEMAS = ['2024-11-05', '2025-03-26', '2025-06-18'];

// Modern schema versions that use JSON Schema 2020-12
const MODERN_SCHEMAS = ['2025-11-25', 'draft'];

// All schema versions to generate
const ALL_SCHEMAS = [...LEGACY_SCHEMAS, ...MODERN_SCHEMAS];

// Check if we're in check mode (validate existing schemas match generated ones)
const CHECK_MODE = process.argv.includes('--check');

// typescript-json-schema settings matching the original CLI flags
const TJS_SETTINGS: TJS.PartialArgs = {
  defaultNumberType: 'integer',
  required: true,
  skipLibCheck: true,
};

/**
 * Enumerate all exported type and interface names from a TypeScript source file.
 *
 * `generator.getMainFileSymbols()` misses exported types whose names collide
 * with DOM/built-in types (e.g. Request, Resource, Root, ClientRequest).
 * This function walks the AST to find those missing types so they can be
 * merged back into the symbol list.
 */
function getExportedTypeNames(
  program: ts.Program,
  sourceFilePath: string,
  generator: TJS.JsonSchemaGenerator,
): string[] {
  const sourceFile = program.getSourceFile(sourceFilePath);
  if (!sourceFile) {
    throw new Error(`Source file not found: ${sourceFilePath}`);
  }

  const userSymbols = new Set(generator.getUserSymbols());
  const exportedNames: string[] = [];

  ts.forEachChild(sourceFile, (node) => {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    if (!modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
      return;
    }

    if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isEnumDeclaration(node)) {
      const name = node.name.text;
      if (userSymbols.has(name)) {
        exportedNames.push(name);
      }
    }
    // Intentionally skip VariableStatements (export const) — they are runtime
    // values (e.g. LATEST_PROTOCOL_VERSION), not schema types.
  });

  return exportedNames;
}

/**
 * Apply JSON Schema 2020-12 transformations to a schema string
 */
function applyJsonSchema202012Transformations(schema: string): string {
  return schema
    .replace(
      /http:\/\/json-schema\.org\/draft-07\/schema#/g,
      'https://json-schema.org/draft/2020-12/schema',
    )
    .replace(/"definitions":/g, '"$defs":')
    .replace(/#\/definitions\//g, '#/$defs/');
}

/**
 * Generate the JSON schema string for a given schema version using the
 * typescript-json-schema programmatic API.
 */
function generateSchemaString(version: string): string {
  const schemaDir = join('schema', version);
  const schemaTs = resolve(join(schemaDir, 'schema.ts'));

  // Pass empty compiler options to match the CLI's default behavior.
  // Explicit options (e.g. strict, target) alter how typescript-json-schema
  // resolves $ref entries, producing schemas that differ from the CLI output.
  const program = TJS.getProgramFromFiles([schemaTs], {});
  const generator = TJS.buildGenerator(program, TJS_SETTINGS);
  if (!generator) {
    throw new Error(`Failed to build schema generator for ${version}`);
  }

  // Use getMainFileSymbols() as the primary source (matches CLI wildcard
  // behavior), then merge in any AST-discovered types that were missed
  // due to name collisions with DOM/built-in types.
  const mainSymbols = generator.getMainFileSymbols(program);
  const mainSet = new Set(mainSymbols);
  const astSymbols = getExportedTypeNames(program, schemaTs, generator);
  const symbols = [...mainSymbols];
  for (const name of astSymbols) {
    if (!mainSet.has(name)) {
      symbols.push(name);
    }
  }

  if (symbols.length === 0) {
    throw new Error(`No exported types found in ${schemaTs}`);
  }

  const schema = generator.getSchemaForSymbols(symbols);
  let output = JSON.stringify(schema, null, 4) + '\n';

  // Apply transformations for non-legacy schemas
  if (!LEGACY_SCHEMAS.includes(version)) {
    output = applyJsonSchema202012Transformations(output);
  }

  return output;
}

/**
 * Generate or check JSON schema for a specific version
 */
function processSchema(version: string, check: boolean): boolean {
  const schemaDir = join('schema', version);
  const schemaJson = join(schemaDir, 'schema.json');

  if (check) {
    const existingSchema = readFileSync(schemaJson, 'utf-8');
    const generatedSchema = generateSchemaString(version);

    // Use semantic comparison (parsed JSON deep equality) so that
    // insignificant whitespace or property-ordering differences are ignored.
    const existingParsed = JSON.parse(existingSchema);
    const generatedParsed = JSON.parse(generatedSchema);

    if (JSON.stringify(existingParsed) !== JSON.stringify(generatedParsed)) {
      console.error(`  ✗ Schema ${version} is out of date!`);
      return false;
    }

    console.log(`  ✓ Schema ${version} is up to date`);
    return true;
  } else {
    const generatedSchema = generateSchemaString(version);
    writeFileSync(schemaJson, generatedSchema, 'utf-8');
    console.log(`  ✓ Generated schema for ${version}`);
    return true;
  }
}

/**
 * Main function
 */
function main(): void {
  if (CHECK_MODE) {
    console.log('Checking JSON schemas...\n');

    const results = ALL_SCHEMAS.map(version => processSchema(version, true));
    const allValid = results.every(valid => valid);

    console.log();
    if (!allValid) {
      console.error('Error: Some schemas are out of date. Run: npm run generate:schema:json');
      process.exit(1);
    } else {
      console.log('All schemas are up to date!');
    }
  } else {
    console.log('Generating JSON schemas...\n');

    ALL_SCHEMAS.forEach(version => processSchema(version, false));

    console.log('\nSchema generation complete!');
    console.log(`- (draft-07): ${LEGACY_SCHEMAS.join(', ')}`);
    console.log(`- (2020-12): ${MODERN_SCHEMAS.join(', ')}`);
  }
}

main();
