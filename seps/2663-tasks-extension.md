# SEP-2663: Tasks Extension

- **Status**: In-Review
- **Type**: Extensions Track
- **Created**: 2026-04-27
- **Author(s)**: Luca Chang (@LucaButBoring), Caitie McCaffrey (@CaitieM20)
- **Sponsor**: Caitie McCaffrey (@CaitieM20)
- **Extension Identifier**: `io.modelcontextprotocol/tasks`
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2663

## Abstract

This SEP defines an extension that allows a server respond to a `tools/call` request with an asynchronous _task handle_ instead of a final result, allowing the client to retrieve the eventual result by polling. The extension introduces three methods: `tasks/get`, `tasks/update`, and `tasks/cancel`; a polymorphic-result discriminator (`resultType: "task"`); and a `Task` shape that carries a task status, in-progress server-to-client requests, and a final result or error. Task creation is server-directed: the client signals support by negotiating the extension during `initialize`, and the server decides on a per-request basis whether to materialize a task.

This proposal supersedes the version of [tasks](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks) specified in the `2025-11-25` release. It is shaped by implementation feedback since that release and by several changes to the base protocol expected to arrive in the `2026-06-30` specification:

- [SEP-2260: Require Server requests to be associated with a Client request](./2260-Require-Server-requests-to-be-associated-with-Client-requests.md)
- [SEP-2322: Multi Round-Trip Requests](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2322)
- [SEP-2243: HTTP Header Standardization for Streamable HTTP Transport](./2243-http-standardization.md)
- [SEP-2567: Sessionless MCP via Explicit State Handles](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2567).

## Motivation

The experimental [tasks](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks) feature served as an alternate execution mode for tool calls, elicitation, and sampling, allowing receivers to return a poll handle instead of blocking until a final result was ready. Implementation experience surfaced several challenges:

1. **The handshake is fragile.** Tasks today expose method-level capabilities (`tasks.requests.tools.call` declares that `tools/call` **MAY** be task-augmented) alongside a tool-level `execution.taskSupport` field that declares whether a particular tool will accept the augmentation. Clients express their own support for tasks by passing a `task` parameter on their requests, but **MUST NOT** include it if the method/tool does not support tasks. A client that wants to opt into tasks must therefore prime its state with a `tools/list` call before issuing any task-augmented request, and cannot blindly attach a `task` parameter to every request to handle tools isomorphically. This is confusing, implicit, and easy to get wrong.

2. **`tasks/result` is a blocking trap.** In the current flow, a client that observes `input_required` is required to call `tasks/result` prematurely so that the server has an SSE stream on which to side-channel elicitation or sampling requests. `tasks/result` then blocks until the entire operation completes. This forces long-lived persistent connections that many clients and servers do not want to implement, and it conflicts with [SEP-2260](./2260-Require-Server-requests-to-be-associated-with-Client-requests.md), which disallows unsolicited server-to-client requests outright. Under SEP-2260, the SSE semantics that justified the blocking behavior no longer apply.

3. **`tasks/list` scoping cannot be defined.** To avoid clients cancelling or retrieving results for tasks they shouldn't have access to, all tasks should be bound to some sort of "authorization context," the implementation of which is left to individual servers according to their existing bespoke permission models. However, in many cases, it is not possible to perform this binding, in which case the task ID becomes the only line of defense against contamination. In this scenario, it is unsafe for a server to support `tasks/list` at all. While it was possible for tasks to instead be bound to a session, [SEP-2567](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2567) removes sessions from the protocol. There is no other natural scope a server can define unilaterally — task IDs can be unguessable handles that a server can recognize one at a time, but servers cannot reliably correlate two unrelated handles to the same caller without additional state.

Beyond implementation challenges, tasks face another structural issue: **Client-hosted tasks are no longer expressible.** [SEP-1686](./1686-tasks.md) permitted clients to host tasks for elicitation and sampling, in part to avoid coupling tasks to tool calls. [SEP-2260](./2260-Require-Server-requests-to-be-associated-with-Client-requests.md) makes any unsolicited server-to-client request invalid; every server-to-client polling request under client-hosted tasks would be unsolicited by definition.

This proposal intends to solve the above issues by redesigning certain aspects of the feature and moving tasks out to an official extension. Redefining tasks as an official extension gives the feature more time to incubate and evolve independently of the core specification, promoting adoption. As part of the redesign, this proposal consolidates the polling lifecycle into `tasks/get` and a new `tasks/update` to remove the blocking `tasks/result` method. The redesign allows servers to return tasks unsolicited (in response to ordinary, non-`task`-flagged requests) to eliminate the per-request opt-in and the `tools/list` warmup, relying instead on the extension capability as the single handshake point. Finally, this proposal removes client-hosted elicitation and sampling tasks in compliance with [SEP-2260](./2260-Require-Server-requests-to-be-associated-with-Client-requests.md).

## Specification

The MCP Tasks extension allows certain requests to be augmented with **tasks**. Tasks are durable state machines that carry information about the underlying execution state of the request they augment, and are intended for client polling and deferred result retrieval. Each task is uniquely identifiable by a server-generated **task ID**.

Tasks are useful for representing expensive computations and batch processing requests, and map naturally onto external job APIs.

### Extension Identifier

This extension is identified as: `io.modelcontextprotocol/tasks`.

### Capability Negotiation

The client and server declare support for the tasks extension in their respective capabilities objects (using updated form from [SEP-2575: Make MCP Stateless](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2575)):

```jsonc
// Client to server, in per-request capabilities
{
  // Other request parameters...
  "params": {
    "_meta": {
      "io.modelcontextprotocol/clientCapabilities": {
        "extensions": {
          "io.modelcontextprotocol/tasks": {},
        },
      },
    },
  },
}
```

```jsonc
// Server to client, in response to server/discover
{
  "result": {
    // Other response parameters...
    "capabilities": {
      "extensions": {
        "io.modelcontextprotocol/tasks": {},
      },
    },
  },
}
```

No extension-specific settings are currently defined; an empty object indicates support.

A server that has negotiated this extension **MAY** return `CreateTaskResult` in lieu of `CallToolResult` in response to any supported request at its own discretion and on a per-request basis. The server is the sole decider; clients do not signal task preference on the request itself. The client declaring the extension capability does not suggest that it requires a `CreateTaskResult` in response to that request.

A server **MUST NOT** return `CreateTaskResult` to a client that did not include the extension capability on its request, regardless of prior declarations. A client that has negotiated this extension **MUST** be prepared to handle either `CallToolResult` or `CreateTaskResult` in response to any supported request it issues. A client that receives `CreateTaskResult` in response to an unsupported request type **MUST** interpret this as an invalid response to the request.

### Supported Methods

The following methods currently support task-augmented execution:

- `tools/call`

This specification may be extended to support tasks over other request types in the future; implementations **SHOULD** be designed to accommodate additional request types in future revisions of this specification.

### Polymorphic Results

A request that is eligible for task-augmentation may return one of two distinct result shapes — the request's standard result, or a `CreateTaskResult`. The discriminator is the `resultType` field on the result object, introduced by [SEP-2322](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2322):

```typescript
// "task" is introduced by this extension.
type ResultType = "complete" | "incomplete" | "task";
```

Servers **MUST** set `resultType` to `"task"` when returning a `CreateTaskResult` so that clients can distinguish it from a standard result. Servers **MUST NOT** set `resultType` to `"task"` on result types other than `CreateTaskResult`.

Client implementors are advised that existing code returning a fixed shape (e.g., a `tools/call` method returning `CallToolResult`) need not change their public contract — they can transparently drive the polling flow internally and surface only the final, completed result. New implementation surfaces **MAY** expose the task lifecycle directly for applications able to leverage it.

### Tasks

A `Task` carries operational metadata about ongoing work. Derived shapes inline status-specific payload fields and are used by `tasks/get` responses and `notifications/tasks/status` notifications:

```typescript
interface Task {
  /** Stable identifier for this task. */
  taskId: string;

  /** Current task status. */
  status: "working" | "input_required" | "completed" | "cancelled" | "failed";

  /**
   * Optional message describing the current task state.
   * This can provide context for any status, for example (non-normative):
   * - Progress descriptions for "working"
   * - Work blocked on "input_required"
   * - Reasons for "cancelled" status
   * - Summaries for "completed" status
   * - Additional information for "failed" status (e.g., error details, what went wrong)
   *
   * This MAY be exposed to the end-user or model.
   */
  statusMessage?: string;

  /** ISO 8601 timestamp when the task was created. */
  createdAt: string;

  /** ISO 8601 timestamp when the task was last updated. */
  lastUpdatedAt: string;

  /**
   * Time-to-live duration from creation in integer seconds, null for unlimited.
   * The server may discard the task after the TTL elapses.
   * Aligns with HTTP cache-control conventions per SEP-2549.
   */
  ttl: number | null;

  /**
   * Suggested polling interval in milliseconds. Clients SHOULD honor this
   * value to avoid overwhelming the server. This value MAY change over the
   * lifetime of a task.
   */
  pollInterval?: number;

  /**
   * Optional request state passed back from the server to the client.
   * Used for server-side state management per SEP-2322 Multi Round-Trip Requests.
   * Servers MAY return a different requestState value on each task-bearing message
   * (`CreateTaskResult`, `tasks/get`, `notifications/tasks/status`);
   * clients MUST always include the most recently received value on the next request.
   */
  requestState?: string;
}

/**
 * A task that is in a normal working state.
 * Used by tasks/get and notifications/tasks/status.
 */
export interface WorkingTask extends Task {
  status: "working";
}

/**
 * A task that is waiting for input from the client.
 * Used by tasks/get and notifications/tasks/status.
 */
export interface InputRequiredTask extends Task {
  status: "input_required";
  /**
   * Server-to-client requests that need to be fulfilled during task execution.
   * Keys are arbitrary identifiers for matching requests to responses.
   */
  inputRequests: InputRequests;
}

/**
 * A task that has completed successfully.
 * Used by tasks/get and notifications/tasks/status.
 */
export interface CompletedTask extends Task {
  status: "completed";
  /**
   * The final result of the task.
   * The structure matches the result type of the original request.
   * For example, a CallToolRequest task would return the CallToolResult structure.
   */
  result: JSONObject;
}

/**
 * A task that has failed due to a JSON-RPC error.
 * Used by tasks/get and notifications/tasks/status.
 */
export interface FailedTask extends Task {
  status: "failed";
  /**
   * The JSON-RPC error that caused the task to fail.
   */
  error: JSONObject;
}

/**
 * A task that has been cancelled.
 * Used by tasks/get and notifications/tasks/status.
 */
export interface CancelledTask extends Task {
  status: "cancelled";
}

/**
 * A union type representing a task with optional inlined result/error/inputRequests fields.
 * This type is used by tasks/get and notifications/tasks/status to provide complete task state
 * including terminal results or pending input requests.
 */
export type DetailedTask =
  | WorkingTask
  | InputRequiredTask
  | CompletedTask
  | FailedTask
  | CancelledTask;
```

#### Request State Management

Servers **MAY** set an optional `requestState` string on any `Task` object to pass opaque routing or state information back to the client. When a client receives a `Task` with a `requestState` value, it **MUST** echo back the exact value of that field in the `requestState` field of subsequent `tasks/get`, `tasks/update`, and `tasks/cancel` requests for the same task. The server can use this echoed value to recover routing context or session state without maintaining per-task server-side session data, enabling stateless, load-balanced deployments.

**Response (with requestState):**

```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "result": {
    "resultType": "complete",
    "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840",
    "status": "input_required",
    "createdAt": "2025-11-25T10:30:00Z",
    "lastUpdatedAt": "2025-11-25T10:45:00Z",
    "ttl": 3600,
    "pollInterval": 5000,
    "requestState": "eyJzZXJ2ZXJJZCI6ICJub2RlLTQyIn0=",
    "inputRequests": {
      "elicit-name": {
        "method": "elicitation/create",
        "params": {
          "message": "Please enter your name.",
          "requestedSchema": {
            "type": "object",
            "properties": { "name": { "type": "string" } },
            "required": ["name"]
          }
        }
      }
    }
  }
}
```

**Follow-up Request (echoing requestState):**

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tasks/update",
  "params": {
    "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840",
    "requestState": "eyJzZXJ2ZXJJZCI6ICJub2RlLTQyIn0=",
    "inputResponses": {
      "elicit-name": {
        "action": "accept",
        "content": { "input": "Jane Doe" }
      }
    }
  }
}
```

**`tasks/cancel` Request (echoing requestState):**

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tasks/cancel",
  "params": {
    "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840",
    "requestState": "eyJzZXJ2ZXJJZCI6ICJub2RlLTQyIn0="
  }
}
```

The `requestState` value is opaque to the client — clients **MUST NOT** inspect, parse, modify, or make assumptions about its contents. Servers **MAY** return a different `requestState` value on each task-bearing message (`CreateTaskResult`, `tasks/get`, `notifications/tasks/status`); clients **MUST** always use the most recently received value in their next request. If the most recent task-bearing message contained no `requestState`, the client **MUST NOT** include it in the next request. Servers that include `requestState` **SHOULD** encrypt it to protect confidentiality and integrity, and **MUST** validate any received `requestState` before acting on it.

Upon receiving a `notifications/tasks/status` notification for a task status update, clients **MUST** update their tracked `requestState` value with any value provided in the notification, as they would do with a standard response.

#### Task Status

Tasks can be in one of the following states:

- `working`: The request is currently being processed.
- `input_required`: The server needs input from the client. The `tasks/get` response will include outstanding requests in the `inputRequests` field, and the client should provide responses via the `inputResponses` field in subsequent `tasks/update` requests.
- `completed`: The request completed successfully and results are available in the `result` field. This includes tool calls that returned results with `isError: true`.
- `failed`: The request failed due to a JSON-RPC error during execution. The task will include the `error` field with the JSON-RPC error details. This status **MUST NOT** be used for non-JSON-RPC errors.
- `cancelled`: The request was cancelled before completion.

### Task Creation

A server returns `CreateTaskResult` in lieu of the standard result shape for a request to indicate that request will be processed asynchronously.

```typescript
// resultType: "task"
type CreateTaskResult = Result & Task;
```

Note that `CreateTaskResult` _does not_ contain `result`/`error`/`inputRequests`. Client implementations **MUST NOT** use these fields if they are found on `CreateTaskResult`, and **MAY** handle this as an invalid protocol response.

**Example Request (CallToolRequest):**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": {
      "city": "New York"
    }
  }
}
```

**Example Response (CreateTaskResult):**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "resultType": "task",
    "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840",
    "status": "working",
    "statusMessage": "The operation is now in progress.",
    "createdAt": "2025-11-25T10:30:00Z",
    "lastUpdatedAt": "2025-11-25T10:40:00Z",
    "ttl": 60,
    "pollInterval": 5000
  }
}
```

The embedded `task` is the seed state for the task, typically (though not necessarily) with `status: "working"`. The client uses `task.taskId` for all subsequent `tasks/get`, `tasks/update`, and `tasks/cancel` calls.

A server **MUST NOT** return `CreateTaskResult` until the task is durably created — that is, until a `tasks/get` for the returned `taskId` would resolve. In eventually-consistent environments, the server **MUST** wait for consistency before responding. This requirement eliminates the need for clients to speculatively poll for task creation.

### Task Polling

Clients poll for task completion by sending `tasks/get` requests.

Clients **SHOULD** respect the `pollInterval` provided in responses when determining polling frequency. The `pollInterval` **MAY** change over the lifetime of a task. Servers **MAY** rate-limit clients polling more frequently than the recorded `pollInterval`.

Clients **SHOULD** continue polling until the task reaches a terminal status (`completed`, `failed`, or `cancelled`).

#### Request

```typescript
interface GetTaskRequest extends JSONRPCRequest {
  method: "tasks/get";
  params: {
    /** Identifier of the task to query. */
    taskId: string;
  };
}
```

#### Response

```typescript
type GetTaskResult = Result & DetailedTask;
```

The response carries the appropriate response variant for the task's current status (see [Task Status](#task-status)). The `resultType` field **MUST** be set to `"complete"` on this object as it is the standard result shape for the `tasks/get` request.

### Task Input Requests

When a task requires input from the client (indicated by the `input_required` status), the server includes outstanding requests in the `inputRequests` field of the `tasks/get` response. The client provides responses via the `inputResponses` field in one or more subsequent `tasks/update` requests.

Each request key in `inputRequests` **MUST** be unique over the lifetime of a single task. A server **MUST NOT** reuse a key for a subsequent server-to-client request after a response for that key has been delivered, and **MUST NOT** use the same key to refer to two distinct requests over a task's lifetime. This guarantees that `inputResponses` keyed by the same identifier always refer to the request the client expects, eliminates ambiguity for clients deduplicating across polls, and lets servers ignore `inputResponses` for unknown or already-satisfied requests.

#### Request

```typescript
interface UpdateTaskRequest extends JSONRPCRequest {
  method: "tasks/update";
  params: {
    /** Identifier of the task to update. */
    taskId: string;

    /**
     * Responses to outstanding inputRequests previously surfaced by the
     * server. Shape per SEP-2322. Each key MUST correspond to a currently-
     * outstanding inputRequest key.
     */
    inputResponses: InputResponses;

    /**
     * Optional opaque request-state token round-tripped from a prior server response
     * (per SEP-2322).
     */
    requestState?: string;
  };
}
```

#### Response

```typescript
type UpdateTaskResult = Result; // empty acknowledgement
```

The server **MUST** acknowledge the request with an empty result, even if the task ID does not represent a valid task. The acknowledgement is _eventually consistent_: the server **MAY** accept the responses and return the ack before the task's observable status (via `tasks/get` or `notifications/tasks/status`) reflects them. Clients **SHOULD** track `inputRequests` keys to avoid responding to requests more than once.

A server **SHOULD** ignore any `inputResponses` responses mapped to a key that is not currently outstanding for the task — including keys that were never issued, keys that have already been answered, and keys whose corresponding request has been superseded. A server **MAY** accept a partial set of responses (a strict subset of currently-outstanding keys); in that case the task remains in `input_required` until the remaining responses arrive.

The `resultType` field **MUST** be set to `"complete"` on `UpdateTaskResult` as it is the standard result shape for the `tasks/update` request.

### Task Cancellation

A client sends a `tasks/cancel` request to signal its intent to cancel an in-progress task.

#### Request

```typescript
interface CancelTaskRequest extends JSONRPCRequest {
  method: "tasks/cancel";
  params: {
    taskId: string;

    /**
     * Optional opaque request-state token round-tripped from a prior server response
     * (per SEP-2322).
     */
    requestState?: string;
  };
}
```

#### Response

```typescript
type CancelTaskResult = Result; // empty acknowledgement
```

The server **MUST** acknowledge the request with an empty result, even if the task ID does not represent a valid task. Cancellation processing is _eventually consistent_ — the task's observable status **MAY** remain `working` (or some other non-terminal status) after the ack, and **MAY** ultimately reach a terminal status other than `cancelled` if the work finished before cancellation could take effect.

Cancellation is **cooperative**: The request signals intent, and the server decides whether and when to honor it. A server is not obligated to actually stop the work; it is only obligated to acknowledge the request. Eventual transition to `cancelled` is not guaranteed.

The `resultType` field **MUST** be set to `"complete"` on `CancelTaskResult` as it is the standard result shape for the `tasks/cancel` request.

### Task Status Notifications

A server **MAY** push status updates in addition to servicing client polls:

```typescript
type TaskStatusNotificationParams = NotificationParams & DetailedTask;
```

Each notification carries a complete `DetailedTask` for the current status, identical to what `tasks/get` would have returned at that moment.

### Streamable HTTP: Routing Headers

When `tasks/get`, `tasks/update`, or `tasks/cancel` is sent over the Streamable HTTP transport, the client **MUST** set the `Mcp-Name` header (defined by [SEP-2243](./2243-http-standardization.md)) to the value of `params.taskId`. This allows transport intermediaries and load balancers to route subsequent requests for the same task to the server instance holding its state, which is typically required for correctness. The `Mcp-Method` header is set to the JSON-RPC method name per [SEP-2243](./2243-http-standardization.md).

### Example Message Flow

Consider a simple tool call, `hello_world`, requiring an elicitation for the user to provide their name. The tool itself takes no arguments.

To invoke this tool, the client makes a `CallToolRequest` as follows:

```jsonc
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "hello_world",
    "arguments": {},
    "_meta": {
      // Other metadata...
      "io.modelcontextprotocol/clientCapabilities": {
        "extensions": {
          "io.modelcontextprotocol/tasks": {},
        },
      },
    },
  },
}
```

The server determines (via bespoke logic) that it wants to create a task to represent this work, and it immediately returns a `CreateTaskResult`:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "resultType": "task",
    "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840",
    "status": "working",
    "createdAt": "2025-11-25T10:30:00Z",
    "lastUpdatedAt": "2025-11-25T10:50:00Z",
    "ttl": 3600,
    "pollInterval": 5000,
    "requestState": "SGVsbG8sIHdvcmxkCg=="
  }
}
```

Once the client receives the `CreateTaskResult`, it begins polling `tasks/get`:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tasks/get",
  "params": {
    "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840",
    "requestState": "SGVsbG8sIHdvcmxkCg=="
  }
}
```

On each request while the task is in a `"working"` status, the server returns a regular task response:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "resultType": "complete",
    "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840",
    "status": "working",
    "createdAt": "2025-11-25T10:30:00Z",
    "lastUpdatedAt": "2025-11-25T10:50:00Z",
    "ttl": 3600,
    "pollInterval": 5000,
    "requestState": "SGVsbG8sIEknbSBzdGlsbCB3b3JraW5nCg=="
  }
}
```

Eventually, the server reaches the point at which it needs to send an elicitation to the user. It sets the task status to `"input_required"` to signal this, and may additionally provide a `requestState` if it so chooses. On the next `tasks/get` request from the client, the server sends the elicitation payload via the `inputRequests` field. Note that, unlike in [SEP-2322](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2322), the standard task status result is still returned. The updated task polling flow should be thought of as distinct from the MRTR flow, despite sharing many characteristics.

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tasks/get",
  "params": {
    "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840",
    "requestState": "SGVsbG8sIEknbSBzdGlsbCB3b3JraW5nCg=="
  }
}
```

```json
{
  "id": 4,
  "jsonrpc": "2.0",
  "result": {
    "resultType": "complete",
    "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840",
    "status": "input_required",
    "createdAt": "2025-11-25T10:30:00Z",
    "lastUpdatedAt": "2025-11-25T10:50:00Z",
    "ttl": 3600,
    "pollInterval": 5000,
    "inputRequests": {
      "name": {
        "method": "elicitation/create",
        "params": {
          "mode": "form",
          "message": "Please enter your name.",
          "requestedSchema": {
            "type": "object",
            "properties": {
              "name": { "type": "string" }
            },
            "required": ["name"]
          }
        }
      }
    },
    "requestState": "SGVsbG8sIEkgbmVlZCB5b3VyIG5hbWUgYnR3Cg=="
  }
}
```

For thoroughness, let's consider a case where the client happens to poll `tasks/get` again _before_ the user has fulfilled the elicitation request. As `inputRequests` is effectively a point-in-time snapshot of all outstanding server-to-client requests associated with the task, the server includes the same request again, despite the client having already seen this information (the client is advised to deduplicate `inputRequests` with the same key for UX purposes):

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tasks/get",
  "params": {
    "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840",
    "requestState": "SGVsbG8sIEkgbmVlZCB5b3VyIG5hbWUgYnR3Cg=="
  }
}
```

```json
{
  "id": 5,
  "jsonrpc": "2.0",
  "result": {
    "resultType": "complete",
    "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840",
    "status": "input_required",
    "createdAt": "2025-11-25T10:30:00Z",
    "lastUpdatedAt": "2025-11-25T10:50:00Z",
    "ttl": 3600,
    "pollInterval": 5000,
    "inputRequests": {
      "name": {
        "method": "elicitation/create",
        "params": {
          "mode": "form",
          "message": "Please enter your name.",
          "requestedSchema": {
            "type": "object",
            "properties": {
              "name": { "type": "string" }
            },
            "required": ["name"]
          }
        }
      }
    },
    "requestState": "SGVsbG8sIEkgbmVlZCB5b3VyIG5hbWUgYnR3Cg=="
  }
}
```

The user enters their name, and the client makes a `tasks/update` request with the satisfied information:

```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "tasks/update",
  "params": {
    "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840",
    "inputResponses": {
      "name": {
        "action": "accept",
        "content": {
          "input": "Luca"
        }
      }
    },
    "requestState": "SGVsbG8sIEkgbmVlZCB5b3VyIG5hbWUgYnR3Cg=="
  }
}
```

The server acknowledges the request:

```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "result": {
    "resultType": "complete"
  }
}
```

Asynchronously, the server processes it and moves the task back into the `working` status:

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tasks/get",
  "params": {
    "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840",
    "requestState": "SGVsbG8sIEkgbmVlZCB5b3VyIG5hbWUgYnR3Cg=="
  }
}
```

```json
{
  "id": 7,
  "jsonrpc": "2.0",
  "result": {
    "resultType": "complete",
    "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840",
    "status": "working",
    "createdAt": "2025-11-25T10:30:00Z",
    "lastUpdatedAt": "2025-11-25T10:50:00Z",
    "ttl": 3600,
    "pollInterval": 5000,
    "requestState": "SGVsbG8sIEknbSB3b3JraW5nIGFnYWluCg=="
  }
}
```

Eventually, the server completes the request, so it stores the final `CallToolResult` and moves the task into the `"completed"` status. On the next `tasks/get` request, the server sends the final tool result inlined into the task object:

```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "method": "tasks/get",
  "params": {
    "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840",
    "requestState": "SGVsbG8sIEknbSB3b3JraW5nIGFnYWluCg=="
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "result": {
    "resultType": "complete",
    "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840",
    "status": "completed",
    "createdAt": "2025-11-25T10:30:00Z",
    "lastUpdatedAt": "2025-11-25T10:50:00Z",
    "ttl": 3600,
    "pollInterval": 5000,
    "result": {
      "content": [
        {
          "type": "text",
          "text": "Hello, Luca!"
        }
      ],
      "isError": false
    },
    "requestState": "QWxsIGRvbmUgZm9yIG5vdwo="
  }
}
```

### Error Handling

Tasks use two error reporting mechanisms:

1. **Protocol Errors**: Standard JSON-RPC errors for protocol-level issues
2. **Task Execution Errors**: Errors in the underlying request execution, reported through task status

#### Protocol Errors

Servers **MUST** return standard JSON-RPC errors for the following protocol error cases:

- Invalid or nonexistent `taskId` in `tasks/get`: `-32602` (Invalid params)
  - Note: `tasks/update` and `tasks/cancel` acknowledge requests for any task ID without error; see [Task Input Requests](#task-input-requests) and [Task Cancellation](#task-cancellation).
- Internal errors: `-32603` (Internal error)

Servers **SHOULD** provide informative error messages to describe the cause of errors.

**Example: Task not found**

```json
{
  "jsonrpc": "2.0",
  "id": 70,
  "error": {
    "code": -32602,
    "message": "Failed to retrieve task: Task not found"
  }
}
```

**Example: Task expired**

```json
{
  "jsonrpc": "2.0",
  "id": 71,
  "error": {
    "code": -32602,
    "message": "Failed to retrieve task: Task has expired"
  }
}
```

Servers are not required to retain tasks indefinitely. It is compliant behavior for a server to return an error stating the task cannot be found if it has purged an expired task.

#### Task Execution Errors

When the underlying request encounters a JSON-RPC protocol error during execution, the task moves to the `failed` status. The `tasks/get` response **SHOULD** include a `statusMessage` field with diagnostic information about the failure, and **MUST** include the `error` field with the JSON-RPC error.

The `failed` status **MUST NOT** be used to represent non-JSON-RPC errors, such as a tool result that completed with `isError: true`. Application-level errors **MUST** use the `completed` status with the error details in the `result` field. This maintains a strong separation between protocol-level faults (which use the `failed` status) and application-level faults (which are returned as `completed` results with `isError: true`).

**Example: Task with JSON-RPC execution error**

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "resultType": "task",
    "taskId": "786512e2-9e0d-44bd-8f29-789f820fe840",
    "status": "failed",
    "createdAt": "2025-11-25T10:30:00Z",
    "lastUpdatedAt": "2025-11-25T10:40:00Z",
    "ttl": 3600,
    "statusMessage": "Tool execution failed: API rate limit exceeded",
    "error": {
      "code": -32603,
      "message": "API rate limit exceeded"
    }
  }
}
```

**Example: Tool call completed with application error (isError: true)**

For tool calls that complete successfully at the protocol level but return an application-level error (indicated by `isError: true` in the tool result), the task reaches `completed` status with the tool result in the `result` field:

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "result": {
    "resultType": "task",
    "taskId": "786512e2-9e0d-44bd-8f29-789f820fe840",
    "status": "completed",
    "createdAt": "2025-11-25T10:30:00Z",
    "lastUpdatedAt": "2025-11-25T10:40:00Z",
    "ttl": 3600,
    "result": {
      "content": [
        {
          "type": "text",
          "text": "Failed to process request: invalid input"
        }
      ],
      "isError": true
    }
  }
}
```

The `tasks/get` endpoint returns exactly what the underlying request would have returned:

- If the underlying request resulted in a JSON-RPC error, the task uses `failed` status and the `error` field **MUST** contain that JSON-RPC error.
- If the request completed with a result (even if `isError: true` for tool results), the task uses `completed` status and the `result` field **MUST** contain that result.

### Reservations

- The `tasks/` method prefix and `notifications/tasks/` notification prefix are reserved for this extension.
- The result-discriminator value `"task"` for `resultType` is reserved for this extension.
- The label `io.modelcontextprotocol/tasks` is reserved for this extension.

## Rationale

### Unsolicited Tasks vs. Immediate Results

An [alternative proposal](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1905) would have handled the immediate result case individually, and with slightly different preconditions: _If_ tasks are supported, _and_ the client supports immediate task results, _then_ servers may return a regular result in response to a task-augmented request. That version of immediate results looked like a better option at the time, as it implied no breaking changes on top of the initial tasks specification.

However, as we look to [move away](https://blog.modelcontextprotocol.io/posts/2025-12-19-mcp-transport-future/) from stateful protocol interactions and given the current experimental state of tasks in general, it seems worth proposing a somewhat more radical change that reduces the complexity of the overall specification and makes tasks more "native" to MCP at this time. In particular, the choice to allow unsolicited tasks (in _addition_ to immediate results) means promoting tasks to a first-class concept intended for all persistent operations, as opposed to being a parallel and somewhat specialized concept.

This happens to align with the proposed [SEP-2322](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2322), but the two are not coupled with one another.

### Splitting Reads (`tasks/get`) and Writes (`tasks/update`)

Earlier drafts of this redesign let `tasks/get` carry `inputResponses` so a single round trip would both submit responses and observe the resulting state. That conflation has costs: it makes the read path non-idempotent (a retried `tasks/get` could re-submit responses), it forces the read path to share the eventual-consistency model of the write, and it complicates intermediaries that want to cache or deduplicate reads. Splitting the methods leaves `tasks/get` as a pure, idempotent read that any layer can cache or replay safely, and confines write semantics — including their eventual-consistency window — to `tasks/update`.

`tasks/update`'s ack-only response shape follows from the same separation: there is no read data the server needs to return that the client cannot get from a follow-up `tasks/get`, and forcing an embedded `Task` into the response would re-introduce the non-idempotency we are trying to avoid. The cost is one extra round-trip per round of input — paid only when the task actually requires a client request.

### Task Creation Consistency

The following new requirement is introduced:

> A server **MUST NOT** return `CreateTaskResult` until the task is durably created — that is, until a `tasks/get` for the returned `taskId` would resolve. In eventually-consistent environments, the server **MUST** wait for consistency before responding. This requirement eliminates the need for clients to speculatively poll for task creation.

Unlike `tasks/update` and `tasks/cancel`, task creation is strongly-consistent. This has to be the case to avoid speculative `tasks/get` requests from requestors that would otherwise not know if a task has silently been dropped or if it simply has not been created yet. Conversely, eventual consistency in `tasks/update` and `tasks/cancel` works because the client behavior is not contingent on the results of those operations (the client can continue to poll either way). While consistent task creation does increase latency costs in distributed systems that did not already behave this way, explicitly introducing this requirement simplifies client implementations and eliminates a source of undefined behavior.

This also aligns with long-running operation APIs in general, which typically require that once an operation is acknowledged, it must be findable via the polling endpoint.

### Ack-only Cancellation

In the `2025-11-25` design of tasks, `tasks/cancel` returned a task describing the task's state immediately after the cancellation attempt. That return shape implies a synchronous read — the server must consult task state to populate it — but cancellation is inherently asynchronous in many applications (a separate worker decides whether and when to honor it), so the returned task object would in many cases simply repeat what the next `tasks/get` would show. Reducing `tasks/cancel` to an ack matches the operation's actual semantics: The request is a signal, not a state query. Clients that want to know the post-cancel status do so via `tasks/get` on the same code path they use for all other state observation.

The eventual-consistency on the ack is the same separation as for `tasks/update`: The server may record the cancellation request and respond before the worker has actually transitioned the task, without allowing the client to interpret the ack as strongly-consistent.

## Backward Compatibility

The experimental tasks feature in the `2025-11-25` release is **not wire-compatible** with this extension. Specifically:

- `tasks/result` is removed. Clients calling `tasks/result` against an extension-supporting server **MUST** receive `-32601` (Method Not Found).
- The `task` parameter on `CallToolRequest` is removed. Servers receiving requests with this parameter under the extension **MUST** ignore it (treat the field as unknown) rather than using it as an opt-in.
- The `tasks.requests.*` and `tasks.cancel`/`tasks.list` capability declarations are not part of this extension. A server that previously advertised these **MUST** migrate to declaring `io.modelcontextprotocol/tasks` and **MUST NOT** continue to advertise the legacy capabilities under any protocol version that includes this extension.
- The result polymorphism — `CallToolResult` or `CreateTaskResult` in response to `tools/call` — is gated on extension negotiation. Under earlier protocol versions or without negotiation, a server **MUST NOT** return `CreateTaskResult`.

Implementations that need to bridge legacy clients **SHOULD** shim at the SDK level: a server can implement both the experimental and extension surfaces in parallel during the migration window, dispatching based on which capability the client negotiated.

A server that returns the standard `CallToolResult` shape — i.e., never elects to create a task — remains fully spec-compliant under this extension. Clients that have negotiated the extension **MUST** handle both result shapes for any augmented request.

## Security Implications

- **Task ID unguessability.** A server **MAY** use task IDs as bearer tokens for a server's stored state. Servers **MUST** generate them with sufficient entropy that a third party cannot enumerate or guess them.
- **Cross-caller correlation.** Because there is no `tasks/list`, a server cannot inadvertently leak the existence of one caller's tasks to another. This is an improvement over the `2025-11-25` tasks specification, in which a poorly-scoped list could expose unrelated task IDs.
- **Input-request trust model.** `inputRequests` carry elicitation and sampling payloads from the server through the client to the user or model. Hosts **MUST** apply the same trust model to these payloads as they would to standard elicitation/sampling requests. A task is not a higher-trust channel.

## Reference Implementation

To be provided.
