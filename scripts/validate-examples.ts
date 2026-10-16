#!/usr/bin/env tsx

import Ajv, { type ValidateFunction } from "ajv";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import type { Dirent } from "fs";
import { readFile, readdir } from "fs/promises";
import { join } from "path";

type ValidationResult = [name: string, errors: Promise<string[]>];

/**
 * @returns Array of error messages (if any).
 */
async function validateExample(
  examplePath: string,
  validate: ValidateFunction,
): Promise<string[]> {
  try {
    const example = JSON.parse(await readFile(examplePath, "utf-8"));

    validate(example);
    return (validate.errors ?? []).map(
      (err) => `${err.instancePath || "/"}: ${err.message}`
    );
  } catch (e) {
    return [(e as Error).message];
  }
}

async function validateSchemaExamples(
  schemaDir: string,
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  const schema = JSON.parse(
    await readFile(join(schemaDir, "schema.json"), "utf-8")
  );

  const is2020 = (schema.$schema as string).includes("2020-12");

  const ajv = is2020
    ? new Ajv2020({ allErrors: true, strict: false })
    : new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  const defsKey = is2020 ? "$defs" : "definitions";
  const defs = schema[defsKey] as Record<string, unknown>;

  const examplesDir = join(schemaDir, "examples");
  let dirents: Dirent[];
  try {
    dirents = await readdir(examplesDir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const dirent of dirents) {
    if (!dirent.isDirectory()) continue;
    const typeName = dirent.name;
    const typeDir = join(examplesDir, typeName);

    let validate: ValidateFunction | undefined;
    if (defs?.[typeName]) {
      validate = ajv.compile({
        $schema: schema.$schema,
        [defsKey]: schema[defsKey],
        ...(defs?.[typeName] as object),
      } as Record<string, unknown>);
    }

    for (const exampleFile of await readdir(typeDir)) {
      if (!exampleFile.endsWith(".json")) continue;
      const examplePath = join(typeDir, exampleFile);
      if (validate) {
        results.push([examplePath, validateExample(examplePath, validate)]);
      } else {
        results.push([examplePath, Promise.resolve([`Type "${typeName}" not found in schema`])]);
      }
    }
  }

  return results;
}

async function main() {
  console.log("Validating JSON examples...\n");

  // Discover all schema version directories under `schema/`
  const schemaDirs = (await readdir("schema", { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => join("schema", d.name));

  // Validate examples for all schema versions in parallel
  const results = (await Promise.all(schemaDirs.map(validateSchemaExamples))).flat();

  let passed = 0;
  let failed = 0;

  // Output results
  for (const [name, errorsPromise] of results) {
    const errors = await errorsPromise;
    if (errors.length === 0) {
      console.log(`✓ ${name}`);
      passed += 1;
    } else {
      console.log(`✗ ${name}`);
      for (const err of errors) {
        console.log(`    ${err}`);
      }
      failed += 1;
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);

  if (failed > 0) process.exit(1);
}

main();
