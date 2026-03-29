# SEP: Event-Driven Tool Invocation (Server-Push → LLM Re-entry)

| Field    | Value                                                    |
|----------|----------------------------------------------------------|
| SEP      | 0000                                                     |
| Title    | Event-Driven Tool Invocation (Server-Push → LLM Re-entry) |
| Status   | Draft                                                    |
| Type     | Standards Track                                          |
| Created  | 2026-03-29                                               |
| Author   | Heiko Friedrich (heikofriedrich75@gmail.com)             |
| Sponsor  | *TBD*                                                    |
| PR       | *TBD*                                                    |

## Abstract

This SEP proposes an event-driven re-entry mechanism for MCP that allows servers to trigger a new LLM turn in response to asynchronous events. Currently, MCP follows a strict request-response pattern: the LLM client can call tools on the server, but the server cannot initiate a new LLM turn when an event occurs. While MCP supports server-to-client notifications (e.g., `notifications/tools/list_changed`), these only update metadata — they never re-enter the LLM loop. This limitation prevents real-time, interactive applications where the LLM acts as the orchestrator reacting to user interactions, sensor data, webhooks, or other asynchronous events from the server side.

## Motivation

The current request-response model of MCP makes the LLM a passive participant rather than an active orchestrator in interactive scenarios. Consider the following concrete example:

**Interactive Desktop App via MCP:**

An MCP server (N.E.O.) provides tools for compiling, previewing, and interacting with live Avalonia desktop applications. The intended workflow:

1. LLM calls `compile_and_preview` → App window appears with a "Generate Quote" button
2. LLM calls `subscribe_events` → Server starts collecting UI events
3. User clicks the button in the app
4. Server detects the click event
5. **GAP:** The server has no way to notify the LLM client that an event occurred and trigger a new assistant turn
6. LLM should automatically call `get_events`, read the click, then call `inject_data` to display a quote and `set_property` to change the background color

What actually happens today: The user must manually send a chat message ("I clicked the button") to prompt the LLM to poll `get_events`. This breaks the interactive experience entirely.

This limitation affects a wide range of use cases:

- **Live dashboards**: Server pushes data updates, LLM re-renders visualizations
- **Chat bots with external triggers**: Webhooks, emails, or messages arrive and the LLM reacts
- **IoT / sensor monitoring**: Threshold alerts trigger LLM analysis
- **Collaborative editing**: Multiple users interact with a shared app, LLM orchestrates
- **Game loops**: User makes a move, server detects it, LLM responds
- **Form wizards**: User fills step 1, LLM dynamically generates step 2 based on input
- **Long-running tasks**: Server signals completion, LLM presents results

### Current Workarounds (All Suboptimal)

| Workaround | Problem |
|---|---|
| User manually messages the LLM to poll | Breaks interactivity, poor UX |
| Build all logic into the app itself | Defeats the purpose of LLM orchestration |
| Client-side polling on a timer | Wasteful, not supported by most LLM hosts |

## Specification

This SEP proposes three alternative approaches. The community should discuss and converge on one (or a combination).

### Option A: `notifications/events/occurred` (Lightweight)

A new notification type that the client (LLM host) can subscribe to. When received, the host automatically starts a new assistant turn with the event payload injected as context.

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/events/occurred",
  "params": {
    "source": "generateBtn",
    "eventType": "Click",
    "data": { "timestamp": "2026-03-29T14:30:00Z" },
    "hint": "The user clicked the Generate Quote button. Process this event."
  }
}
```

**Behavior:**
- The client receives the notification and decides whether to initiate a new LLM turn.
- The `hint` field provides optional context for the LLM.
- The `data` field contains arbitrary JSON payload from the event.
- Clients that do not support this notification type simply ignore it (backward compatible).

### Option B: `server.requestTurn` (Explicit)

A new server-to-client request (not just a notification) that explicitly asks the host to start a new LLM turn. The server can include context and suggested tool calls.

```json
{
  "jsonrpc": "2.0",
  "method": "server.requestTurn",
  "id": "evt-1",
  "params": {
    "reason": "ui_event",
    "context": "User clicked 'Generate Quote' button",
    "suggestedTools": ["inject_data", "set_property"]
  }
}
```

**Behavior:**
- This is a request, so the client responds with an acknowledgment.
- The client may or may not honor the request based on user preferences/permissions.
- `suggestedTools` is an optional hint to the LLM about which tools may be relevant.

### Option C: Event Subscriptions with Callback Configuration

Allow the LLM to register a "callback configuration" at subscription time, telling the server what should happen when events occur:

```json
{
  "method": "tools/call",
  "params": {
    "name": "subscribe_events",
    "arguments": {
      "eventTypes": ["Click"],
      "onEvent": {
        "re_enter": true,
        "injectContext": "A UI event occurred. Poll get_events and react accordingly."
      }
    }
  }
}
```

**Behavior:**
- The `onEvent.re_enter` flag indicates the client should start a new LLM turn when matching events occur.
- The `injectContext` string is prepended to the new turn as system/user context.

### Capability Negotiation

Servers advertise support for event-driven re-entry during initialization:

```json
{
  "capabilities": {
    "events": {
      "supported": true,
      "methods": ["notifications/events/occurred"]
    }
  }
}
```

Clients that support this capability include it in their client capabilities during the `initialize` handshake.

### Rate Limiting

To prevent event flooding:
- Clients SHOULD implement rate limiting on incoming event notifications.
- Clients MAY batch multiple events into a single LLM turn.
- Servers SHOULD respect a `maxEventsPerMinute` parameter if provided by the client during capability negotiation.

## Rationale

**Why not just use existing notifications?**
Existing notifications like `notifications/tools/list_changed` are metadata updates. They don't carry event payloads and are not designed to trigger LLM re-entry. Extending them would conflate two different concerns.

**Why three options?**
Each option represents a different trade-off between simplicity and control. Option A is the simplest and most backward-compatible. Option B gives the client more control. Option C gives the LLM more control over when and how re-entry happens. The community should converge on one approach.

**Why not polling?**
Polling is wasteful, adds latency, and most LLM hosts do not support autonomous polling loops. Event-driven push is the standard approach for real-time systems.

## Backward Compatibility

All three options are designed to be backward compatible:

- **Option A** uses the existing notification mechanism. Clients that do not understand `notifications/events/occurred` simply ignore it per the JSON-RPC specification.
- **Option B** introduces a new request method. Clients that do not support it return a "method not found" error, and the server can handle this gracefully.
- **Option C** extends tool call arguments. Servers that do not support `onEvent` ignore the unknown field.

No existing behavior is changed. This is a purely additive feature.

## Security Implications

- **Event flooding**: A malicious or buggy server could send excessive events, causing high LLM API costs and resource consumption. Rate limiting (as specified above) mitigates this.
- **Unauthorized re-entry**: Clients MUST provide granular control over which servers can trigger re-entry. Users should be able to opt-in/out per server.
- **Context injection**: The `hint` and `injectContext` fields allow servers to influence LLM behavior. Clients SHOULD clearly mark event-injected context as originating from the server, not the user.
- **Denial of service**: The `maxEventsPerMinute` capability and client-side rate limiting prevent resource exhaustion.
- **User confirmation**: The host MAY require user confirmation before honoring `requestTurn` requests, similar to how tool calls can require approval.

## Reference Implementation

*To be completed before this SEP can reach "Final" status.*

A proof-of-concept implementation is planned using:
- **Server**: N.E.O. MCP server (Avalonia desktop app compilation and live preview)
- **Client**: A modified MCP client that supports `notifications/events/occurred`
- **Demo**: A motivational quote generator app where button clicks trigger LLM-driven content generation without manual user intervention

## Alternatives Considered

1. **Long polling via tool calls**: The LLM calls a `wait_for_event` tool that blocks until an event occurs. This conflicts with the stateless nature of tool calls and causes timeout issues.
2. **WebSocket sideband**: A separate WebSocket connection for events, parallel to the MCP transport. This adds complexity and does not integrate with the LLM turn lifecycle.
3. **Sampling API extension**: Using the existing `sampling` capability where the server requests the client to generate a completion. While related, sampling is designed for server-initiated LLM calls, not for triggering a full client-side assistant turn with tool access.

## Open Questions

1. Should there be a standard event schema, or should events be fully opaque to the protocol?
2. How should event batching work — should the client coalesce events into a single turn, or create separate turns?
3. Should there be a maximum payload size for event data?
4. How does this interact with the existing `sampling` capability?
5. Should the protocol define standard event types (e.g., `ui.click`, `data.updated`, `task.completed`)?

## Environment

- **MCP Spec Version**: 2025-03-26
- **Affected transports**: All (stdio, Streamable HTTP, SSE)
- **Client context**: Claude.ai (Anthropic), but this is a protocol-level concern
