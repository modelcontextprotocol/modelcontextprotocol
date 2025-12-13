---
SEP: XXXX
Title: Conversation Event Subscriptions
Status: Draft
Type: Standards Track
Created: 2025-12-13
Author: Varun Sharma <29.varuns@gmail.com>
PR: (to be filled after PR creation)
---

# SEP: Conversation Event Subscriptions

## Abstract

This proposal adds an optional `conversationEvents` capability that allows MCP servers to subscribe to conversation-level events. When a user sends a message, subscribed servers receive the message content and can respond with context to inject into the LLM's prompt. This enables automatic memory systems, knowledge bases, and context-aware assistants that work without requiring explicit tool calls.

## Motivation

I'm building a memory system for AI assistants ([shodh-memory](https://github.com/varun29ankuS/shodh-memory)). The goal is simple: when a user asks "what did we discuss about the database schema?", relevant memories should surface automatically.

But MCP doesn't let me do this.

Right now, my server only knows something happened when the assistant explicitly calls a tool. If the assistant forgets to call `recall()`, or decides it doesn't need to - my memory system is blind. The user gets no context from previous sessions.

I've tried workarounds:

- **Strong tool descriptions** ("REQUIRED: call this on every message") - LLMs don't always follow instructions
- **Piggyback on other tools** - only works when tools are called, misses pure conversation
- **Client-side hooks** - requires users to set up scripts, too much friction

None of these are real solutions. They're hacks around a protocol limitation.

This isn't just about memory. Other use cases blocked by this limitation:

- **Knowledge bases** that surface relevant docs based on the question
- **Project context** that reminds the assistant about codebase conventions
- **User preferences** that personalize responses automatically

All of these need to see the conversation to work without explicit tool calls.

## Specification

### New Capability

Servers declare interest in conversation events during initialization:

```typescript
interface ServerCapabilities {
  conversationEvents?: {
    onUserMessage?: boolean;
  };
}
```

### Message Flow

1. **Client receives user message**
2. **Client sends `conversation/userMessage` notification** to all servers with `onUserMessage: true`
3. **Servers respond with `conversation/context`** containing context to inject (or empty response)
4. **Client prepends context to LLM prompt**
5. **Normal message processing continues**

### conversation/userMessage

Notification sent from client to server.

```typescript
interface ConversationUserMessageParams {
  // Unique message identifier
  messageId: string;

  // The user's message content
  content: string;

  // Optional: recent conversation history for context
  recentHistory?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}
```

### conversation/context

Response from server to client.

```typescript
interface ConversationContextResult {
  // Plain text context to prepend to prompt
  context?: string;

  // Or structured context (client renders appropriately)
  structuredContext?: {
    memories?: Array<{
      content: string;
      relevance: number;
      source?: string;
    }>;
  };
}
```

### Timeouts

Clients MUST enforce a timeout (recommended: 500ms) for server responses. Slow or unresponsive servers are skipped - the conversation continues without their context.

### Error Handling

If a server returns an error or times out:

- Client logs the error
- Conversation proceeds without that server's context
- Client MAY retry on subsequent messages

## Rationale

### Why notifications, not tools?

Tools require the LLM to decide to call them. For automatic context injection, the decision should be made by the system, not the LLM. A notification-based approach ensures context is always surfaced regardless of LLM behavior.

### Why not just improve tool descriptions?

LLMs don't reliably follow instructions like "always call this tool first". Even with strong prompting, compliance varies by model and context. Automatic mechanisms are more reliable.

### Why a new capability vs extending resources?

Resources are pull-based (client requests them). This use case requires push-based behavior (server injects context). A new capability better models the actual interaction pattern.

## Backward Compatibility

This is purely additive:

- Servers that don't declare `conversationEvents` work exactly as before
- Clients that don't support this capability ignore the server's declaration
- No existing messages or capabilities are modified

## Security Implications

**Privacy**: Servers with `onUserMessage` capability see the full conversation. Clients should:

- Require explicit user consent before enabling this capability
- Display which servers have conversation access
- Allow users to revoke access per-server

**Denial of Service**: A malicious server could slow down conversations. Mitigated by:

- Strict timeouts (500ms recommended)
- Clients may disable servers that repeatedly timeout

**Content Injection**: Servers can inject arbitrary context. Clients should:

- Clearly mark injected context as coming from external servers
- Consider sandboxing or filtering injected content

## Reference Implementation

[shodh-memory](https://github.com/varun29ankuS/shodh-memory) will implement this capability once accepted. The implementation would:

1. Subscribe to `onUserMessage` events
2. Extract entities and embeddings from user message
3. Query memory store for relevant context
4. Return formatted context for injection

## Open Questions

1. Should there be a limit on context size servers can inject?
2. Should clients support priority ordering when multiple servers inject context?
3. Should `onAssistantResponse` be included for servers that want to see responses too?

---

Happy to iterate on any of these details. The core ask: let servers see the conversation so they can provide automatic context.
