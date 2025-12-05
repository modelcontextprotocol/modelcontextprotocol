+++
date = '2025-12-12T12:00:00Z'
title = 'Closing the Loop: Tool Support Comes to MCP Sampling'
author = 'Jonathan Hefner'
tags = ['sampling', 'tools', 'agentic']
+++

Tool use transformed LLMs from sophisticated text generators into agents capable of taking action in the world. Before tool use, you could ask an LLM about the weather and get a plausible-sounding guess. With tool use, it can actually check.

MCP extended that power to the ecosystem level — a standard way for agents to discover and invoke tools across any number of servers. But there was an asymmetry hiding in the architecture. While LLMs could be agentic, the tools they called could not. Even tools that used MCP's sampling feature to request LLM completions were limited to simple, one-shot text generation.

[SEP-1577](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1577) has changed that. MCP sampling now supports tool calling, which means tools themselves can drive agentic workflows.

## The gap in the architecture

Consider what happens when an LLM calls a tool today. The agent reasons about a task, decides it needs external capabilities, and invokes a tool exposed by an MCP server. That tool executes — maybe it queries a database, calls an API, or processes some data — and returns a result. The agent incorporates that result and continues reasoning.

This works well when tools are simple functions. But what if a tool needs to be smart? What if it needs to reason, make decisions, or coordinate multiple steps to produce its result?

MCP's sampling feature was designed for exactly this case. It allows servers to request LLM completions from the client, using the client's model access and respecting user oversight. A tool implementation could use sampling to get help from an LLM.

But sampling, as originally specified, only supported simple text generation. A server could make multiple sampling calls and chain them together with code — but that code couldn't reason. It could follow predetermined logic paths, but it couldn't reason about what was missing or adapt on the fly. The server could ask the LLM questions, but the LLM couldn't drive the investigation. This effectively capped sampling's power at pre-tool-calling levels — tools could get answers from an LLM, but they couldn't delegate agentic behavior to one.

This meant tools couldn't be truly agentic. They could _ask_ an LLM for help, but that LLM couldn't _do_ anything — it could only talk.

## What SEP-1577 adds

SEP-1577 introduces two new parameters to the `sampling/createMessage` request: `tools` and `toolChoice`. These let a server provide tool definitions when requesting a completion, and the LLM can call those tools as part of its response.

```typescript
const result = await mcpServer.server.createMessage({
  messages: [
    {
      role: "user",
      content: {
        type: "text",
        text: "Research the latest developments in fusion energy and summarize the key breakthroughs.",
      },
    },
  ],
  tools: [
    {
      name: "web_search",
      description: "Search the web for current information",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: ["query"],
      },
    },
  ],
  toolChoice: { mode: "auto" },
  maxTokens: 2000,
});
```

When the LLM decides to use a tool, the response comes back with `stopReason: "toolUse"` and includes `tool_use` content blocks describing what the LLM wants to invoke. The server then executes those tools, sends the results back in a follow-up sampling request, and the LLM continues — potentially calling more tools until it's ready to produce a final response.

This is the standard agentic loop, but now it can happen _inside_ a tool implementation.

## How the loop works

Here's the complete flow:

1. A host application's LLM calls a tool on your server.
2. Your tool implementation needs LLM capabilities to do its job.
3. Your server calls `sampling/createMessage` with the `tools` parameter.
4. The LLM reasons and decides to call one of your tools.
5. The response comes back with `stopReason: "toolUse"`.
6. Your server executes the tool and gets a result.
7. Your server calls `sampling/createMessage` again, including the tool result.
8. Steps 4-7 repeat until the LLM returns `stopReason: "endTurn"`.
9. Your tool returns its result to the original LLM.
10. That LLM can now call more tools — each potentially agentic themselves.

The key insight is that the server drives the tool loop. The host application's job is to provide LLM access and maintain human oversight. The server decides what tools to expose, executes them when called, and determines when the loop is complete.

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  SamplingMessage,
  Tool,
  TextContent,
  ToolUseContent,
} from "@modelcontextprotocol/sdk/types.js";

async function agenticSampling(
  mcpServer: McpServer,
  messages: SamplingMessage[],
  tools: Tool[],
  maxIterations = 10,
): Promise<string> {
  const conversation = [...messages];

  for (let i = 0; i < maxIterations; i++) {
    const { content, stopReason } = await mcpServer.server.createMessage({
      messages: conversation,
      tools,
      toolChoice: { mode: "auto" },
      maxTokens: 4096,
    });

    const contentArray = Array.isArray(content) ? content : [content];

    conversation.push({ role: "assistant", content: contentArray });

    // Any stop reason other than "toolUse" means the LLM is done
    if (stopReason !== "toolUse") {
      return contentArray
        .filter((c): c is TextContent => c.type === "text")
        .map((c) => c.text)
        .join("");
    }

    // Execute tool calls and collect results
    const toolUses = contentArray.filter(
      (c): c is ToolUseContent => c.type === "tool_use",
    );

    const toolResults = await Promise.all(
      toolUses.map(async (toolUse) => ({
        type: "tool_result" as const,
        toolUseId: toolUse.id,
        content: [await executeTool(toolUse.name, toolUse.input)],
      })),
    );

    conversation.push({ role: "user", content: toolResults });
  }

  throw new Error("Max iterations reached");
}

async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<TextContent> {
  // Dispatch to your tool implementations...
}
```

## What this enables

With agentic sampling, tools can be as sophisticated as the agents that call them. A few examples:

**Research tools** can search multiple sources, cross-reference findings, and synthesize coherent summaries — rather than returning raw search results for the outer agent to process.

**Code generation tools** can write code, run tests, observe failures, and iterate until the tests pass — returning working code instead of a first draft.

**Data analysis tools** can explore datasets, form hypotheses, run queries to test them, and produce insights — not just execute predetermined queries.

**Document processing tools** can read documents, extract information, and produce structured outputs — handling complexity internally through iterative reasoning.

The pattern extends naturally. Any tool that would benefit from reasoning, iteration, or multi-step workflows can now implement them directly.

## Capability negotiation

Not all clients will support tool use in sampling immediately. SEP-1577 adds a capability flag so servers can detect support:

```typescript
interface ClientCapabilities {
  sampling?: {
    tools?: object; // Present if tools/toolChoice are supported
  };
}
```

Servers should check for this capability at connection time. For tools that require agentic sampling to function, the simplest approach is to omit them from `tools/list` when the capability is absent — the client will only see tools that will actually work. For tools that can function with degraded capability, consider implementing a graceful fallback to text-only sampling, perhaps noting the limitation in the tool's output so the outer LLM has context.

## A note on `includeContext`

SEP-1577 also soft-deprecates the `"thisServer"` and `"allServers"` values of the `includeContext` parameter. These values — which allowed servers to request that the client include conversation context from the current or all connected servers — had ambiguous semantics that made it difficult for clients to implement consistently. This ambiguity contributed to low adoption of sampling overall.

The `"thisServer"` and `"allServers"` values are now fenced behind a separate `sampling.context` capability. Servers should avoid using them, and they may be removed in a future specification version.

If your server currently uses `includeContext`, consider migrating to explicit context management — passing the information you need directly in your sampling messages.

## Getting started

SEP-1577 is part of MCP version `2025-11-25`. See the [sampling specification](https://modelcontextprotocol.io/specification/2025-11-25/client/sampling) for full protocol details.

SDK support is available in:

- **TypeScript SDK**: Version 1.23.0+ ([PR #1101](https://github.com/modelcontextprotocol/typescript-sdk/pull/1101))
- **Python SDK**: Version 1.23.0+ ([PR #1594](https://github.com/modelcontextprotocol/python-sdk/pull/1594))

To experiment with agentic sampling, update to an SDK version that includes these changes and ensure you're connecting to a client that advertises the `sampling.tools` capability.

## Acknowledgements

Thanks to [Olivier Chafik](https://github.com/ochafik) for authoring SEP-1577 and driving it through the proposal process, and to [Basil Hosmer](https://github.com/bhosmer-ant) for sponsoring the proposal. Thanks also to the community members who provided feedback during the review period.
