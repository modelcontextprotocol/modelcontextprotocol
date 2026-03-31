# SEP-2509: Task Output Snapshots

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-04-01
- **Author(s)**: Shinzo
- **Sponsor**: None
- **Issue**: #2452
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2509

## Abstract

SEP-1686 defines durable tasks with status polling via `tasks/get` and final
result retrieval via `tasks/result`. It explicitly leaves intermediate results
as future work. This proposal adds a narrow, pull-based extension:
`tasks/read`.

`tasks/read` lets a requestor retrieve the current readable output snapshot for
a task without changing the final-only semantics of `tasks/result`. The method
returns whether output is currently available, the task's current status,
whether the returned output is partial, and, when available, a result snapshot
using the same result shape as the underlying request.

The proposal is intentionally limited. It does not introduce push
notifications, streaming, ranged reads, or append-only cursor semantics. It
standardizes only full current snapshots so implementations can support the
common "show me what the task has produced so far" workflow with minimal
protocol surface.

## Motivation

SEP-1686 allows a requestor to poll task status with `tasks/get` and retrieve
the final result with `tasks/result`, but it requires `tasks/result` to only
return data when the task is `completed`. The SEP also lists intermediate
results as future work. That leaves a practical gap for tasks that produce
useful output while they are still running.

This matters for:

- Build and test systems that continuously produce stdout, stderr, or completed
  test entries
- Multi-phase analysis tools that can return partial findings before the full
  run finishes
- Workflow wrappers that expose live job output from underlying orchestration
  systems
- Host applications that need more than a short status message to decide
  whether a task is healthy, stalled, or worth cancelling

A short status string is not enough for these cases. Requestors often need the
actual current output, not just a summary of state. At the same time, this
proposal should not turn the Tasks model into a general streaming transport.
The narrow requirement is pull-based inspection of the output currently
available.

### Non-goals

This proposal does not attempt to solve:

- Server-pushed progress or result notifications
- A streaming log transport
- Cursor-based or line-range retrieval APIs
- Any change to the final-only semantics of `tasks/result`
- A guarantee that every task type can expose a meaningful readable snapshot

## Specification

### 1. New request: `tasks/read`

Requestors **MAY** send `tasks/read` to retrieve the current output snapshot
for a task.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tasks/read",
  "params": {
    "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840",
    "_meta": {
      "modelcontextprotocol.io/related-task": {
        "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840"
      }
    }
  }
}
```

**Response when output is available and the task is still running:**

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "result": {
    "available": true,
    "status": "working",
    "isPartial": true,
    "result": {
      "content": [
        {
          "type": "text",
          "text": "[12/1042] FooTest passed\n[13/1042] BarTest running\n"
        }
      ],
      "isError": false
    },
    "_meta": {
      "modelcontextprotocol.io/related-task": {
        "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840"
      }
    }
  }
}
```

**Response when no current output is available yet:**

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "result": {
    "available": false,
    "status": "submitted",
    "isPartial": true,
    "_meta": {
      "modelcontextprotocol.io/related-task": {
        "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840"
      }
    }
  }
}
```

### 2. Response shape

The `tasks/read` response has the following structure:

```typescript
{
  available: boolean;
  status: TaskStatus;
  isPartial: boolean;
  result?: { [key: string]: unknown };
}
```

The `result` field, when present, **MUST** use the same result shape that the
wrapped request would use for its final response. For example, a task wrapping
`tools/call` returns a `CallToolResult`-shaped snapshot.

A receiver **MAY** support `tasks/read` for only a subset of task-backed
requests. If the underlying operation does not expose a meaningful readable
snapshot, or does not have one available yet, the receiver **MUST** return
`available: false`.

### 3. Behavioral requirements

Receivers implementing `tasks/read` **MUST** follow these rules:

1. `tasks/read` **MAY** be called for any existing task after
   `notifications/tasks/created` and before the task expires.
2. If a task exists but no readable output is currently available, the receiver
   **MUST** return `available: false` instead of returning an error.
3. If a task has readable output, the receiver **MUST** return `available:
   true` and include that output in `result`.
4. If a task is in `completed` status and its final result is still retained,
   `tasks/read` **MUST** return `available: true`, `isPartial: false`, and a
   `result` that is equivalent to `tasks/result`.
5. If a task is in `submitted`, `working`, or `input_required`, any returned
   output **MUST** set `isPartial: true`.
6. If a task is in `failed`, `cancelled`, or `unknown`, the receiver **MAY**
   return the latest readable snapshot. Any returned output **MUST** set
   `isPartial: true`.
7. `tasks/read` **MUST NOT** consume, delete, or finalize the task result. A
   requestor **MAY** call `tasks/read` multiple times for the same task.
8. `tasks/result` semantics remain unchanged. Receivers **MUST** continue
   returning final results from `tasks/result` only when the task status is
   `completed`.

### 4. Snapshot semantics

`tasks/read` returns a full current snapshot, not a delta from the prior read.
A receiver **MAY**:

- Return the complete readable output accumulated so far
- Return a summarized or truncated snapshot if returning the full output would
  be impractical

If the receiver truncates or summarizes the snapshot, it **SHOULD** indicate
that fact in `_meta`.

### 5. Error handling

Receivers **MUST** return standard JSON-RPC errors for:

- Invalid or nonexistent `taskId`: `-32602` (`Invalid params`)
- Internal errors while retrieving readable output: `-32603`
  (`Internal error`)

A server that does not implement `tasks/read` at all will respond according to
normal JSON-RPC behavior for an unknown method.

## Rationale

This proposal adds a new method rather than changing `tasks/result`. SEP-1686
gives `tasks/result` clear final-only semantics. Preserving that contract keeps
existing implementations and client expectations stable. `tasks/read` is
explicitly for inspection of current output; `tasks/result` remains the
authoritative final retrieval mechanism.

This proposal also chooses snapshot semantics instead of ranged or cursor-based
reads. Snapshot reads are enough to solve the immediate use case in issue
#2452: "show me what the task has produced so far." They are much easier to
implement over existing workflow systems and log APIs than a fully standardized
append-only stream protocol.

Finally, `tasks/read` reuses the underlying request's result shape rather than
inventing a new task-output format. That keeps tool, resource, and prompt
results consistent with their existing schemas and makes partial support easier
for implementers.

The proposal also permits receivers to return `available: false` for task types
that do not have a meaningful snapshot representation. This preserves the
generic task model from SEP-1686 without forcing every request type to invent a
partial-result format.

## Backward Compatibility

This proposal is additive.

- Existing clients and servers that only use `tasks/get` and `tasks/result`
  continue to work unchanged
- Existing `tasks/result` behavior remains final-only
- Servers may implement `tasks/read` incrementally, per request type
- Clients can treat `tasks/read` as opportunistic: if the method is
  unavailable, they can fall back to status polling only

## Security Implications

Intermediate output may contain sensitive data that would not appear in a final
summarized result. Implementations should apply the same task isolation and
access-control rules used for `tasks/get` and `tasks/result` to `tasks/read`.

Because `tasks/read` can be polled frequently and may return large payloads,
receivers should consider rate limiting and truncation to prevent resource
exhaustion.

## Reference Implementation

None yet. Before acceptance, this proposal should be demonstrated with a
prototype in at least one MCP SDK or reference server that exposes readable
build, test, or workflow output during task execution.

## Open Questions

- Should truncation metadata be standardized in this SEP, or left
  implementation-specific for the initial version?
- Is a future cursor-based extension needed, or are full snapshots sufficient
  for most real implementations?
