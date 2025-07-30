import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Scenarios, AnnotatedJSONRPCMessage, TestResult, LogComparisonResult } from './types.js';
import { 
  parseJSONLLog, 
  normalizeLogForComparison, 
  compareNormalizedLogs,
  validateAnnotatedLog 
} from './validation.js';

export interface CrossSDKTestConfig {
  clientSDK: string;
  serverSDK: string;
  scenario: Scenarios['scenarios'][0];
  goldensDir: string;
}

export class CrossSDKRunner {
  private readonly config: CrossSDKTestConfig;
  private readonly tempDir: string;
  
  constructor(config: CrossSDKTestConfig) {
    this.config = config;
    this.tempDir = mkdtempSync(join(tmpdir(), `cross-sdk-${config.clientSDK}-${config.serverSDK}-`));
  }
  
  async run(): Promise<TestResult> {
    const logPath = join(this.tempDir, `${this.config.scenario.id}.jsonl`);
    const goldenPath = join(this.config.goldensDir, `${this.config.scenario.id}.jsonl`);
    
    // Check if golden exists
    if (!existsSync(goldenPath)) {
      return {
        scenarioId: this.config.scenario.id,
        clientSDK: this.config.clientSDK,
        serverSDK: this.config.serverSDK,
        transport: this.config.scenario.http_only ? 'sse' : 'stdio',
        success: false,
        error: `Golden file not found: ${goldenPath}`,
        capturedLog: [],
      };
    }
    
    try {
      // Run the scenario
      await this.runScenario(logPath);
      
      // Parse and validate the captured log
      const capturedData = parseJSONLLog(logPath);
      const capturedLog = validateAnnotatedLog(capturedData.messages);
      
      // Parse the golden log
      const goldenData = parseJSONLLog(goldenPath);
      const goldenLog = validateAnnotatedLog(goldenData.messages);
      
      // Compare logs
      const comparisonResult = this.compareLogs(goldenLog, capturedLog);
      
      return {
        scenarioId: this.config.scenario.id,
        clientSDK: this.config.clientSDK,
        serverSDK: this.config.serverSDK,
        transport: this.config.scenario.http_only ? 'sse' : 'stdio',
        success: comparisonResult.match,
        capturedLog,
        comparisonResult,
      };
    } catch (error) {
      return {
        scenarioId: this.config.scenario.id,
        clientSDK: this.config.clientSDK,
        serverSDK: this.config.serverSDK,
        transport: this.config.scenario.http_only ? 'sse' : 'stdio',
        success: false,
        error: error instanceof Error ? error.message : String(error),
        capturedLog: [],
      };
    }
  }
  
  private async runScenario(logPath: string): Promise<void> {
    const transport = this.config.scenario.http_only ? 'sse' : 'stdio';
    
    if (transport === 'stdio') {
      await this.runStdioScenario(logPath);
    } else if (transport === 'sse') {
      await this.runSSEScenario(logPath);
    } else {
      throw new Error(`Unsupported transport: ${transport}`);
    }
  }
  
  private async runStdioScenario(logPath: string): Promise<void> {
    const clientBinary = join(process.cwd(), this.config.clientSDK, 'test-client');
    const serverBinary = join(process.cwd(), this.config.serverSDK, 'test-server');
    
    // Check binaries exist
    if (!existsSync(clientBinary)) {
      throw new Error(`Client binary not found: ${clientBinary}`);
    }
    if (!existsSync(serverBinary)) {
      throw new Error(`Server binary not found: ${serverBinary}`);
    }
    
    const clientArgs = [
      clientBinary,
      '--scenario-id', this.config.scenario.id.toString(),
      '--id', this.config.scenario.client_ids[0],
      'stdio',
      '--',
      'tsx',
      join(process.cwd(), 'src/cli/mitm.ts'),
      'stdio',
      '--log', logPath,
      '--scenario-id', this.config.scenario.id.toString(),
      '--client-id', this.config.scenario.client_ids[0],
      '--server-id', this.config.scenario.server_name,
      '--',
      serverBinary,
      '--server-name', this.config.scenario.server_name,
      '--transport', 'stdio'
    ];
    
    await this.runCommand('tsx', clientArgs);
  }
  
  private async runSSEScenario(logPath: string): Promise<void> {
    const clientBinary = join(process.cwd(), this.config.clientSDK, 'test-client');
    const serverBinary = join(process.cwd(), this.config.serverSDK, 'test-server');
    
    // Check binaries exist
    if (!existsSync(clientBinary)) {
      throw new Error(`Client binary not found: ${clientBinary}`);
    }
    if (!existsSync(serverBinary)) {
      throw new Error(`Server binary not found: ${serverBinary}`);
    }
    
    const port = 10000 + this.config.scenario.id;
    const mitmPort = port + 1000;
    
    // Start server
    const serverProc = spawn('tsx', [
      serverBinary,
      '--server-name', this.config.scenario.server_name,
      '--transport', 'sse',
      '--host', '127.0.0.1',
      '--port', port.toString()
    ]);
    
    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
      // Start MITM proxy
      const mitmProc = spawn('tsx', [
        join(process.cwd(), 'src/cli/mitm.ts'),
        'sse',
        '--log', logPath,
        '--scenario-id', this.config.scenario.id.toString(),
        '--client-id', this.config.scenario.client_ids[0],
        '--server-id', this.config.scenario.server_name,
        '--port', mitmPort.toString(),
        '--',
        `http://127.0.0.1:${port}`
      ]);
      
      // Wait for MITM to be ready
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      try {
        // Run client through MITM
        const clientArgs = [
          clientBinary,
          '--scenario-id', this.config.scenario.id.toString(),
          '--id', this.config.scenario.client_ids[0],
          'sse',
          `http://127.0.0.1:${mitmPort}`
        ];
        
        await this.runCommand('tsx', clientArgs);
      } finally {
        mitmProc.kill();
      }
    } finally {
      serverProc.kill();
    }
  }
  
  private async runCommand(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        stdio: 'inherit',
        cwd: process.cwd()
      });
      
      proc.on('error', reject);
      proc.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command exited with code ${code}`));
        }
      });
    });
  }
  
  private compareLogs(
    golden: AnnotatedJSONRPCMessage[], 
    actual: AnnotatedJSONRPCMessage[]
  ): LogComparisonResult {
    const normalizedGolden = normalizeLogForComparison(golden);
    const normalizedActual = normalizeLogForComparison(actual);
    
    if (compareNormalizedLogs(normalizedGolden, normalizedActual)) {
      return { match: true };
    }
    
    // Find differences
    const differences = [];
    const maxLen = Math.max(normalizedGolden.length, normalizedActual.length);
    
    for (let i = 0; i < maxLen; i++) {
      if (i >= normalizedGolden.length) {
        differences.push({
          index: i,
          expected: null as any,
          actual: normalizedActual[i],
          reason: 'Extra message in actual log',
        });
      } else if (i >= normalizedActual.length) {
        differences.push({
          index: i,
          expected: normalizedGolden[i],
          actual: null as any,
          reason: 'Missing message in actual log',
        });
      } else if (JSON.stringify(normalizedGolden[i]) !== JSON.stringify(normalizedActual[i])) {
        differences.push({
          index: i,
          expected: normalizedGolden[i],
          actual: normalizedActual[i],
          reason: 'Message content differs',
        });
      }
    }
    
    return { match: false, differences };
  }
}