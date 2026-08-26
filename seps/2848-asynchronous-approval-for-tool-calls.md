# SEP-2848: Asynchronous Approval for Tool Calls

- **Status**: draft
- **Type**: Extensions Track
- **Created**: 2026-06-02
- **Author(s)**: Karl McGuinness
- **Sponsor**: None (seeking sponsor)
- **Working Group**: MCP Fine-Grained Authorization WG (proposed)
- **Extension Maintainers**: TBD (required before review per SEP-2133)
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2848

## Abstract

This SEP defines an extension that lets an MCP server gate a tool call on an out-of-band
approval without keeping the original request open. When the server's authorization decision is a
denial that is _requestable_ (something can still approve it), the server returns a task
handle ([SEP-2663](./2663-tasks-extension.md)) in place of the tool result instead of
failing the call. The task stays `working` while the deployment's resolver decides out of band; on approval
the server re-checks policy, executes the tool, and makes the result available through
`tasks/get`.

The approval protocol runs on the server's approval backend and never crosses the MCP
wire: the client sees only a task ID it can poll and cancel, and handles no authorization
artifact. Binding the backend's durable, resumable handle to a durable MCP task ID lets a
poll resume after a restart. The backend is pluggable, with the OpenID AuthZEN Access
Request and Approval Profile (ARAP) as a worked example (see Example binding). The feature
is an experimental extension per [SEP-2133](./2133-extensions.md), layered on tasks.

## Motivation

A requestable denial is resolved by whatever the deployment designates, often not a human,
and sometimes several resolvers in sequence (see Use cases). What is constant is that the
decision
happens **out of band and asynchronously**, and may outlive the request, the connection,
and the process that made the call. MCP already has asynchronous execution (tasks,
SEP-2663), connection-level authorization (OAuth 2.1), and externalized per-call policy;
what is missing is the binding that says a call is denied now but approvable later by
something else, and ties that pending decision to a durable task. The input paths tied to
the original request do not survive a disconnect, so without this binding a server facing a
requestable
denial either fails the call and loses the workflow, or blocks until something times out.
This SEP defines the binding and the narrow, MCP-observable behavior around it.

### Use cases

The MCP-facing shape is identical across resolvers:

- **Human reviewer** approves out of band, possibly the next day (for example
  `wire_transfer` above a threshold).
- **Supervising agent or orchestrator** approves programmatically in seconds.
- **Automated policy or risk engine** clears once a condition or grant provisions.
- **External ITSM or IGA system** decides by its own, possibly automated, rules.
- **Four-eyes or break-glass**: a second principal authorizes a sensitive operation.

For the no-human resolvers there is no session, so submission input is filled by the agent
against the backend's schema (see Collecting submission input).

## Specification

### Relationship to existing specifications

This SEP composes existing pieces and adds the binding between them:

- **SEP-2663 (Tasks extension, `io.modelcontextprotocol/tasks`)** supplies the durable,
  pollable primitive: server-directed `CreateTaskResult` (`resultType: "task"`), the
  methods `tasks/get`, `tasks/update`, `tasks/cancel`, `notifications/tasks`, and the
  statuses `working`, `input_required`, `completed`, `failed`, `cancelled`.
- **SEP-2322 (Multi Round-Trip Requests)** supplies the request round-trip channel
  (`inputRequests` / `inputResponses` carried in `requestState`) for pre-task submission
  input; in-task input uses SEP-2663's `tasks/update`.
- **SEP-2133 (Extensions)** supplies the extension and capability framing.
- **SEP-2643 (Structured Authorization Denials)** supplies the portable denial
  envelope, `io.modelcontextprotocol/authorization`, which classifies the failure and
  states the remediation posture. A server that also implements SEP-2643 emits it as
  the denial classification while a call is denied; this extension's
  `io.modelcontextprotocol/tool-approval-disposition` carries the execution outcome.
  Envelope behavior below applies only to servers that implement SEP-2643.
- **An approval backend** supplies the approval lifecycle: it accepts an approval request
  idempotently under a caller-supplied submission key, returns a durable resumable handle,
  resolves the request out of band into a terminal state (granted, denied, expired,
  cancelled, or failed), and on a grant returns approval material the server uses as an input
  to re-evaluation. The server, not the backend, performs that re-evaluation through its
  authorization decision so the decision stays authoritative. The backend bounds the approval
  by an expiry and MAY support cancellation. This SEP references that abstract contract, not any single backend.
  The OpenID AuthZEN ARAP is a worked example (see Example binding: AuthZEN ARAP).

The MCP server is the Policy Enforcement Point (PEP) and the only party that speaks the
approval protocol; the client speaks ordinary MCP. The backend is pluggable, and a
deployment binds it to whatever provides the contract above. Whether the generic
execution and disposition semantics should live here or move into SEP-2643 or the tasks
extension is open (see Limitations).

The composition order is:

1. the server evaluates every `tools/call` against its authorization policy;
2. a requestable denial enters the approval lifecycle: submit the request, bind the
   backend's handle to the MCP `taskId`, and return a `working` task;
3. on resolution the server re-evaluates with the approval as an input;
4. that decision is authoritative: an approval is an input to a new decision, not a
   standing grant.

### Server-side flow (informative)

Non-normative. The only MCP messages are between Client and Server; everything to the
right of the server is internal to the PEP and never crosses the MCP boundary.

```mermaid
sequenceDiagram
    participant C as Client
    participant S as MCP Server (PEP)
    participant P as Authorization decision
    participant A as Approval backend

    C->>S: tools/call
    S->>P: authorization check
    P-->>S: deny, requestable
    S->>A: submit approval request (binding material)
    A-->>S: durable handle (bound to MCP taskId)
    S-->>C: CreateTaskResult (resultType: "task", status: working)
    Note over P,A: Out-of-band resolution<br/>(human, agent, policy, or external system)
    A-->>S: resolved (callback or poll)
    S->>P: re-evaluate with approval
    P-->>S: allow
    S->>S: execute tool; task = completed (result available)
    C->>S: tasks/get
    S-->>C: CompletedTask with result (CallToolResult)
```

The backend's constructs (the requestable-denial signal, binding material, the durable
handle, and the approval input to re-evaluation) are defined by the backend and
referenced, not redefined, by this SEP. For the AuthZEN ARAP mapping, see Example
binding: AuthZEN ARAP.

### Extension identifier and capability

The extension identifier is `io.modelcontextprotocol/tool-approval` (reversed-domain
prefix per SEP-2133; illustrative, to be confirmed with the owning group). It builds on
the tasks extension, so a server MUST also support `io.modelcontextprotocol/tasks`.
Both are declared in the server's `extensions` capability:

```json
{
  "capabilities": {
    "extensions": {
      "io.modelcontextprotocol/tasks": {},
      "io.modelcontextprotocol/tool-approval": {}
    }
  }
}
```

Task creation is server-directed (SEP-2663): the client only declares the tasks extension,
and the server decides per request whether to return a `CreateTaskResult`. A client that
has not declared tasks but issues a call the server can satisfy only through approval MUST
receive either a `-32003` (Missing Required Client Capability) error naming
`io.modelcontextprotocol/tasks`, or a normal `CallToolResult` with `isError: true`
carrying requestable guidance (a degraded path with no async resume). Since `-32003` reads
as a capability gap rather than "go obtain access," a server that wants non-tasks agents to
act on a requestable denial SHOULD prefer the degraded `CallToolResult` with next-step
guidance.

Declaring `io.modelcontextprotocol/tool-approval` is an optional client signal that it
understands approval semantics (for example, to render approval-specific UI). Correct
behavior does not require it, since an approval-gated task is an ordinary
tasks-extension task.

> **Client maturity (non-normative).** The canonical flow needs a client that drives
> `io.modelcontextprotocol/tasks`, which is experimental and not yet in shipping clients,
> so end-to-end value and interop testing depend on tasks-client adoption. In the interim a
> server MAY also expose approval as ordinary tools (for example `request_access` /
> `get_request_status`) carrying the same next-step fields (a hint, the request schema, a
> poll interval); this SEP does not standardize that shape.

### Denied-but-requestable returns a task

When the server evaluates a `tools/call` and the decision is "deny":

1. If the denial is **not** requestable, the server returns the normal denied tool
   result: a `CallToolResult` with `isError: true` describing the denial. (Per SEP-2663,
   an `isError` result delivered through a task is a `completed` task, not a `failed`
   one.)
2. If the denial **is** requestable and the client declared the tasks extension, the
   server MUST NOT execute the tool. Instead it:
   - records a durable submission-intent with a fresh, opaque idempotency key before
     contacting the backend, submits the approval request under that key, and persists the
     returned handle (see Crash-consistent creation);
   - creates the durable MCP task bound to that handle and returns a `CreateTaskResult`
     (`resultType: "task"`) with `status: "working"` and a human-readable
     `statusMessage`;
   - if it implements SEP-2643, includes the denial envelope in the result `_meta` under
     `io.modelcontextprotocol/authorization` (`reason: "insufficient_authorization"`,
     `remediation: "available"`, a `remediationHints` entry of `type: "task"`), and MUST
     repeat that envelope on every `tasks/get` result while the task is non-terminal, so
     a client resuming after a restart with only the `taskId` still reads the pending
     classification;
   - MAY include an `io.modelcontextprotocol/model-immediate-response` value in `_meta`
     so the model receives an immediate string.

The server MUST NOT surface the backend's binding material or endpoints to the client
(for example, in the ARAP binding, `binding_token`, `evaluation_id`, the `approval`
object, and access-request endpoints). These are internal to the PEP.

**Crash-consistent creation.** Submitting to the backend and creating the MCP task are two
writes, and a crash between them must not orphan an approval or double-submit. Deduplication
decides first, before any submission, whether a repeated `tools/call` reuses an existing
non-terminal task (see At-most-once and deduplication). When the server does submit, whether
an initial request or a chained `request` (see Completion), it MUST generate a fresh,
opaque, high-entropy idempotency key for that logical submission, and MUST record a durable
submission-intent holding that key plus the exact submission body and requester context
needed to reproduce an equivalent request, before it contacts the backend. It then submits
under that key. A conforming deployment MUST configure its backend to treat a repeat of the
key with an equivalent body as the same request, return the same handle, and retain the key
through reconciliation, so a retry after a crash recovers the original rather than creating a
duplicate. The key identifies one submission, not the call, so distinct intents and
successive chained requests never collide. The server MUST persist the returned handle before
it returns `CreateTaskResult`, so the task is durable when returned (SEP-2663) and a callback
that arrives first has a record to bind to. On restart the server MUST reconcile any
submission-intent with no bound task, either by recovering the handle under its key or by
cancelling the orphaned request.

**At-most-once and deduplication.** The server controls both task creation and
execution, so it MUST execute the approved tool at most once per task. To keep a client
retry (after a poll timeout or restart) from opening a second approval task, the server
SHOULD return the existing task's `CreateTaskResult` when it recognizes a repeated
requestable denial within one dedup scope: the same **originating authorization
context** (the authenticated caller or subject the task is bound to), tool, and arguments.
It matches against both non-terminal tasks and in-progress submission-intents, so a
concurrent retry in the window between persisting the intent and creating the task does not
open a second approval. This is best-effort: a client-local nonce in the arguments defeats it, identical arguments
from two distinct intents collide, and MCP has no request-level idempotency key that would
make it exact (see Limitations). So the at-most-once guarantee is per task, and a
non-idempotent tool can still run more than once through distinct tasks.

Once a task reaches a terminal disposition it is final, permanently fenced against
execution, and MUST NOT be reopened. A later identical `tools/call` is a new intent that
the server evaluates fresh; it does not automatically create a new approval request and
re-enters the approval lifecycle only if that fresh evaluation itself returns a
requestable denial. A terminal `denied-not-executed` therefore carries
`remediation: "unavailable"` in the full SEP-2643 sense: the client is not invited to
retry it.

**Retention.** Retention has two phases. While the task is pending, `createdAt` plus `ttlMs`
MUST cover the current pending deadline plus `resultRetention`, where the pending deadline is
the backend request deadline before a grant and the approval validity during post-grant
retry, and `resultRetention` is a server-configured duration for how long a terminal result stays
retrievable; the server MUST NOT delete or expire a `working` task before its pending
deadline. At terminalization the server MUST extend `ttlMs` if needed so it covers
`terminalizedAt` plus `resultRetention`. A `ttlMs` of `null` means unlimited (SEP-2663) and
satisfies both boundaries with no extension. Because the backend
often sets or extends the window after submission, the creation-time `ttlMs` is provisional;
when the server learns a later deadline it MUST extend `ttlMs` (reported on `tasks/get` and
`notifications/tasks`). A server SHOULD bound the maximum window it accepts so pending tasks
do not accumulate without limit.

**Model-facing text is untrusted.** `statusMessage` and any `model-immediate-response`
are fed to the model and MUST NOT carry unsanitized text from untrusted sources; they
are a prompt-injection surface. A `working` or `input_required` task MUST NOT be
presented to the model as a completed action.

### The task handle is not authority

The `taskId` is a reference to a pending decision, never a grant. Authority is the
authorization decision, re-derived at execution against the captured call binding (see
Completion). The server keeps three kinds of state per task, with different mutability:

- **Immutable call binding**, captured on the first `tools/call` and never changed (carried
  in `requestState` per SEP-2322 across any pre-task synchronous input round-trip, then
  promoted unchanged into the task): the tool name;
  the complete tool arguments, stored in full (subject to the durable sensitive-state
  requirement in Security Implications), since execution runs from them long after the call
  and a digest cannot reconstruct them, and
  optionally a digest over a canonical serialization (for example JCS canonical JSON, RFC
  8785, with a named hash such as SHA-256) alongside them for integrity checking; and the
  originating authorization context (the requester principal's identity, the subject or
  resource acted on, and any delegation), captured so a different caller is rejected. An
  approval is bound to this identity.
- **Mutable approval-workflow state**: the current backend handle and request id, a
  monotonically increasing submission generation, and the current approval expiry and
  window. These change legitimately, for example when a re-evaluation returns `request` and
  the server opens a new request (see Completion), or when the backend extends the expiry.
  The server retains enough handle history to recognize a superseded generation.
- **Mutable execution state**: the single execution claim and the terminal disposition,
  set once the task reaches execution (see Completion).

The server MUST check the immutable call binding before executing, and MAY record the
policy id and version for audit and drift detection (recorded, not pinned). Execution
runs from the captured binding, not from a fresh client call, so there is no "current
call" to trust at execution time. An MRTR retry that resumes the original call, echoing it with `requestState`, MUST match the
immutable call binding: the server MUST reject it if the tool, arguments, or originating
caller differ. A `tasks/update` is different: it carries no tool or arguments, so the server
authorizes the caller against the `taskId` and validates the outstanding input keys instead.
An independent new `tools/call` is a new intent evaluated fresh; only a changed binding is
guaranteed not to match dedup, while an identical independent intent is indistinguishable
from a retry and MAY collide.

### Collecting submission input

The approval request may require inputs before or during the approval: a justification,
a ticket reference, or fields the backend defines (its submission schema and forms; for
example, in the ARAP binding, `request_schema_url`, `form_url`, `request_catalogs_url`).
The server collects these over the tasks input channel (SEP-2322), not a standalone
`elicitation/create`, since SEP-2260 disallows unsolicited server-to-client requests and
SEP-2663 routes task input through `inputRequests` / `tasks/update`:

- **Before submission (synchronous).** The server returns `resultType: "input_required"` on
  the original `tools/call`. The client then retries the `tools/call` with `requestState` and
  `inputResponses` (per SEP-2322); the server validates that retry against the pre-task
  immutable call binding it captured on the first call and carried in `requestState`, submits
  the approval request under Crash-consistent creation, and
  returns the `CreateTaskResult` on the retry. A single JSON-RPC response cannot carry both
  `input_required` and the task. Use this when the backend will not accept the request without
  the inputs.
- **During the workflow (in-task).** The server sets the task to `input_required` with
  outstanding `inputRequests`; the client answers with `inputResponses` via
  `tasks/update`, and the task returns to `working`.

Who answers is a property of the client: an interactive client renders the request for a
human, an autonomous agent answers from context against the backend's request schema.
An in-task round-trip requires a client that returns to the task; an agent that persisted
its `taskId` can resume polling after a restart (SEP-2663) and answer via `tasks/update`,
but a client that did not persist it or will not return cannot, so deployments expecting
long gaps SHOULD collect all inputs synchronously before submission. The mapping from the
backend's request schema onto the `inputRequests` schema is not pinned here and is
currently implementation-specific.

### Lifecycle and task status

The backend resolves the approval request into a terminal state (granted, denied, expired,
cancelled, or failed); a grant triggers the server's re-evaluation, which yields allow,
retry, request, or deny (see Completion). Both feed the mapping below. Each row maps to an
MCP task status and a disposition; a SEP-2643-aware server also carries an envelope while
the call is denied. The envelope classifies the denial (present only while denied); the
disposition records what happened to execution. They are independent axes.

| Backend state | Task status | SEP-2643 envelope | Disposition |
| --- | --- | --- | --- |
| Awaiting a decision | `working` | `available`, `task` hint | none yet |
| Needs submission input (in-task) | `input_required` | `available` | none yet |
| Re-evaluation returns retry | `working` (wait, then re-evaluate) | `available` | none yet |
| Re-evaluation returns request | `working` (new request) | `available` | none yet |
| Allowed, executed once | `completed` | none | `approved-executed` |
| Backend denied, or re-evaluation deny/none | `completed`, `isError` | `unavailable` | `denied-not-executed` |
| Approval or request expired unresolved | `completed`, `isError` | `unavailable` | `denied-not-executed` |
| Executed, tool errored | `completed`, `isError` | none | `execution-error` |
| Execution claimed, outcome undeterminable | `completed`, `isError` | none | `outcome-unknown` |
| JSON-RPC error, or a backend/infra failure surfaced as one (retryable) | `failed` (carries the SEP-2663 `error` object) | none | — |
| Cancelled by client (`tasks/cancel`) or backend | `cancelled` | none | — |

While `working`, the server tracks the approval by polling the backend's status source or
receiving its callback. The `taskId` and every backend handle generation are durably bound
to the task, and only the current generation is actionable, so a server that restarts
rehydrates the task from the persisted handles and keeps serving `tasks/get`. Per the table, `failed` carries the SEP-2663 `error` object and covers a JSON-RPC protocol
error or a backend/infra failure surfaced as a JSON-RPC internal error; unlike a denial such
a `failed` is retryable, and it is not an authorization outcome. A task MUST enter `failed`
only before an execution claim (see Completion); any failure after the claim MUST be a
`completed` `CallToolResult` with `execution-error` or `outcome-unknown`, so a possible side
effect is never hidden behind a retryable `failed`.

Three clocks apply and are distinct: the backend's request deadline (how long the request
stays open for a decision), the approval's validity once granted, and MCP retention
(`createdAt` plus `ttlMs`, always measured from `createdAt` even when the server extends
it per Retention). When the request deadline or approval validity passes without a usable
approval, the task completes as a terminal denial (`denied-not-executed`, with the body
noting expiry) and the server fences it against later execution. MCP retention is separate:
once `ttlMs` elapses the server MAY delete a task that has not been execution-claimed
(SEP-2663). An execution-claimed task MUST NOT be deleted before it terminalizes: at the
claim the server extends retention through an execution deadline, and when that deadline
arrives it terminalizes the task as `outcome-unknown` (if no stronger result is available),
retains that result for `resultRetention`, and only then MAY delete it. A terminal task MUST
NOT change to `failed`, which would erase its disposition.

### Execution disposition

`io.modelcontextprotocol/tool-approval-disposition` is this extension's machine-readable
outcome. It is a string and MUST be present in the `_meta` of the `CallToolResult` carried
in a completed task's `result` field, on every completed approval task, independent of
SEP-2643. Its value is one of:

- `approved-executed`: the tool was authorized and executed once.
- `denied-not-executed`: the tool did not run (denied, expired, or unresolved), so no side
  effect occurred.
- `execution-error`: the tool was authorized and ran but failed; a side effect may have
  occurred.
- `outcome-unknown`: execution was claimed but the server cannot determine whether
  invocation or the side effect completed.

The outer `tasks/get` result carries the `Task`, whose `status` conveys
`completed`/`failed`/`cancelled`; the disposition refines a `completed` task's execution
outcome and is not set on `failed` or `cancelled` tasks. Future values MAY be registered. A
client that does not recognize a disposition value MUST treat the operation as possibly
executed and MUST NOT retry it automatically.

### Completion: re-evaluate, then execute

On approval the server MUST re-evaluate authorization with the approval as an input, so
the decision stays authoritative at enforcement time. An approval is an input to a new
decision, not a standing grant, and this re-evaluation is server-internal. It runs against
the immutable call binding and current policy; a recorded policy version is for audit, not
pinning, so a policy change yields a fresh decision. The re-evaluation resolves to one of
four outcomes:

- **allow**: proceed to execution.
- **retry** (the approval is valid but a backing grant has not provisioned, or a
  transient hold): the task stays `working`. The server waits the backend's retry-after
  hint, or bounded exponential backoff with jitter if none is given, then re-evaluates,
  and MUST stop once the approval expires. A retryable outcome MUST NOT be completed as a
  denial.
- **request** (this approval does not suffice, but a fresh approval request might): the
  task stays `working`. The server first atomically marks the current generation consumed and
  records a new submission-intent with its own fresh submission key (the immutable call binding
  is unchanged), then contacts the backend under Crash-consistent creation and attaches the
  returned handle to the new generation. Ordering it this way closes the window where a stale
  callback could still act: a callback or poll result for a consumed generation MUST NOT cause
  re-evaluation or execution, even when it is authentic, since the decision has moved on. A
  server MUST bound the number of chained requests per task so this cannot loop indefinitely;
  on reaching the bound it completes the task as a terminal denial.
- **deny or none**: the task completes as a terminal denial.

Because execution can occur long after the request, an approval is not a substitute for
caller authentication. The intent, approval scope, and the originating caller's identity come
from the immutable binding; every other authorization input MUST be current at execution:
whether that caller is still a valid principal, and the subject and resource state, risk and
environmental attributes, the downstream credential, and policy. Re-evaluating against captured risk or environment would
defeat the risk-clearing case, so those MUST be re-read, not replayed. The server MUST
validate the immutable call binding, and if the tool implementation, its schema, or the
authorization mapping changed materially while the task was pending, it MUST evaluate against
that change or fail closed. If the principal is no longer valid, a required credential has
expired, or the action is materially stale, the server MUST NOT execute (it completes as a
terminal denial, or keeps the task `working` if the condition is transient).

Execution MUST be fenced so a crash cannot double-execute a side effect. A task that
proceeds to execution MUST make a single atomic compare-and-set from pre-execution to
execution-claimed; this happens at most once and is mutually exclusive with cancellation and
expiry (a task that is denied, cancelled, or expired makes no claim). The claim is the
irrevocable authorization-enforcement point: all validity checks, the identity and freshness
checks above and the approval expiry, MUST hold at the moment of the claim, and a
cancellation or expiry that precedes the claim wins (the exact cancellation boundary, see
Cancellation). The claim does not terminalize the task: its observable status stays `working`
until the final result is stored. Once the claim succeeds the server invokes the tool at most
once and MUST carry it through even if the approval expiry elapses during invocation, since
authorization was enforced at the claim. If it cannot determine whether invocation or the
side effect completed (a crash after the claim, before or after invoking), it MUST NOT
re-invoke, and the task completes `outcome-unknown`.

Every completed approval task MUST carry
`io.modelcontextprotocol/tool-approval-disposition` (see Execution disposition). The
denied-versus-executed distinction MUST also be stated in the `CallToolResult` body, not
only in `_meta`: the `content` MUST state whether the tool ran, did not run, or may have run with the outcome unknown, and it MAY also appear in
`structuredContent` where the tool's `outputSchema` permits, so the model behind a client that
understands only
`io.modelcontextprotocol/tasks` reads it. That client cannot distinguish outcomes
programmatically without the disposition, which is why the disposition is required. Body,
disposition, and, for a SEP-2643-aware server, the envelope MUST agree. The envelope
appears only on a denial: because its presence asserts the operation was not performed, it
MUST NOT appear on an `execution-error` or `outcome-unknown` result, where the server
cannot make that assertion. The server MUST bound any downstream credential, and any
authorization-decision or downstream-response cache it keeps, by the approval's expiry; this
does not apply to the task's retained terminal result, which follows Retention.

### Cancellation

A `tasks/cancel` request attempts the same atomic transition as the execution claim, from a
cancellable pre-claim state to `cancelled`. Only a winning transition moves the task to
`cancelled` and durably fences it against execution; if the execution claim already won or the
task is already terminal, the cancel is a no-op. On a winning cancel the server MUST cancel the
underlying approval request when the backend supports it (backend cancellation is optional; in
the ARAP binding it is offered only when a cancellation endpoint is present) and otherwise MUST
record the cancellation locally and ignore any later approval. Either way it is the local
fence, not backend cancellation, that guarantees the tool does not run. Per SEP-2663,
`notifications/cancelled` MUST NOT be used to cancel a task.

A cancel can arrive after approval but before execution. The server resolves the race by
the atomic execution claim (see Completion): if the cancel wins the compare-and-set, the
server honors it, moves the task to `cancelled`, and does not invoke (no side effect); if
the claim wins, the cancel is ineffective and the task completes with its execution
disposition. The server MUST NOT both execute the tool and report `cancelled`.

### What the client carries

After task creation the client carries a server-generated `taskId` only and MUST NOT be required to read,
store, or forward any authorization artifact. This extension adds meaning, not a new result
shape (see Backward Compatibility): a tasks-only client reads the denied-versus-executed
distinction from the `CallToolResult` body, an approval-aware client from the disposition
(see Completion, Execution disposition).

This extension does not emit SEP-2643's optional `authorizationContextId`. That field is
a non-authoritative correlation handle the client would echo on retry, but this client
forwards no authorization artifact and the `taskId` already correlates the denial with
its resolution. The authoritative binding between an approval and the exact call is the
server-side immutable call binding, internal to the PEP and distinct from that handle.

### End-to-end example

The JSON below abbreviates the SEP-2575 per-request metadata (protocol version, client
information, and client capabilities) that a real request carries.

Client calls a tool (having declared the `io.modelcontextprotocol/tasks` extension in its
per-request capabilities):

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "wire_transfer",
    "arguments": { "to": "acct-991", "amount": 50000 }
  }
}
```

The server gets a requestable denial, submits the approval request, and returns a task
handle in place of the tool result:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "resultType": "task",
    "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840",
    "status": "working",
    "statusMessage": "Transfers over $25,000 require treasury approval.",
    "createdAt": "2026-06-02T10:30:00Z",
    "lastUpdatedAt": "2026-06-02T10:30:00Z",
    "ttlMs": 604800000,
    "pollIntervalMs": 15000,
    "_meta": {
      "io.modelcontextprotocol/authorization": {
        "reason": "insufficient_authorization",
        "remediation": "available",
        "remediationHints": [{ "type": "task" }]
      },
      "io.modelcontextprotocol/model-immediate-response": "This transfer is pending treasury approval. You can continue other work and check back."
    }
  }
}
```

A `tasks/get` while the approval is pending returns the same `working` task with the
envelope repeated. After the workflow resolves out of band, the server re-evaluates,
executes, and a later `tasks/get` returns the completed task with the tool result:

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "result": {
    "resultType": "complete",
    "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840",
    "status": "completed",
    "createdAt": "2026-06-02T10:30:00Z",
    "lastUpdatedAt": "2026-06-03T09:05:00Z",
    "ttlMs": 604800000,
    "result": {
      "content": [
        { "type": "text", "text": "Transfer of $50,000 to acct-991 completed." }
      ],
      "isError": false,
      "_meta": {
        "io.modelcontextprotocol/tool-approval-disposition": "approved-executed"
      }
    }
  }
}
```

Had it been denied, the task would complete with `isError: true`, the envelope
classifying it (`remediation: "unavailable"`), and disposition `denied-not-executed`, and
the body stating the tool did not run.

## Example binding: AuthZEN ARAP (non-normative)

This section maps the abstract approval-backend contract above onto the OpenID AuthZEN
Access Request and Approval Profile (ARAP), one backend a deployment can bind. Other
backends map the same contract to their own constructs. Nothing here crosses the MCP
wire: the ARAP constructs are internal to the PEP, and the client sees only the MCP task.

| Abstract contract (this SEP) | AuthZEN ARAP construct |
| --- | --- |
| requestable denial | a decision carrying `context.access_request` |
| approval request submission | an Access Request to the Access Request Service |
| durable, resumable handle | the ARAP Task Handle |
| approval binding material | `binding_token`, `evaluation_id` |
| idempotent submission key | the `Idempotency-Key` header |
| re-evaluation with the approval as input | an Access Evaluation with the `approval` object at `context.approval` |
| re-evaluation allow | `decision: true` |
| re-evaluation not allowed | `decision: false` with `next_action`: `retry` or `request` (non-terminal, task stays `working`) or `none` (terminal denial) |
| authoritative status source | the ARAP Task Status Endpoint |
| submission schema and forms | `request_schema_url`, `form_url`, `request_catalogs_url` |
| cancellation (optional) | the ARAP cancellation endpoint, when present |
| backend terminal states | `denied` and `expired` map to disposition `denied-not-executed`; `cancelled` to the `cancelled` task; `failed` to the `failed` task; `partial` is bulk-only and does not apply to a single tool call |

Mapping a `tools/call` to an AuthZEN decision is itself a profile, the AuthZEN MCP
profile (COAZ), which is a draft, so that mapping is not yet stable.

The concrete ARAP flow, everything internal to the PEP except the client-facing MCP
messages:

```mermaid
sequenceDiagram
    participant C as Client
    participant S as MCP Server (PEP)
    participant P as AuthZEN PDP
    participant A as Access Request Service

    C->>S: tools/call
    S->>P: Access Evaluation (COAZ mapping)
    P-->>S: deny + context.access_request (requestable)
    S->>A: submit Access Request (Idempotency-Key, binding_token)
    A-->>S: Task Handle (bound to MCP taskId)
    S-->>C: CreateTaskResult (status: working)
    Note over P,A: Out-of-band approval workflow
    A-->>S: approved (Task Status Endpoint or callback)
    S->>P: Access Evaluation (context.approval)
    P-->>S: decision: true (allow)
    S->>S: execute tool; task = completed
    C->>S: tasks/get
    S-->>C: CompletedTask with result
```

## Rationale

**Server-directed creation makes the client trivial.** Under SEP-2663 a tasks client
already handles a `CreateTaskResult` for any call and the server decides when to return
one, so an approval-gated server needs no new result shape and no per-tool opt-in.

**Build on tasks, stay backend-agnostic.** Tasks already gives a durable state machine with
polling, cancellation, input, and retention, and an approval workflow is a long-running
task over it. Because approval is brokered server-side and surfaced only as task status,
the MCP contract is identical whichever party or backend decides. The SEP encodes "decided
out of band," not "human in the loop."

**Why an extension, not Informational.** It adds wire-observable surface plain tasks does
not: a required `io.modelcontextprotocol/tool-approval-disposition` `_meta` field, a
requestable denial that MUST return a task, the denied-versus-executed distinction carried
in the `CallToolResult` body, and authorization artifacts that MUST NOT cross the wire. The
mandatory disposition field is the clearest reason this is an extension rather than
Informational guidance.

## Limitations and Open Questions

- **Cross-principal resumption is not portable.** MCP task access is bound to a
  server-defined originating context, and `tasks/list` was removed by SEP-2663 (with sessions
  removed by SEP-2567), so a different principal cannot reclaim a task. Same-principal resumption
  across restart works to the extent the server recognizes the returning caller.
- **Someone has to consume the result.** For a side-effecting tool the effect may land with
  no consumer observing it, so deployments MUST ensure a durable consumer polls or the
  effect is independently auditable.
- **A lost `taskId` has no recourse.** With `tasks/list` and sessions removed, an agent that
  did not persist its `taskId` cannot rediscover a possibly-executed task, so clients MUST
  persist task IDs durably.
- **No general request idempotency in MCP.** Cross-task duplicate suppression is therefore
  best-effort; a general key belongs in the core or the tasks extension, and this extension
  should adopt one if it is added.
- **Placement of the generic disposition.** The generic execution-outcome values
  (`execution-error`, `outcome-unknown`) could move into SEP-2643 or the tasks extension,
  leaving the approval-specific values (`approved-executed`, `denied-not-executed`) here. A
  cross-SEP question for the sponsors.
- **Extension versus Informational.** A sponsor who judges the normative surface too thin
  may prefer an Informational SEP.

## Backward Compatibility

Additive for new tools and servers: a tasks client that does not implement this extension
still observes a valid task lifecycle and a final `completed`/`failed`/`cancelled` task,
with no new wire format. For an existing tool that previously returned a synchronous
denial, enabling approval gating does change the observed `tools/call` response set (a
`CreateTaskResult`, or `-32003` / a degraded requestable `CallToolResult`, where a plain
denial used to appear), so it is a behavior change for upgraders, not purely additive.

## Reference Implementation

Required before Final (this introduces observable protocol behavior). Per SEP-2133 an
Extension SEP also needs at least one official-SDK reference implementation, and named
Extension Maintainers, before review; both are open prerequisites here. Planned: an MCP
server fronting an approval backend (for example the AuthZEN ARAP) that returns
`CreateTaskResult` for approval-gated calls and re-evaluates before execution, with a
human-resolved and an automatically-resolved path; and a client built only on
`io.modelcontextprotocol/tasks`, to show it interoperates with no approval-specific code.

A conformance scenario plus a `sep-NNNN.yaml` traceability file is required for Final,
covering these MCP-observable statements:

- a requestable denial returns a task without executing the tool;
- approval resumes execution at most once;
- a terminal denial is a `completed` task whose `CallToolResult` body (not only `_meta`)
  marks it `denied-not-executed`, distinct from an execution error;
- a changed envelope (tool, arguments, principal, or subject/resource) requires a new
  approval;
- a cancelled or expired task cannot later execute;
- result retrieval does not expose backend artifacts;
- submission input flows through the task input channel.

## Security Implications

- **Denial remains denial.** The server MUST NOT execute on the requestable denial alone
  and MUST re-evaluate after approval; the client gets no proof, so assurance beyond that is
  out of band.
- **Artifacts stay server-side.** The backend's binding material never reaches the client,
  preventing replay or substitution through the client surface.
- **The task handle is not a bearer token.** Authority is re-derived at execution, so a
  `taskId` never authorizes a different or mutated call (see The task handle is not authority).
- **Task access control.** Task IDs are unguessable single-task handles; the server MUST
  authorize `tasks/get`, `tasks/update`, and `tasks/cancel` against the task's originating
  context and MUST NOT leak approval contents or approver identity through `statusMessage`.
- **Confused deputy.** An approval applies only within the originally evaluated scope; the
  server MUST NOT let a client steer execution to a different operation.
- **Callback authenticity.** A backend callback MUST be authenticated, and unless it carries
  an enforceable result the server MUST treat the backend's status source as authoritative
  and fetch before executing. A forged or replayed callback MUST NOT cause execution.
- **Expiry.** Before an execution claim, after expiry the server MUST stop honoring the
  approval and durably fence the task against a late approval or callback; the claim is the
  enforcement point, so an approval valid at the claim carries through (see Completion).
- **At-most-once execution.** A durable execution claim guards against a crash re-invoking a
  side-effecting tool, with `outcome-unknown` when the result cannot be confirmed;
  cross-task deduplication is best-effort.
- **Untrusted model-facing text.** `statusMessage` and `model-immediate-response` MUST be
  sanitized, and a pending task MUST NOT be presented as completed.
- **Approval-request amplification.** Approval fatigue is a known bypass; deployments MUST
  rate-limit submission per caller and SHOULD bound outstanding pending tasks, returning a
  non-requestable denial on a limit so the agent does not retry-loop.
- **Out-of-band resolution.** Authentication, eligibility, and separation of duties for
  whoever decides are the backend's, outside MCP.
- **Durable sensitive state.** Crash recovery and delayed execution require persisting the
  submission body, requester context, and complete tool arguments, which may hold
  credentials, payment details, PII, and approval-binding artifacts. The server MUST protect
  these records for confidentiality and integrity, scope access to the owning task, keep them
  out of ordinary logs, and delete them when the task's retention ends. It SHOULD NOT persist
  bearer credentials inside arguments; where unavoidable, they MUST be encrypted and held for
  the minimum lifetime.

## References

- [SEP-2663: Tasks Extension](./2663-tasks-extension.md)
- [SEP-2322: Multi Round-Trip Requests](./2322-MRTR.md)
- [SEP-2133: Extensions](./2133-extensions.md)
- [SEP-2575: Stateless MCP](./2575-stateless-mcp.md)
- [SEP-2567: Sessionless MCP](./2567-sessionless-mcp.md)
- [SEP-2260: Associate server requests with client requests](./2260-Require-Server-requests-to-be-associated-with-Client-requests.md)
- [SEP-2643: Structured Authorization Denials](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2643) (open PR; this extension composes it once it lands, see Limitations)
- [OpenID AuthZEN Access Request and Approval Profile](https://openid.github.io/authzen/authzen-access-request-approval-profile-1_0.html) — the example backend binding
- [OpenID AuthZEN Authorization API 1.0](https://openid.github.io/authzen/)
