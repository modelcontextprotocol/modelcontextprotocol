# SEP-2669: Task Interaction Methods

- **Status**: Draft
- **Type**: Extensions Track
- **Created**: 2026-04-30
- **Author(s)**: Pedram Rezaei (@prezaei)
- **Sponsor**: None (seeking sponsor)
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2669
- **Requires**: [SEP-2663](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2663) (Tasks Extension, in-review)

## Abstract

This SEP extends the MCP Tasks extension ([SEP-2663](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2663), currently in-review) with three methods for interacting with running tasks: `tasks/steer` (unsolicited feedback), `tasks/pause` (cooperative halt), and `tasks/resume` (continue from paused). Together, these enable human-in-the-loop and agent-in-the-loop patterns for long-running task execution — the ability to redirect, pause, and resume work without cancelling and losing accumulated state.

These methods follow the design patterns established by SEP-2663: they use the reserved `tasks/` method prefix, carry `taskId` as the routing key, and respect the consistency model (ack-only writes, cooperative operations, capability negotiation).

## Motivation

SEP-2663 provides the foundation for durable, asynchronous task execution: create a task, poll for status, deliver input when requested, cancel if needed. This covers the lifecycle, but treats the running task as a closed box — the only client interactions are responding to server-initiated input requests (`tasks/update`) and terminating (`tasks/cancel`).

For subagent-as-a-service — where a parent agent or human user delegates work to a specialist agent consumed over MCP — two interaction patterns are missing:

### 1. Mid-run redirection (steering)

Once a task starts, there is no way for a user or parent agent to provide unsolicited feedback. The only input path is `tasks/update`, which responds to specific `inputRequests` the server issued. If a user watching a research agent wants to say "focus on academic sources" or "skip the unit tests," they must cancel the task and start over, losing all accumulated context and partial results.

This is table-stakes for multi-agent UX. Deployed human-in-the-loop agent systems (GitHub Copilot, Cursor, Windsurf, Devin) each implement their own form of mid-run feedback, but with no standard mechanism. The absence of a protocol-level primitive forces each to invent its own, fragmenting the ecosystem — exactly the outcome MCP's "convergence over choice" principle aims to prevent.

### 2. Pause and resume

Long-running tasks (browser automation, multi-step research, code generation) often reach a point where continuation should be deferred — the user wants to review partial output before continuing, a billing checkpoint has been reached, or the server needs to hold resources (e.g., a browser VM) without actively computing.

Today the only options are "let it run" or "cancel and lose everything." Cancel is destructive — it discards accumulated context, partial results, and in-flight computation. A research agent 20 minutes into a deep investigation shouldn't lose everything because the user wants to think. Pause preserves state. Resume continues from where it left off.

Server-initiated pause is equally important: a browser automation server that has completed the user's ask but wants to hold the VM for potential follow-up has no way to signal "I'm done for now but available" without either completing (losing the VM) or staying in `working` indefinitely (confusing monitoring and billing).

### Why not use existing primitives?

- **`tasks/update` for steering?** `tasks/update` delivers `inputResponses` keyed to specific `inputRequests` the server issued. Steering is unsolicited — the user is providing new direction the server didn't ask for. Putting steering into `tasks/update` would require the server to issue a permanent open-ended `inputRequest` just to receive feedback, which is a protocol anti-pattern: it conflates "I need specific information to proceed" with "I accept general feedback at any time."

- **`tasks/cancel` + restart for pause?** Cancel is destructive. It discards accumulated state and signals "I don't want this anymore." Pause signals "I want to keep this but not right now." These are fundamentally different semantics that should not be overloaded on the same method.

- **Custom tools for steering?** A server could expose a `steer_task` tool, but tools are designed for LLM-initiated actions, not human-initiated feedback. The parent agent would need to decide to call the tool, adding unnecessary indirection. Protocol-level steering gives harnesses (IDEs, web UIs) a standard way to forward user feedback without routing through the model.

## Specification

### Extension Identifier

This extension builds on `io.modelcontextprotocol/tasks` (SEP-2663). It does not define a new top-level extension — instead, it adds sub-capabilities within the Tasks extension:

```jsonc
{
  "capabilities": {
    "extensions": {
      "io.modelcontextprotocol/tasks": {
        "steer": true,
        "pause": true    // implies resume
      }
    }
  }
}
```

Clients discover support via `server/discover`. Clients that call an unsupported method receive `-32601` (Method not found).

### `tasks/steer`

Send unsolicited feedback from a parent agent or user to a running task. The message is queued and delivered at the next server-determined checkpoint where the task can safely accept external input.

#### Request

```typescript
interface TaskSteerRequest extends JSONRPCRequest {
  method: "tasks/steer";
  params: {
    /**
     * ID of the task to steer.
     */
    taskId: string;

    /**
     * Natural language feedback or instruction.
     * Delivered at the next server-determined safe point.
     */
    message: string;

    /**
     * Opaque server state, round-tripped by the client.
     */
    requestState?: string;
  };
}
```

#### Response

```typescript
type TaskSteerResult = Result;  // empty acknowledgment, resultType: "complete"
```

#### Behavioral Requirements

- **Ack-only, eventually consistent.** Follows the same pattern as `tasks/update` and `tasks/cancel`. The server acks immediately; the steer message is queued for delivery at the next safe point.
- **Safe point is server-determined.** The protocol does not prescribe what constitutes a safe point — for an LLM-based agent it may be between inference steps or tool calls; for a pipeline it may be between stages; for a batch job it may be at explicit checkpoints. The server defines this based on its execution model.
- **Queue semantics.** Multiple steer messages MAY be queued. Delivery order MUST match submission order.
- **Accepted on `working` and `paused` tasks.** A task in `paused` state accepts `tasks/steer` — messages are queued for delivery when the task resumes.
- **Rejected on terminal tasks.** A task in `completed`, `failed`, or `cancelled` status MUST reject `tasks/steer` with `-32602` (Invalid params). This diverges from `tasks/update`/`tasks/cancel` (which ack unconditionally) because delivering queued messages to a completed task would create confusion about whether the steer had any effect.
- **Silent ack for invalid `taskId`.** Consistent with `tasks/update` and `tasks/cancel`, the server MUST ack even for invalid or nonexistent task IDs.

#### Streamable HTTP

The `Mcp-Name` header MUST be set to `params.taskId`, consistent with other task methods.

### `tasks/pause`

Request cooperative halt of a running task at the next safe point. Adds a `paused` status to the task lifecycle.

#### Request

```typescript
interface TaskPauseRequest extends JSONRPCRequest {
  method: "tasks/pause";
  params: {
    /**
     * ID of the task to pause.
     */
    taskId: string;

    /**
     * Opaque server state, round-tripped by the client.
     */
    requestState?: string;
  };
}
```

#### Response

```typescript
type TaskPauseResult = Result & DetailedTask;
```

The `resultType` field MUST be `"complete"`. The response carries the current `DetailedTask` so the client knows whether the server actually transitioned to `paused` or could not pause at this point.

#### Behavioral Requirements

- **Cooperative.** The server is not required to support pause. Servers that do not support it MUST return `-32601` (Method not found). Servers that support it but cannot pause at the current execution point SHOULD return the current `DetailedTask` with status unchanged.
- **Reachable from `working` or `input_required`.** Pausing from other statuses MUST return `-32602` (Invalid params).
- **Safe point halt.** The server halts at the next server-determined checkpoint, same as `tasks/steer` delivery points.
- **A `paused` task accepts:** `tasks/steer` (queued for delivery on resume), `tasks/cancel`, `tasks/resume`, `tasks/get`.
- **A `paused` task does NOT accept:** `tasks/update` (resume first, then provide input), `tasks/pause` (already paused — return `-32602`).
- **Server-initiated pause.** The server MAY transition a task to `paused` without a client `tasks/pause` request. Use cases include: resource management (holding a VM after completing the user's ask), billing checkpoints, or concurrency throttling. The client discovers the transition via `tasks/get` polling or `notifications/tasks/status`.
- **`inputRequests` survive pause/resume.** When a task transitions from `input_required` to `paused` and back, the pending `inputRequests` MUST remain valid with the same keys and semantics. The server MUST NOT invalidate or replace `inputRequests` as a side effect of pause/resume. If the server needs different input after resume, it MUST transition to `input_required` with new keys.

#### Streamable HTTP

The `Mcp-Name` header MUST be set to `params.taskId`.

### `tasks/resume`

Resume execution of a paused task.

#### Request

```typescript
interface TaskResumeRequest extends JSONRPCRequest {
  method: "tasks/resume";
  params: {
    /**
     * ID of the task to resume.
     */
    taskId: string;

    /**
     * Opaque server state, round-tripped by the client.
     */
    requestState?: string;
  };
}
```

#### Response

```typescript
type TaskResumeResult = Result & DetailedTask;
```

The `resultType` field MUST be `"complete"`. The response carries the `DetailedTask` with the post-resume status (typically `working` or `input_required` if input was pending before pause).

#### Behavioral Requirements

- **Cooperative.** Same as `tasks/pause` — servers that don't support it return `-32601`.
- **Paired with `tasks/pause`.** If a server supports `tasks/pause`, it MUST also support `tasks/resume`.
- **Only valid from `paused` status.** Resuming from any other status MUST return `-32602` (Invalid params).
- **Post-resume state is server-determined.** The server transitions to whatever status is appropriate. The client polls `tasks/get` for subsequent updates.
- **Queued steer messages are delivered after resume.** Any `tasks/steer` messages queued during the paused state are delivered at the next safe point after execution resumes.

#### Streamable HTTP

The `Mcp-Name` header MUST be set to `params.taskId`.

### Task Status: `paused`

This extension adds `paused` to the task status values:

```typescript
type TaskStatus = "working" | "input_required" | "completed" | "cancelled" | "failed" | "paused";
```

| Property | Value |
|----------|-------|
| Reachable from | `working`, `input_required` (via `tasks/pause` or server-initiated) |
| Transitions to | `working` (via `tasks/resume`), `cancelled` (via `tasks/cancel`), `failed` (server error while paused) |
| Terminal | No |

A `PausedTask` variant is added to `DetailedTask`:

```typescript
interface PausedTask extends Task {
  status: "paused";
}

type DetailedTask =
  | WorkingTask
  | InputRequiredTask
  | CompletedTask
  | FailedTask
  | CancelledTask
  | PausedTask;
```

### Task Status Notifications

`notifications/tasks/status` MAY carry the `paused` status, following the same delivery rules as other status transitions (on the `tasks/get` SSE stream for Streamable HTTP).

### Error Summary

| Error | Code | Method | When |
|-------|------|--------|------|
| Method not found | `-32601` | Any | Server doesn't support the method |
| Invalid task state | `-32602` | `tasks/pause` | Task not in `working` or `input_required` |
| Already paused | `-32602` | `tasks/pause` | Task already in `paused` |
| Not paused | `-32602` | `tasks/resume` | Task not in `paused` |
| Terminal task | `-32602` | `tasks/steer` | Task in `completed`, `failed`, or `cancelled` |

`tasks/steer` silently acks for invalid `taskId`, consistent with `tasks/update` and `tasks/cancel`.

## Rationale

### Why ack-only for `tasks/steer` but `DetailedTask` for pause/resume?

SEP-2663's rationale for ack-only `tasks/update`: "there is no read data the server needs to return that the client cannot get from a follow-up `tasks/get`, and forcing an embedded Task into the response would re-introduce the non-idempotency we are trying to avoid."

This reasoning applies directly to `tasks/steer` — the steer is queued and unprocessed at ack time, so the returned state would be identical to a `tasks/get` and misleading about the steer's effect.

For `tasks/pause` and `tasks/resume`, the situation differs: the client needs immediate feedback on whether the cooperative operation succeeded. Did the server actually pause? Or is it still running because it couldn't reach a safe point? Returning `DetailedTask` provides this signal without an additional `tasks/get` round-trip. This is analogous to HTTP `DELETE` returning `200` with the resource vs `204`.

### Why not extend `tasks/update` for steering?

`tasks/update` has specific semantics: it delivers `inputResponses` keyed to `inputRequests` the server issued. The keys are idempotency tokens unique over the task lifetime. Steering has none of these properties — it's unsolicited, unkeyed, and not idempotent (sending the same steer message twice should deliver it twice). Mixing these semantics would complicate both client and server implementations.

### Why a `paused` status instead of a flag on `working`?

A separate status makes the state machine explicit and enumerable. Clients can pattern-match on `task.status` without inspecting auxiliary fields. It also makes the transition rules clear — `paused` accepts different methods than `working` (`tasks/resume` but not `tasks/update`).

### Why allow server-initiated pause?

Client-only pause covers the "user wants to think" case. Server-initiated pause covers resource management: a browser automation server holds the VM after completing an action, a billing system checkpoints at cost thresholds, a scheduler throttles concurrent tasks. Without server-initiated pause, these use cases require either staying in `working` indefinitely (misleading) or completing and losing state (destructive).

## Backward Compatibility

This extension is **fully backward compatible** with SEP-2663:

- No changes to existing methods (`tasks/get`, `tasks/update`, `tasks/cancel`).
- No changes to existing status values or transitions.
- The `paused` status is additive — existing clients that don't negotiate the extension will never encounter it.
- Servers that don't support these methods return `-32601` (standard behavior for unknown methods).
- Capability negotiation via sub-capabilities within the Tasks extension ensures no silent failures.

A client negotiating only `io.modelcontextprotocol/tasks` (without `steer` or `pause`) will see no behavioral changes. The extension is strictly opt-in on both sides.

## Security Implications

### `tasks/steer` message content

Steer messages are natural language instructions delivered to the task's execution context. Servers MUST treat steer message content with the same trust model as tool arguments — it is user-supplied input that may contain injection attempts. Servers SHOULD NOT execute steer messages as code or pass them to system prompts without appropriate sandboxing.

### `paused` state and resource holding

Server-initiated pause could be used to hold resources (VMs, database connections) indefinitely. Servers SHOULD enforce TTL-based cleanup for paused tasks, consistent with SEP-2663's `ttlSeconds` field. Clients SHOULD monitor for tasks that remain paused beyond expected durations.

### Handle security

All three methods accept `taskId` as their routing key. The same security model from SEP-2663 applies: authenticated servers validate `(taskId, principal)` on every call; unauthenticated servers require high-entropy task IDs.

## Open Questions

1. **`paused` visibility for non-extension clients.** When a server supports pause and a base-spec-only client polls via `tasks/get`, should the server suppress `paused` status and return the pre-pause status instead? Or should base-spec clients be required to handle unknown status values gracefully?

2. **Steer interaction with `input_required`.** Can a steer message resolve a pending `inputRequest`, or are steer and input-response strictly separate channels? The current design keeps them separate, but there may be use cases where unsolicited feedback subsumes a pending question.

## Acknowledgments

- Ryan Nowak (@rynowak) — original extensions proposal identifying steering, pause/resume, and rich output as the key gaps
- Luca Chang (@LucaButBoring) — SEP-2663 design patterns that this extension follows
- Caitie McCaffrey (@CaitieM20) — Agents WG sponsorship and tasks stabilization work
- Peter Alexander (@pja-ant) — `requestState` analysis that informed the ack-only pattern choice
