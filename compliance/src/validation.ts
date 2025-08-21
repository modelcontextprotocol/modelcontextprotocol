import { z } from 'zod';
import { readFileSync } from 'node:fs';
import type { Scenarios, AnnotatedJSONRPCMessage } from './types.js';

// Zod schemas for validation
const HasDescriptionSchema = z.object({
  description: z.string().min(1),
});

const NameMapSchema = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.record(z.string(), valueSchema);

const ServerSchema = HasDescriptionSchema.extend({
  tools: NameMapSchema(HasDescriptionSchema),
  resources: NameMapSchema(HasDescriptionSchema),
  resourceTemplates: NameMapSchema(
    HasDescriptionSchema.extend({
      params: NameMapSchema(HasDescriptionSchema),
    })
  ),
  prompts: NameMapSchema(HasDescriptionSchema),
  promptTemplates: NameMapSchema(
    HasDescriptionSchema.extend({
      params: NameMapSchema(HasDescriptionSchema),
    })
  ),
});

const ScenarioSchema = z.object({
  id: z.number().int().positive(),
  description: z.string().min(1),
  client_ids: z.array(z.string()).min(1),
  server_name: z.string().min(1),
  http_only: z.boolean().optional(),
});

export const ScenariosSchema = z.object({
  servers: NameMapSchema(ServerSchema),
  scenarios: z.array(ScenarioSchema),
});

// Validation functions
export function validateScenarios(data: unknown): Scenarios {
  const result = ScenariosSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Invalid scenarios data: ${result.error.message}`);
  }
  
  // Additional validation: ensure scenario IDs are unique
  const scenarioIds = new Set<number>();
  for (const scenario of result.data.scenarios) {
    if (scenarioIds.has(scenario.id)) {
      throw new Error(`Duplicate scenario ID: ${scenario.id}`);
    }
    scenarioIds.add(scenario.id);
  }
  
  // Ensure referenced server names exist
  for (const scenario of result.data.scenarios) {
    if (!result.data.servers[scenario.server_name]) {
      throw new Error(
        `Scenario ${scenario.id} references non-existent server: ${scenario.server_name}`
      );
    }
  }
  
  return result.data;
}

// JSON-RPC message validation
const JSONRPCMessageSchema = z.union([
  // Request
  z.object({
    jsonrpc: z.literal('2.0'),
    id: z.union([z.string(), z.number()]),
    method: z.string(),
    params: z.any().optional(),
  }),
  // Notification (no id field)
  z.object({
    jsonrpc: z.literal('2.0'),
    method: z.string(),
    params: z.any().optional(),
  }),
  // Response (has result)
  z.object({
    jsonrpc: z.literal('2.0'),
    id: z.union([z.string(), z.number()]),
    result: z.any(),
  }),
  // Error (has error)
  z.object({
    jsonrpc: z.literal('2.0'),
    id: z.union([z.string(), z.number()]),
    error: z.object({
      code: z.number(),
      message: z.string(),
      data: z.any().optional(),
    }),
  }),
]);


const AnnotatedJSONRPCMessageSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  message: JSONRPCMessageSchema,
  metadata: z
    .object({
      streamable_http_metadata: z
        .object({
          method: z.enum(['POST', 'POST-SSE', 'GET-SSE']),
          headers: z.record(z.string()),
        })
        .optional(),
    })
    .optional(),
});

export function validateAnnotatedLog(data: unknown): AnnotatedJSONRPCMessage[] {
  if (!Array.isArray(data)) {
    throw new Error('Log must be an array');
  }
  
  const messages: AnnotatedJSONRPCMessage[] = [];
  for (let i = 0; i < data.length; i++) {
    const result = AnnotatedJSONRPCMessageSchema.safeParse(data[i]);
    if (!result.success) {
      throw new Error(`Invalid message at index ${i}: ${result.error.message}`);
    }
    messages.push(result.data as AnnotatedJSONRPCMessage);
  }
  
  return messages;
}

// Log comparison utilities
export function normalizeLogForComparison(
  log: AnnotatedJSONRPCMessage[]
): AnnotatedJSONRPCMessage[] {
  // Remove non-deterministic fields for comparison
  return log.map(entry => ({
    ...entry,
    metadata: entry.metadata?.streamable_http_metadata
      ? {
          streamable_http_metadata: {
            ...entry.metadata.streamable_http_metadata,
            headers: Object.fromEntries(
              Object.entries(entry.metadata.streamable_http_metadata.headers)
                .filter(([key]) => {
                  // Filter out non-deterministic headers
                  const normalized = key.toLowerCase();
                  return ![
                    'date',
                    'x-request-id',
                    'x-trace-id',
                    'user-agent',
                  ].includes(normalized);
                })
                .sort(([a], [b]) => a.localeCompare(b))
            ),
          },
        }
      : undefined,
  }));
}

export function compareNormalizedLogs(
  expected: AnnotatedJSONRPCMessage[],
  actual: AnnotatedJSONRPCMessage[]
): boolean {
  if (expected.length !== actual.length) {
    return false;
  }
  
  for (let i = 0; i < expected.length; i++) {
    const exp = expected[i];
    const act = actual[i];
    
    // Deep comparison
    if (JSON.stringify(exp) !== JSON.stringify(act)) {
      return false;
    }
  }
  
  return true;
}

// Parse JSONL log file with support for comment lines
export function parseJSONLLog(filePath: string): {
  description?: string;
  messages: AnnotatedJSONRPCMessage[];
} {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  
  const commentLines: string[] = [];
  const messages: AnnotatedJSONRPCMessage[] = [];
  
  for (const line of lines) {
    if (line.startsWith('//')) {
      // Extract comment content (remove // prefix and trim)
      commentLines.push(line.substring(2).trim());
    } else {
      // Parse JSON line
      try {
        const parsed = JSON.parse(line);
        const result = AnnotatedJSONRPCMessageSchema.safeParse(parsed);
        if (!result.success) {
          throw new Error(`Invalid message: ${result.error.message}`);
        }
        messages.push(result.data as AnnotatedJSONRPCMessage);
      } catch (error) {
        throw new Error(`Failed to parse line: ${line}\n${error}`);
      }
    }
  }
  
  return {
    description: commentLines.length > 0 ? commentLines.join('\n') : undefined,
    messages,
  };
}