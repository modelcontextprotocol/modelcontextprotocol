# SEP-0000: Promote Tasks into the Core Protocol

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-11-19
- **Author(s)**: Sri Panyam (@panyam)
- **Sponsor**: None
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/{NUMBER}

## Abstract

This SEP promotes the Tasks extension (`io.modelcontextprotocol/tasks`, [SEP-2663](./2663-tasks-extension.md)) into the core protocol. It follows the promotion rules in [SEP-3392](./3392-extension-lifecycle.md).

With tasks, a server can answer a request with a durable handle instead of a result. The client polls the handle with `tasks/get`. It answers mid-flight input with `tasks/update`, and it stops the work with `tasks/cancel`.

SEP-2663 moved tasks out of the `2025-11-25` core specification and into an extension. The design could then change with implementation feedback. The extension is now Beta, and its stated destination is Core.

This SEP names the core protocol revision R in which tasks becomes core behavior. It defines every difference between core tasks and the extension's final revision, as SEP-3392 requires. A request that declares a revision earlier than R keeps the extension's behavior.

## Motivation

SEP-2663 stated the goal: "Once the extension has stabilized and achieved broad adoption, it is intended to be promoted into the core protocol." The Tasks and Events Working Group carries this goal as its work item "Tasks stabilization and core protocol promotion".

> TODO: adoption evidence. Clients that support tasks (client matrix, PRs #3355 and #3459). SDKs that implement the extension (TypeScript `@modelcontextprotocol/ext-tasks`, mcpkit, others). Conformance results.

> TODO: proposals that build on tasks. SEP-2848 (asynchronous tool approval) and SEP-2694 (resumable task event streams) depend on tasks. ext-tasks PR #38 binds task output to Events (SEP-3415). Today each of them depends on an extension. After promotion they depend on core.

> TODO: SDK cost. SDKs ship tasks as a separate package today. Core tasks removes the per-request extension declaration and the separate package.

## Specification

### Source and target revision

The extension's source is [`modelcontextprotocol/ext-tasks`](https://github.com/modelcontextprotocol/ext-tasks), revision `2026-07-28`, at `specification/2026-07-28/`. Under SEP-3392 that directory moves to `specification/beta/tasks/2026-07-28/`.

> TODO: target revision R. Under SEP-3398 a release-bound SEP must be Final and merged by soft freeze.

Core tasks is the extension's `2026-07-28` revision, with the differences listed below. A behavior this section does not list is unchanged from the extension.

### Differences from the extension

#### D1. Capability negotiation

> TODO: how a client signals that it can handle `CreateTaskResult` under revision R, and how a server advertises task support. See Open Question 1.

#### D2. Relationship to the `2025-11-25` tasks feature

> TODO: the `2025-11-25` core specification defined a different feature under the same name. See Open Question 2.

#### D3. Reserved names and error codes

> TODO: the core reservations for the `tasks/` method prefix, the `notifications/tasks/` prefix, the `resultType` value `"task"`, and error `-32021` for tasks.

#### D4. Task-augmented requests

> TODO: whether `tools/call` stays the only task-augmented request. See Open Question 4.

#### D5. Input requests

> TODO: which server-to-client requests `inputRequests` may carry under R, given the deprecation of sampling in SEP-2577. See Open Question 6.

### Revisions earlier than R

For a request that declares a revision earlier than R, the extension applies as its final revision defines it. A client that still supports earlier revisions SHOULD keep advertising `io.modelcontextprotocol/tasks`. A server that does not yet support R can then fall back to the extension. A peer stops advertising the extension when it no longer supports any revision earlier than R.

### Specification and schema changes

> TODO: new core page for tasks; changes to the tools page for the polymorphic `tools/call` result; `schema.ts` types (`Task`, `DetailedTask`, `CreateTaskResult`, the `tasks/*` requests, `notifications/tasks`); changelog entry; the archive notice for ext-tasks once R is released.

## Rationale

> TODO: why promote now; why promote from Beta rather than first go Stable; alternatives considered for D1 and D2.

## Backward Compatibility

Requests that declare a revision earlier than R see no change.

> TODO: changes under R, and the migration path for SDKs that ship the extension as a separate package.

## Security Implications

> TODO: core tasks keeps the extension's security model: unguessable task IDs, authorization on every `tasks/*` request, and no `tasks/list`. State any change that D1 to D5 introduce.

## Reference Implementation

> TODO: mcpkit branch that serves tasks as core behavior under revision R.

## Testing Plan

> TODO: conformance scenario and `sep-NNNN.yaml` per SEP-2484, built from the existing tasks extension scenarios.

## Open Questions

1. **Capability negotiation.** Under the extension, a client declares support per request in `_meta`. Under R, does a client still opt in, or must every R client handle `CreateTaskResult`? If a core `capabilities.tasks` key exists, its shape differs from the `2025-11-25` key of the same name.
2. **The `2025-11-25` tasks feature.** That feature used a `task` request parameter, `tasks/result` and `tasks/list`. How does the specification tell the two features apart, in prose and in SEP-2596 lifecycle terms?
3. **Reserved names.** Do all extension reservations move into core unchanged?
4. **Scope.** Does `tools/call` stay the only task-augmented request?
5. **Open extension semantics.** Which of these does this SEP settle, and which does it defer? ext-tasks #24 (transitions missed across a `subscriptions/listen` reconnect), ext-tasks #37 (terminal status vs accepted work), and ext-tasks PR #26 (related task IDs in `_meta`).
6. **Input requests and deprecated features.** `inputRequests` can carry sampling requests, and SEP-2577 deprecates sampling. Does core tasks follow the sampling removal timeline?

## Acknowledgments

This SEP builds on SEP-1686 and SEP-2663, by Luca Chang (@LucaButBoring) and Caitie McCaffrey (@CaitieM20).
