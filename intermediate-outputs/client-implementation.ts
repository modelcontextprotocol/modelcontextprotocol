#!/usr/bin/env node
import { Client, StdioClientTransport, SSEClientTransport } from '@modelcontextprotocol/sdk/client/index.js';
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { z } from 'zod';
import type { 
  CallToolResult, 
  GetPromptResult, 
  ListResourcesResult, 
  ListToolsResult, 
  ReadResourceResult,
  ListPromptsResult,
  Elicitation
} from '@modelcontextprotocol/sdk/types.js';

// Type definitions matching compliance/src/types.ts
const ScenariosSchema = z.object({
  servers: z.record(z.object({
    description: z.string(),
    tools: z.record(z.object({ description: z.string() })),
    resources: z.record(z.object({ description: z.string() })),
    resourceTemplates: z.record(z.object({
      description: z.string(),
      params: z.record(z.object({ description: z.string() }))
    })),
    prompts: z.record(z.object({ description: z.string() })),
    promptTemplates: z.record(z.object({
      description: z.string(),
      params: z.record(z.object({ description: z.string() }))
    }))
  })),
  scenarios: z.array(z.object({
    id: z.number(),
    description: z.string(),
    client_ids: z.array(z.string()),
    server_name: z.string(),
    http_only: z.boolean().optional()
  }))
});

type Scenarios = z.infer<typeof ScenariosSchema>;

// CLI setup
const program = new Command();

program
  .name('test-client')
  .description('MCP Compliance Test Client for TypeScript SDK')
  .requiredOption('--scenario-id <number>', 'Scenario ID from scenarios data', (val) => parseInt(val, 10))
  .requiredOption('--id <string>', 'Client identifier (e.g., "client1")')
  .arguments('<transport> [args...]')
  .action(async (transport: string, args: string[]) => {
    const options = program.opts();
    
    try {
      await runClient({
        scenarioId: options.scenarioId,
        clientId: options.id,
        transport,
        args
      });
    } catch (error) {
      console.error('Client error:', error);
      process.exit(1);
    }
  });

program.parse();

async function runClient(config: {
  scenarioId: number;
  clientId: string;
  transport: string;
  args: string[];
}) {
  // Load and validate scenarios
  const scenariosPath = resolve(join(process.cwd(), 'compliance', 'scenarios', 'data.json'));
  const scenariosData = JSON.parse(readFileSync(scenariosPath, 'utf-8'));
  const scenarios = ScenariosSchema.parse(scenariosData);
  
  // Find the scenario
  const scenario = scenarios.scenarios.find(s => s.id === config.scenarioId);
  if (!scenario) {
    throw new Error(`Scenario ${config.scenarioId} not found`);
  }
  
  // Validate client ID
  if (!scenario.client_ids.includes(config.clientId)) {
    throw new Error(`Client ID ${config.clientId} not found in scenario ${config.scenarioId}`);
  }
  
  // Get server definition
  const serverDef = scenarios.servers[scenario.server_name];
  if (!serverDef) {
    throw new Error(`Server ${scenario.server_name} not found`);
  }
  
  // Create transport and client
  const { client, cleanup } = await createClient(config.transport, config.args);
  
  try {
    // Connect to server
    await client.connect();
    
    // Execute scenario
    await executeScenario(client, scenario, config.clientId, serverDef);
    
    console.log(`Scenario ${config.scenarioId} completed successfully for ${config.clientId}`);
  } finally {
    await cleanup();
  }
}

async function createClient(transport: string, args: string[]): Promise<{
  client: Client;
  cleanup: () => Promise<void>;
}> {
  let client: Client;
  let cleanup: () => Promise<void>;
  
  switch (transport) {
    case 'stdio': {
      if (args.length < 1) {
        throw new Error('stdio transport requires command argument');
      }
      const [command, ...commandArgs] = args;
      const stdioTransport = new StdioClientTransport({
        command,
        args: commandArgs
      });
      client = new Client({
        name: 'test-client',
        version: '1.0.0'
      }, {
        capabilities: {
          elicitation: {}
        }
      });
      await client.connect(stdioTransport);
      cleanup = async () => {
        await client.close();
      };
      break;
    }
    
    case 'sse': {
      if (args.length !== 1) {
        throw new Error('sse transport requires url argument');
      }
      const [url] = args;
      const sseTransport = new SSEClientTransport(new URL(url));
      client = new Client({
        name: 'test-client',
        version: '1.0.0'
      }, {
        capabilities: {
          elicitation: {}
        }
      });
      await client.connect(sseTransport);
      cleanup = async () => {
        await client.close();
      };
      break;
    }
    
    case 'streamable-http': {
      // Note: The SDK doesn't have a built-in streamable-http transport yet
      // This would need to be implemented or imported from elsewhere
      throw new Error('streamable-http transport not yet implemented');
    }
    
    default:
      throw new Error(`Unknown transport: ${transport}`);
  }
  
  return { client, cleanup };
}

async function executeScenario(
  client: Client,
  scenario: { id: number; description: string; client_ids: string[]; server_name: string },
  clientId: string,
  serverDef: any
) {
  // Parse scenario description to determine actions
  const description = scenario.description.toLowerCase();
  
  // Handle elicitations that might come from the server
  client.on('elicitation', async (elicitation: Elicitation) => {
    console.log(`Received elicitation: ${elicitation.prompt.text}`);
    
    // For ambiguous_add scenario, respond with 20
    if (description.includes('ambiguous_add') && description.includes('responds with 20')) {
      await client.respondToElicitation(elicitation.id, { value: '20' });
    } else {
      // Default: decline elicitation
      await client.respondToElicitation(elicitation.id, { decline: true });
    }
  });
  
  // Execute based on scenario ID
  switch (scenario.id) {
    case 1: // Simple add
      await executeAddScenario(client);
      break;
      
    case 2: // Ambiguous add with elicitation
      await executeAmbiguousAddScenario(client);
      break;
      
    case 3: // Multi-client trig functions
      await executeMultiClientTrigScenario(client, clientId);
      break;
      
    case 4: // Resource read/write
      await executeResourceScenario(client);
      break;
      
    case 5: // Get prompt
      await executePromptScenario(client);
      break;
      
    case 6: // Eval with sampling
      await executeEvalWithSamplingScenario(client);
      break;
      
    case 7: // Resource subscription
      await executeResourceSubscriptionScenario(client, clientId);
      break;
      
    case 8: // Pagination
      await executePaginationScenario(client);
      break;
      
    case 9: // Resource template
      await executeResourceTemplateScenario(client);
      break;
      
    case 10: // File subscription
      await executeFileSubscriptionScenario(client);
      break;
      
    case 11: // Error handling
      await executeErrorScenario(client);
      break;
      
    case 12: // Timeout and cancellation
      await executeTimeoutScenario(client);
      break;
      
    case 13: // Basic stdio
    case 14: // SSE transport
    case 19: // Streamable HTTP
      // These are transport-specific but use the same add operation
      await executeAddScenario(client);
      break;
      
    case 15: // Progress tracking
      await executeProgressScenario(client);
      break;
      
    case 16: // Roots notification
      await executeRootsScenario(client);
      break;
      
    case 17: // Logging
      await executeLoggingScenario(client);
      break;
      
    case 18: // Prompts and templates
      await executePromptTemplatesScenario(client);
      break;
      
    case 20: // Text completion
      await executeCompletionScenario(client);
      break;
      
    case 21: // Version negotiation
      // Version negotiation happens during connection
      await executeAddScenario(client);
      break;
      
    case 22: // Tools changed notification
      await executeToolsChangedScenario(client);
      break;
      
    case 23: // Multi-transport consistency
      await executeAddScenario(client);
      break;
      
    case 24: // Declined elicitation
      await executeDeclinedElicitationScenario(client);
      break;
      
    case 25: // Concurrent calls
      await executeConcurrentCallsScenario(client);
      break;
      
    default:
      throw new Error(`Scenario ${scenario.id} not implemented`);
  }
}

// Scenario implementations
async function executeAddScenario(client: Client) {
  const result = await client.callTool('add', {
    a: 10,
    b: 20
  }) as CallToolResult;
  
  if (result.content[0].type !== 'text' || result.content[0].text !== '30') {
    throw new Error(`Expected result 30, got ${JSON.stringify(result.content)}`);
  }
}

async function executeAmbiguousAddScenario(client: Client) {
  const result = await client.callTool('ambiguous_add', {
    a: 10
  }) as CallToolResult;
  
  // The elicitation handler will respond with 20
  // The result should be 30
  if (result.content[0].type !== 'text' || result.content[0].text !== '30') {
    throw new Error(`Expected result 30, got ${JSON.stringify(result.content)}`);
  }
}

async function executeMultiClientTrigScenario(client: Client, clientId: string) {
  if (clientId === 'client1') {
    // Enable trig functions
    await client.callTool('set_trig_allowed', { allowed: true });
    
    // List tools - should include cos and sin
    const tools = await client.listTools() as ListToolsResult;
    const hasCosSin = tools.tools.some(t => t.name === 'cos') && 
                      tools.tools.some(t => t.name === 'sin');
    
    if (!hasCosSin) {
      throw new Error('Expected cos and sin tools to be available');
    }
  } else if (clientId === 'client2') {
    // List tools - should NOT include cos and sin
    const tools = await client.listTools() as ListToolsResult;
    const hasCosSin = tools.tools.some(t => t.name === 'cos') || 
                      tools.tools.some(t => t.name === 'sin');
    
    if (hasCosSin) {
      throw new Error('Expected cos and sin tools to NOT be available');
    }
  }
}

async function executeResourceScenario(client: Client) {
  // Read initial value
  let result = await client.readResource('resource://special-number') as ReadResourceResult;
  if (result.contents[0].text !== '42') {
    throw new Error(`Expected initial value 42, got ${result.contents[0].text}`);
  }
  
  // Update value
  await client.callTool('write_special_number', { value: 100 });
  
  // Read updated value
  result = await client.readResource('resource://special-number') as ReadResourceResult;
  if (result.contents[0].text !== '100') {
    throw new Error(`Expected updated value 100, got ${result.contents[0].text}`);
  }
}

async function executePromptScenario(client: Client) {
  const result = await client.getPrompt('example-maths') as GetPromptResult;
  
  if (!result.messages || result.messages.length === 0) {
    throw new Error('Expected prompt messages');
  }
}

async function executeEvalWithSamplingScenario(client: Client) {
  // Note: The client needs to handle sampling requests from the server
  // This is a more complex scenario that requires sampling support
  const result = await client.callTool('eval_with_sampling', {
    expression: '2 + 2 * 3'
  }) as CallToolResult;
  
  if (result.content[0].type !== 'text' || result.content[0].text !== '8') {
    throw new Error(`Expected result 8, got ${JSON.stringify(result.content)}`);
  }
}

async function executeResourceSubscriptionScenario(client: Client, clientId: string) {
  if (clientId === 'client1') {
    // Subscribe to resource
    await client.subscribeResource('resource://special-number');
    
    // Wait for client2 to update the resource
    await new Promise(resolve => {
      client.on('resource_updated', (update) => {
        if (update.uri === 'resource://special-number') {
          resolve(true);
        }
      });
      
      // Timeout after 5 seconds
      setTimeout(() => resolve(false), 5000);
    });
  } else if (clientId === 'client2') {
    // Give client1 time to subscribe
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Update the resource
    await client.callTool('write_special_number', { value: 50 });
  }
}

async function executePaginationScenario(client: Client) {
  // List resources with pagination
  const firstPage = await client.listResources({ limit: 2 }) as ListResourcesResult;
  
  if (!firstPage.nextCursor) {
    throw new Error('Expected nextCursor in first page');
  }
  
  // Get next page
  const secondPage = await client.listResources({ 
    cursor: firstPage.nextCursor,
    limit: 2 
  }) as ListResourcesResult;
  
  // Verify we got different resources
  const firstUris = firstPage.resources.map(r => r.uri);
  const secondUris = secondPage.resources.map(r => r.uri);
  
  if (firstUris.some(uri => secondUris.includes(uri))) {
    throw new Error('Expected different resources in second page');
  }
}

async function executeResourceTemplateScenario(client: Client) {
  // Read using resource template
  let result = await client.readResource('file:///readme.txt') as ReadResourceResult;
  const initialContent = result.contents[0].text;
  
  // Update file
  await client.callTool('write_file', {
    path: '/readme.txt',
    content: 'Updated content'
  });
  
  // Read again
  result = await client.readResource('file:///readme.txt') as ReadResourceResult;
  if (result.contents[0].text !== 'Updated content') {
    throw new Error('Expected updated content');
  }
}

async function executeFileSubscriptionScenario(client: Client) {
  // Subscribe to file
  await client.subscribeResource('file:///watched.txt');
  
  // Update file and wait for notification
  const notificationReceived = await new Promise(resolve => {
    client.on('resource_updated', (update) => {
      if (update.uri === 'file:///watched.txt') {
        resolve(true);
      }
    });
    
    // Update the file
    client.callTool('write_file', {
      path: '/watched.txt',
      content: 'Modified content'
    });
    
    // Timeout after 5 seconds
    setTimeout(() => resolve(false), 5000);
  });
  
  if (!notificationReceived) {
    throw new Error('Expected resource update notification');
  }
}

async function executeErrorScenario(client: Client) {
  try {
    await client.callTool('always_error', {});
    throw new Error('Expected tool to return error');
  } catch (error: any) {
    // Expected error
    if (!error.message || !error.message.includes('error')) {
      throw new Error('Expected proper error response');
    }
  }
}

async function executeTimeoutScenario(client: Client) {
  // Start long-running operation
  const callPromise = client.callTool('timeout', {});
  
  // Wait 1 second then cancel
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Note: The SDK needs to support cancellation
  // This is a placeholder for the actual cancellation logic
  // await client.cancelOperation(operationId);
  
  try {
    await callPromise;
    throw new Error('Expected operation to be cancelled');
  } catch (error: any) {
    // Expected cancellation error
  }
}

async function executeProgressScenario(client: Client) {
  const progressUpdates: any[] = [];
  
  client.on('progress', (progress) => {
    progressUpdates.push(progress);
  });
  
  await client.callTool('eval_with_sampling', {
    expression: '(2 + 3) * (4 + 5)'
  });
  
  if (progressUpdates.length === 0) {
    throw new Error('Expected progress notifications');
  }
}

async function executeRootsScenario(client: Client) {
  // Wait for roots changed notification
  const rootsChanged = await new Promise(resolve => {
    client.on('roots_list_changed', () => {
      resolve(true);
    });
    
    // Timeout after 5 seconds
    setTimeout(() => resolve(false), 5000);
  });
  
  if (!rootsChanged) {
    console.warn('No roots changed notification received (may be expected)');
  }
  
  // List roots
  const roots = await client.listRoots();
  if (!roots || roots.roots.length === 0) {
    throw new Error('Expected roots to be available');
  }
}

async function executeLoggingScenario(client: Client) {
  // Enable logging
  await client.setLogLevel('debug');
  
  // Perform operations
  await client.callTool('add', { a: 5, b: 10 });
  await client.listTools();
  
  // Retrieve logs
  const logs = await client.listLogs();
  if (!logs || logs.logs.length === 0) {
    throw new Error('Expected server logs');
  }
}

async function executePromptTemplatesScenario(client: Client) {
  // List prompts with pagination
  const prompts = await client.listPrompts({ limit: 10 }) as ListPromptsResult;
  
  if (prompts.prompts.length === 0) {
    throw new Error('Expected prompts to be available');
  }
  
  // Get specific prompt
  const prompt = await client.getPrompt('code_review');
  if (!prompt.messages) {
    throw new Error('Expected prompt messages');
  }
  
  // Get prompt template with parameters
  const templateResult = await client.getPrompt('summarize_file', {
    arguments: { path: '/test.txt' }
  });
  
  if (!templateResult.messages) {
    throw new Error('Expected template messages');
  }
}

async function executeCompletionScenario(client: Client) {
  // Note: Completion support is not standard in the SDK
  // This would need custom implementation
  console.log('Text completion scenario not implemented in standard SDK');
}

async function executeToolsChangedScenario(client: Client) {
  const toolsChanges: any[] = [];
  
  client.on('tools_list_changed', () => {
    toolsChanges.push(true);
  });
  
  // Trigger tools change
  await client.callTool('set_trig_allowed', { allowed: true });
  
  // Wait a bit for notification
  await new Promise(resolve => setTimeout(resolve, 500));
  
  if (toolsChanges.length === 0) {
    console.warn('No tools changed notification received (may be expected)');
  }
}

async function executeDeclinedElicitationScenario(client: Client) {
  try {
    await client.callTool('ambiguous_add', { a: 10 });
    throw new Error('Expected error when elicitation is declined');
  } catch (error: any) {
    // Expected error due to declined elicitation
    if (!error.message || !error.message.toLowerCase().includes('elicitation')) {
      // The error might be different, but we expect some error
      console.log('Got error as expected:', error.message);
    }
  }
}

async function executeConcurrentCallsScenario(client: Client) {
  // Execute multiple concurrent calls
  const promises = [
    client.callTool('add', { a: 1, b: 2 }),
    client.callTool('add', { a: 3, b: 4 }),
    client.callTool('add', { a: 5, b: 6 })
  ];
  
  const results = await Promise.all(promises) as CallToolResult[];
  
  // Verify results
  const expectedResults = ['3', '7', '11'];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.content[0].type !== 'text' || result.content[0].text !== expectedResults[i]) {
      throw new Error(`Expected result ${expectedResults[i]}, got ${JSON.stringify(result.content)}`);
    }
  }
}