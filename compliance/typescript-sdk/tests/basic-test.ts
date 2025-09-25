#!/usr/bin/env node
import { spawn } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const scenarios = [1, 2, 3, 4, 5, 6, 11, 13, 15, 21, 24, 25];

async function runScenario(id: number): Promise<boolean> {
  console.log(`\nTesting scenario ${id}...`);
  
  return new Promise((resolve) => {
    const serverPath = join(__dirname, '..', 'test-server');
    const clientPath = join(__dirname, '..', 'test-client');
    
    const child = spawn(clientPath, [
      '--scenario-id', id.toString(),
      '--id', 'client1',
      '--',
      'stdio',
      serverPath,
      '--server-name', getServerName(id),
      '--transport', 'stdio'
    ], {
      stdio: 'inherit',
      cwd: join(__dirname, '..', '..')  // Run from compliance directory
    });
    
    child.on('exit', (code) => {
      if (code === 0) {
        console.log(`✅ Scenario ${id} passed`);
        resolve(true);
      } else {
        console.log(`❌ Scenario ${id} failed with code ${code}`);
        resolve(false);
      }
    });
    
    child.on('error', (err) => {
      console.error(`❌ Scenario ${id} error:`, err);
      resolve(false);
    });
  });
}

function getServerName(scenarioId: number): string {
  if (scenarioId >= 8 && scenarioId <= 10) return 'FileServer';
  if (scenarioId >= 11 && scenarioId <= 12) return 'ErrorServer';
  if (scenarioId >= 16 && scenarioId <= 20 && scenarioId !== 19) return 'FileServer';
  return 'CalcServer';
}

async function main() {
  console.log('Running TypeScript SDK compliance tests...\n');
  
  let passed = 0;
  let failed = 0;
  
  for (const id of scenarios) {
    const success = await runScenario(id);
    if (success) passed++;
    else failed++;
  }
  
  console.log(`\n\nSummary: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);