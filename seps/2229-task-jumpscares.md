# SEP-2229: Task Jumpscares

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-02-09
- **Author(s)**: Luca Chang (@LucaButBoring)
- **Sponsor**: Luca Chang (@LucaButBoring)
- **PR**: https://github.com/modelcontextprotocol/specification/pull/2229

## Abstract

This proposal builds on [tasks](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks) by removing per-request task capabilities and tool-level task support declarations, and instead allowing tasks to be returned in response to any request without the requestor opting into this behavior. This removes an unneeded state contract, simplifies supporting tasks at a per-tool level, and allows peers to skip task creation when no persistent work needs to be performed.

## Motivation

Today, tasks require their requestor to be cooperative, in the sense that the requestor of a task must explicitly opt into task-augmented execution on a request. This requires three steps:

1. Check the receiver's task capabilities for the request type. If the capability is not present, the receiver does not support tasks.
2. If the request is a tool call, invoke `tools/list` to retrieve the tool list, then check `execution.taskSupport` on the appropriate tool to determine if the tool supports tasks.
3. Add a `task` parameter to the request with a desired task TTL to signal that the requestor wants to leverage tasks.

While this contract ensures that both the requestor and receiver understand their peer's capabilities and safely agree on the request and response formats in advance, it also has a few conceptual flaws:

1. It requires requestors to explicitly check the capabilities of receivers. This introduces an unnecessary state contract that may be violated during mid-session deployments under the Streamable HTTP transport, and also raises concerns about the capability exchange growing in payload size indefinitely as more methods are supported.
2. It requires a tool-specific behavior carveout which gets pushed onto the client to navigate. Related to this, it forces clients to cache a `tools/list` call prior to making any task-augmented tool call.
3. It requires host application developers to explicitly choose to opt into task support from request to request, rather than relying on a single, consistent request construction path for all protocol operations.

In practical terms, these flaws imply that an MCP server cannot make a clean break from non-Task to task-augmented execution on its tools, even if clients have implemented support for tasks already; the server must wait for all host applications to additionally opt into tasks as well and sit in an awkward in-between state in the meantime, where it must choose to either break compatibility with host applications (even if those host applications have an updated client SDK) or accept the costs of task-optional execution and poll on tasks internally sometimes.

Furthermore, the requirement that task support be declared ahead of time makes task execution predictable, but also prematurely removes the possibility of only dispatching a task when there is real work to be done, along the lines of the .NET [ValueTask](https://learn.microsoft.com/en-us/dotNet/api/system.threading.tasks.valuetask?view=net-10.0). Allowing the requestor to dictate whether or not a task will be created eliminates the possibility of caching results or sending early return values, instead requiring the creation of a task on every request if tasks are supported by the requestor at all.

To both improve the adoption of tasks and to reduce their upfront messaging overhead, this proposal simplifies their execution model by allowing peers to "jumpscare" each other with tasks.

## Specification

### Tasks

#### ​Capability Negotiation

The `capabilities.tasks.requests` capability (which controls which requests accept task-augmentation) will be removed from the specification. The capability will remain in the schema but will be deprecated, and it may be removed in a future specification version.

The `capabilities.tasks.list` and `capabilities.tasks.cancel` capabilities will remain unmodified.

#### ​Tool-Level Negotiation

This section will be removed. The `execution.taskSupport` field on tools will remain in the schema but will be deprecated, and it may be removed in a future specification version.

#### Protocol Messages

##### Creating Tasks

This section will be changed to the following:

> Task-augmented requests follow a two-phase response pattern that differs from normal requests:
>
> - **Normal requests:** The receiver processes the request and returns the actual operation result directly.
> - **Task-augmented requests:** The receiver accepts the request and immediately returns a `CreateTaskResult` containing task data. The actual operation result becomes available later through `tasks/result` after the task completes.
>
> Whether a task is created in response to a request is subject to the receiver's implementation; requestors **MUST** be prepared to handle either case. The requestor need not specify that task-augmented execution is expected. Requestors **MAY** include a `task.ttl` value indicating the desired task lifetime duration (in milliseconds) since its creation.

#### ​Behavior Requirements

##### Task Support and Handling

This section will be changed to the following:

> 1. Requestors **MUST** be prepared for a `CreateTaskResult` to be returned in response to any request, whether or not the `task` parameter is present in the request.
> 2. Receivers **MAY** return a `CreateTaskResult` in response to any request, whether or not the `task` parameter is present in the request.
> 3. Receivers that receive a `task` parameter in a request and do not wish to create a task **MUST** ignore the parameter.
> 4. Receivers **MUST NOT** return a `CreateTaskResult` unless and until a `tasks/get` request would return that task; that is, in eventually-consistent systems, receivers **MUST** wait for consistency.

#### Error Handling

##### Protocol Errors

The following statement will be removed:

> Additionally, receivers **MAY** return the following errors:
>
> - Non-task-augmented request when receiver requires task augmentation for that request type: `-32600` (Invalid request)

## Rationale

### Jumpscares vs. Immediate Results

An [alternative proposal](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1905) handles the immediate result case individually, and with slightly different preconditions: _If_ tasks are supported, _and_ the client supports immediate task results, _then_ servers may return a regular result in response to a task-augmented request. That version of immediate results looked like a better option at the time, as it implied no breaking changes on top of the initial tasks specification.

However, as there is now a greater appetite for introducing (small) breaking changes for the June specification in the name of simplification, and as we look to [move away](https://blog.modelcontextprotocol.io/posts/2025-12-19-mcp-transport-future/) from stateful protocol interactions, it seems worth proposing a somewhat more radical change that reduces the complexity of the overall specification and makes tasks more "native" to MCP at this time. In particular, the choice to allow unsolicited tasks (in _addition_ to immediate results) means promoting tasks to a first-class concept intended for all persistent operations, as opposed to being a parallel and somewhat specialized concept.

This happens to align with the [Multi Round-Trip Requests (MRTR)](https://github.com/modelcontextprotocol/transports-wg/pull/12) draft proposal from the Transports Working Group, but the two are not coupled with one another.

### Waiting for Consistency

In the updated "Task Support and Handling" section under "​Behavior Requirements", the following new requirement is introduced:

> Receivers **MUST NOT** return a `CreateTaskResult` unless and until a `tasks/get` request would return that task; that is, in eventually-consistent systems, receivers **MUST** wait for consistency.

This addition is intended to avoid speculative `tasks/get` requests from requestors that would otherwise not know if a task has silently been dropped or if it simply has not been created yet. While this does increase latency costs in distributed systems that did not already behave this way, explicitly introducing this requirement simplifies client implementations and eliminates a source of undefined behavior.

## Backward Compatibility

### Jumpscares

The headline breaking changes of this proposal are:

1. Allowing a receiver to return a regular result even if the requestor explicitly asked for a task.
2. Allowing a receiver to return `CreateTaskResult` even if the requestor did not ask for a task.

At a protocol level, this should be handled according to the protocol version. Under the `2025-11-25` protocol version, these cases should result in errors, but under the next protocol version, that validation should be skipped.

### On Polymorphism

In SEP-1686, we explicitly chose not to introduce the behavior described in this proposal, as it would have required all implementations to break all method contracts by allowing `CreateTaskResult` to be returned in addition to the non-task result shape. This proposal explicitly rejects that argument, opting to consider `CreateTaskResult` as something akin to a JSON-RPC error, which already needed to be handled in the standard result path. Implementations already needed to branch response handling for error response shapes - `CreateTaskResult` is different, in that rather than being a different JSON-RPC envelope shape, it is a different subset shape of a JSON-RPC result.

Fortunately for us, `CreateTaskResult` also happens to be a unique result shape, as it is the only MCP result with a single `result.task` key. This enables implementations to predictably handle this difference internally at the deserialization layer without necessarily exposing it to SDK consumers. The following (non-binding) implementation approach is suggested to support this:

1. All existing API surfaces should remain unchanged - that is, if a `client.callTool()` method is written to return `CallToolResult`, that method contract should not be altered to return a union of `CallToolResult` and `CreateTaskResult`.
2. Internally, if such a request returns `CreateTaskResult`, follow the standard task polling semantics of the current specification.
3. Gradually introduce new methods that surface the polling flow to SDK consumers as needed.

## Security Implications

This change does not introduce any new security implications.

## Reference Implementation

To be provided.
