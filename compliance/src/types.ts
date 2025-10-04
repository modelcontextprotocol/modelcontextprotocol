import type { JSONRPCMessage } from '../../schema/draft/schema.js';

// Core scenario types
export type NameMap<T> = {
  [name: string]: T;
};

export type HasDescription = {
  description: string;
};

export type Scenarios = {
  servers: NameMap<HasDescription & {
    tools: NameMap<HasDescription>;
    resources: NameMap<HasDescription>;
    resourceTemplates: NameMap<HasDescription & { params: NameMap<HasDescription> }>;
    prompts: NameMap<HasDescription>;
    promptTemplates: NameMap<HasDescription & { params: NameMap<HasDescription> }>;
  }>;
  scenarios: {
    id: number; // Starts at 1, must be unique
    description: string; // e.g. "client1 connects to CalcServer and calls add(a=10, b=20), gets result of 30."
    client_ids: string[]; // e.g. ["client1"]
    server_name: string; // e.g. ["CalcServer"]
    http_only?: boolean;
  }[];
};

// Transport types
export type Transport = 'stdio' | 'sse' | 'streamable-http';

// Annotated log types for replay/verification
export type AnnotatedJSONRPCMessage = {
  from: string; // e.g. "client1", "client2", "CalcServer"
  to: string; // same values as from
  message: JSONRPCMessage;
  metadata?: {
    streamable_http_metadata?: {
      method: 'POST' | 'POST-SSE' | 'GET-SSE';
      headers: Record<string, string>;
    };
  };
};

// CLI configuration types
export type ServerConfig = {
  serverName: string;
  transport: Transport;
  host?: string;
  port?: number;
};

export type ClientConfig = {
  scenarioId: number;
  clientId: string;
  serverDesc: StdioServerDesc | HttpServerDesc;
};

export type StdioServerDesc = {
  type: 'stdio';
  command: string;
  args?: string[];
};

export type HttpServerDesc = {
  type: 'sse' | 'streamable-http';
  url: string;
};

// Test result types
export type TestResult = {
  scenarioId: number;
  clientSDK: string;
  serverSDK: string;
  transport: Transport;
  success: boolean;
  error?: string;
  capturedLog: AnnotatedJSONRPCMessage[];
  comparisonResult?: LogComparisonResult;
};

export type LogComparisonResult = {
  match: boolean;
  differences?: LogDifference[];
};

export type LogDifference = {
  index: number;
  expected: AnnotatedJSONRPCMessage;
  actual: AnnotatedJSONRPCMessage;
  reason: string;
};