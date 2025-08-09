#!/usr/bin/env tsx
import { readFileSync } from 'fs';
import { validateScenarios } from '../src/validation.js';

try {
  const data = JSON.parse(readFileSync('scenarios/data.json', 'utf-8'));
  const validated = validateScenarios(data);
  console.log('✅ Scenarios file is valid!');
  console.log(`- ${Object.keys(validated.servers).length} servers defined`);
  console.log(`- ${validated.scenarios.length} scenarios defined`);
} catch (error) {
  console.error('❌ Validation failed:', error);
  process.exit(1);
}