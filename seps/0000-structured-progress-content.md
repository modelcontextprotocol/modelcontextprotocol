# SEP-0000: Structured Content for Progress Notifications

- **Status**: idea
- **Type**: Standards Track
- **Created**: 2026-04-22
- **Author(s)**: @stevehaertel - Steve Haertel
- **Sponsor**: TBD
- **PR**: TBD

## Abstract

This SEP proposes extending MCP progress notifications with an optional structured `content` field in addition to the existing human-readable `message` field. Today, `notifications/progress` supports numeric progress updates and a short text message, which is sufficient for simple status reporting but inadequate for interoperable, machine-readable progress events in modern tool, workflow, and multi-agent systems.

The proposed `content` field would allow implementations to attach a compact structured payload to a progress notification. A minimal interoperable shape would include `event`, `text`, `actor`, and `data`. The `data` object may carry event-specific fields, including common tool-oriented fields such as `toolName`, `input`, and `output`.

This proposal preserves backward compatibility by retaining `message` for simple clients while enabling richer clients and orchestration runtimes to render and reason about progress updates without parsing free-form strings. The intent is to improve interoperability for general-purpose progress reporting across MCP implementations, not to standardize any one application's UI model.

## Motivation

The current progress notification format is intentionally lightweight. It allows a sender to report:

- `progressToken`
- `progress`
- `total`
- `message`

This is enough for simple loading indicators and basic text updates, but it becomes limiting when a progress notification needs to communicate more than a single sentence.

This motivation was informed in part by a Langflow enhancement demonstration:

- https://github.com/langflow-ai/langflow/issues/12828

That work makes use of the existing `message`-based progress mechanism but it's easy to imagine possibilities to provide a richer, more transparent user experience during multi-step and delegated execution, and it highlights why a more structured protocol-level representation would be valuable.

In practice, progress updates often represent structured events rather than just text. Examples include:

- a tool call beginning
- a tool result being returned
- an agent step starting or completing
- a workflow stage transitioning
- a warning or partial result being emitted

Today, implementations that need richer progress semantics must either:

1. encode structured information into the free-form `message` string, which is not interoperable and requires clients to parse human-oriented text, or
2. emit richer data through implementation-specific side channels, which fragments the ecosystem.

This is especially limiting in systems involving tools, orchestration runtimes, and agent-to-agent delegation, where progress updates may benefit from identifying:

- what kind of event occurred
- who emitted it
- what tool was involved
- what input or output is relevant

A structured progress payload would make the protocol more generally useful without changing the semantics of existing progress notifications.

## Specification

### Summary

Extend `ProgressNotificationParams` with an optional `content` field.

Existing fields remain unchanged:

- `progressToken`
- `progress`
- `total`
- `message`

The new field is:

- `content` — an optional structured object describing the progress event

### Proposed Shape

The `content` field **SHOULD** be a structured object with the following minimal interoperable shape:

```ts
interface ProgressContent {
  event?: string;
  text?: string;
  actor?: {
    kind?: string;
    name?: string;
  };
  data?: Record<string, unknown>;
}
```

### Field Semantics

#### `content.event`

A machine-readable string describing the kind of progress event being reported.

Examples **MAY** include:

- `progress_update`
- `agent_step`
- `tool_call`
- `tool_result`

This SEP does not require a closed vocabulary of event names. Implementations **MAY** define additional event values. Future standardization **MAY** define a recommended vocabulary if needed.

#### `content.text`

Optional human-readable text associated with the event.

This may duplicate or elaborate on the top-level `message` field. If both `message` and `content.text` are present, they **SHOULD** be semantically aligned.

#### `content.actor`

Optional metadata describing the actor that emitted or is responsible for the progress event.

Examples include:

- an agent
- a tool
- a server component
- a workflow executor

The actor object is intentionally minimal in this proposal and includes only:

- `kind`
- `name`

Implementations **MAY** omit this field when actor identity is not relevant.

#### `content.data`

Optional event-specific structured payload.

For tool-oriented events, the following keys are especially useful and **MAY** make use of:

- `toolName`
- `input`
- `output`

These fields are siblings within `data`, not nested within one another.

For example:

- a `tool_call` event **MAY** include `toolName` and `input`
- a `tool_result` event **MAY** include `toolName` and `output`

Other event types **MAY** include other implementation-specific keys.

### Top-Level `message` Compatibility

The existing top-level `message` field remains valid and unchanged.

- Simple clients **MAY** continue to ignore `content` and render only `message`
- Richer clients **MAY** use `content` for structured handling and rendering
- Senders **MAY** continue to provide `message` when a human-readable summary is useful, even when `content` is present

### Example: Tool Call Progress

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/progress",
  "params": {
    "progressToken": "abc123",
    "progress": 50,
    "total": 100,
    "message": "Calling retrieval tool",
    "content": {
      "event": "tool_call",
      "text": "Calling retrieval tool",
      "actor": {
        "kind": "agent",
        "name": "catalog-assistant"
      },
      "data": {
        "toolName": "get_metadata",
        "input": {
          "productId": "ABC"
        }
      }
    }
  }
}
```

### Example: Tool Result Progress

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/progress",
  "params": {
    "progressToken": "abc123",
    "progress": 75,
    "total": 100,
    "message": "Retrieved metadata",
    "content": {
      "event": "tool_result",
      "text": "Retrieved metadata",
      "actor": {
        "kind": "agent",
        "name": "catalog-assistant"
      },
      "data": {
        "toolName": "get_metadata",
        "output": {
          "productId": "ABC",
          "status": "success"
        }
      }
    }
  }
}
```

### Schema and Documentation Updates

If accepted, this SEP would require updates to:

- `schema/draft/schema.ts`
- generated schema artifacts
- `docs/specification/draft/basic/utilities/progress.mdx`
- examples for `ProgressNotification` and `ProgressNotificationParams`

## Rationale

### Why Add `content` Instead of Expanding `message`

`message` is intentionally human-readable. It is useful for simple rendering but poorly suited for machine-readable semantics. Adding `content` preserves the simplicity of `message` while allowing structured progress information to be represented directly.

### Why Use a Small Structured Object

This proposal intentionally keeps the shape compact:

- `event`
- `text`
- `actor`
- `data`

A small contract improves the chance of broad adoption while still supporting the most common general-purpose use cases.

### Why Not Standardize Hierarchy Fields Now

This SEP does not propose fields such as parent identifiers, nesting identifiers, labels, or ordering semantics.

Such fields may be useful in some systems, but standardizing them now would overfit the proposal to specific orchestration and UI models. A smaller proposal is more likely to serve general-purpose progress reporting across the MCP ecosystem.

### Why `toolName`, `input`, and `output`

These fields map well to common tool and agent execution patterns and are understandable across many implementations.

They are proposed as recommended examples within `data`, not as exhaustive or mandatory keys. This gives implementations a common starting point without preventing other structured event data.

### Why Not Use Only Arbitrary `metadata`

A generic `metadata` or `data` field alone would provide flexibility, but without a minimal interoperable shape it would be difficult for clients to interpret progress events consistently.

By defining `event`, `text`, `actor`, and `data`, this proposal gives implementations a shared contract while preserving extensibility.

## Backward Compatibility

This change is backward-compatible.

- Existing clients that understand `notifications/progress` but do not recognize `content` can ignore it
- Existing servers and clients may continue using only `message`
- No existing field is removed or redefined

This proposal only adds an optional field and does not change the meaning of current progress notifications.

## Reference Implementation

A prototype demonstration related to this proposal exists in Langflow and is described here:

- https://github.com/langflow-ai/langflow/issues/12828

That demonstration uses the current, legacy progress mechanism based only on the top-level `message` field. Even with that limitation, it is an excellent example of why this enhancement would be useful: it shows how progress notifications can provide a richer, more transparent experience for users by surfacing intermediate tool and agent activity during execution.

At the same time, the demonstration highlights the limitations of relying on a single free-form `message` string for representing richer progress semantics. This SEP is intended to generalize that need into a protocol-level enhancement that works across MCP implementations, rather than defining a Langflow-specific solution.

A formal MCP reference implementation has not yet been added to this repository.

## Security Implications

This proposal does not introduce a new transport or execution capability. It only allows more structured data to be attached to an existing notification type.

However, implementers should consider the following:

- structured progress content may expose tool inputs or outputs that contain sensitive data
- clients should avoid rendering or logging structured progress content without applying existing privacy and redaction policies
- servers should avoid sending unnecessary sensitive material in `content.data`
- senders should avoid including excessively large inputs, outputs, or other structured payloads in progress updates
- implementations SHOULD consider rate limiting, truncation, summarization, or size limits for structured progress content to avoid excessive load on clients, servers, transports, logging pipelines, or intermediary infrastructure

These concerns already exist for free-form `message` strings and other MCP payloads, but structured content may make such data easier to capture, persist, and transmit at higher volume.

## Alternatives Considered

### 1. Keep `message` Only

Rejected because it forces implementations to encode machine-readable state into free-form text, which reduces interoperability.

### 2. Add a Generic `metadata` Field Only

Rejected because it is too underspecified. Different implementations would likely use incompatible shapes, limiting interoperability.

### 3. Standardize a Much Richer Event Model

Rejected for now because it would likely overfit the proposal to specific UI and orchestration systems. A smaller shape is more appropriate as an initial step.

### 4. Use Arrays of Content Blocks

Rejected for now because progress notifications typically represent a single event, and a single structured object is simpler. This can be revisited in the future if stronger alignment with other MCP content models is needed.

## References

- Current progress utility documentation: `/docs/specification/draft/basic/utilities/progress.mdx`
- Draft schema definition: `/schema/draft/schema.ts`
- SEP Guidelines: `/docs/community/sep-guidelines.mdx`
