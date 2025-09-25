import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CrossSDKRunner } from '../src/cross-sdk-runner.js';
import type { Scenarios } from '../src/types.js';

const SCENARIOS_PATH = join(process.cwd(), 'scenarios/data.json');
const GOLDENS_DIR = join(process.cwd(), 'scenarios/goldens');

// Load scenarios
const scenariosData = JSON.parse(readFileSync(SCENARIOS_PATH, 'utf-8')) as Scenarios;

// Get available SDKs from environment or default to typescript-sdk
const AVAILABLE_SDKS = process.env.AVAILABLE_SDKS 
  ? process.env.AVAILABLE_SDKS.split(',')
  : ['typescript-sdk'].filter(sdk => 
      existsSync(join(process.cwd(), sdk, 'test-client')) && 
      existsSync(join(process.cwd(), sdk, 'test-server'))
    );

// Cross-product of client and server SDKs
const SDK_COMBINATIONS = AVAILABLE_SDKS.flatMap(clientSDK =>
  AVAILABLE_SDKS.map(serverSDK => ({ clientSDK, serverSDK }))
);

describe('Cross-SDK Compliance Tests', () => {
  // Create a test suite for each SDK combination
  for (const { clientSDK, serverSDK } of SDK_COMBINATIONS) {
    describe(`${clientSDK} client → ${serverSDK} server`, () => {
      // Create a test for each scenario
      for (const scenario of scenariosData.scenarios) {
        it(`Scenario ${scenario.id}: ${scenario.description}`, async () => {
          const runner = new CrossSDKRunner({
            clientSDK,
            serverSDK,
            scenario,
            goldensDir: GOLDENS_DIR,
          });
          
          const result = await runner.run();
          
          if (!result.success) {
            // Generate detailed failure message
            let message = `Test failed: ${result.error || 'Unknown error'}`;
            
            if (result.comparisonResult?.differences) {
              message += '\n\nDifferences found:';
              for (const diff of result.comparisonResult.differences) {
                message += `\n  - At index ${diff.index}: ${diff.reason}`;
                if (diff.expected && diff.actual) {
                  message += `\n    Expected: ${JSON.stringify(diff.expected.message)}`;
                  message += `\n    Actual: ${JSON.stringify(diff.actual.message)}`;
                }
              }
            }
            
            assert.fail(message);
          }
          
          assert.strictEqual(result.success, true, 'Test should succeed');
          assert.ok(result.comparisonResult?.match, 'Logs should match golden');
        });
      }
    });
  }
});