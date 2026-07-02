# SEP-0000: Partial Tool Results (Streaming Tool Call Output)

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-07-01
- **Author(s)**: Iyad Kuwatly (@Kuwatly)
- **Sponsor**: None (seeking)
- **PR**: TBD (filled in once the PR is opened, per SEP workflow)
- **Related**: #117, #383 (closed, prior art), #776 (closed, prior art), #982 (steering-committee tracking issue for long-running/streaming proposals), SEP-1391 (Long-Running Operations), SEP-2133 (Extensions Framework), SEP-2322 (Multi Round-Trip Requests), SEP-2632 (Structured Progress Content, seeking sponsor), SEP-2663 (Tasks Extension, Final; supersedes the original SEP-1686 core version), ext-apps #603

## Abstract

This SEP proposes an optional, capability-gated mechanism for servers to emit **ordered, structured partial results** during an in-flight `tools/call`, via a new notification `notifications/tools/partial_result`. The final `CallToolResult` remains the single authoritative response; partial results are a progressive-delivery enhancement that degrades gracefully on non-supporting clients. This gives MCP Apps a way to stream progressive-UI formats such as A2UI into their iframe within a single long-running tool call, a path that does not exist today.

## Motivation

`tools/call` is strictly request → single final response. This causes concrete, recurring problems:

1. **LLM-backed tools** ("agent as a tool") produce token streams but must buffer everything, destroying UX for long generations (#117, discussion #263).
2. **MCP Apps** iframes receive `ui/notifications/tool-input-partial` (0 or more times) followed by the complete `ui/notifications/tool-input`, but there is no output-side equivalent: only the final tool result arrives once the call completes. Long-running tools can only show a generic spinner. Progressive-UI formats such as A2UI (`surfaceUpdate`/`dataModelUpdate` applied incrementally over a JSONL stream) cannot stream into an app today.
   - Scope note: this is specifically about A2UI delivered via `tools/call` (Google's "A2UI over MCP" dynamic path, and "A2UI inside MCP Apps" pattern). It does not cover A2UI delivered via static `resources/read`, or the pattern where a host's own native A2UI renderer embeds an MCP App; those are separate gaps outside this SEP's scope (the former is closer to ext-apps #603, streaming resource content).
3. **Log/monitor-style tools** (test runners, builds, data pipelines) resort to awkward workarounds like "read log lines N–M" polling tools (documented in the original SEP-1686 Tasks proposal's use cases).
4. **Transport confusion:** Streamable HTTP streams protocol messages, so developers repeatedly assume tool results stream; SDK maintainers field this question directly (go-sdk discussion #551, which links back to #776). A data-layer primitive resolves this expectation gap uniformly across stdio and HTTP.

Existing/adjacent proposals do not cover this; the maintainers' own tracking issue (#982) catalogs the full landscape of long-running/streaming attempts, none of which land here:

- **#383** ("Introduce partial results as part of progress notifications") was the original attempt at streaming via `notifications/progress`; SEP-2632 revisits the same overload point with structured `content`. Both share the same limitation: conflating status telemetry with ordered result data, and no `seq`/typed result content.
- **#776** ("partial results and streaming responses") attempted this directly: multiple JSON-RPC responses sharing one request `id`, gated by a client `allowPartial` hint, with `_meta.hasMore` marking non-final chunks. It stalled on a real objection (Darrel Miller: JSON-RPC specifies exactly one response per request) and was closed for inactivity without resolving the tension. Notably, a maintainer (Mike Kistler) proposed on that thread the alternative this SEP adopts: a separate notification type keyed by a token, mirroring `progressToken`. This SEP is that path, formalized and reopened through the SEP process.
- The original SEP-1686 solved _deferred_ retrieval (call now, fetch later) and explicitly named intermediate/partial results as future work; that proposal has since been superseded by **SEP-2663** (Tasks Extension, Final), which does not carry that future-work language forward and whose own `notifications/tasks` is lifecycle/status-only (task created/working/completed), not incremental content. SEP-1391 addresses long-running/async execution generally but does not discuss intermediate results either. This SEP is the missing streaming layer, designed to compose with (not duplicate) Tasks.

## Specification

### 1. Capability declaration and opt-in (per request)

As of the `2026-07-28` baseline this SEP targets, MCP has no `initialize` handshake: it was removed in favor of statelessness, and every request MUST carry `_meta["io.modelcontextprotocol/clientCapabilities"]` (a full `ClientCapabilities` object, required on every request; servers MUST NOT infer capabilities from prior requests) alongside `_meta["io.modelcontextprotocol/protocolVersion"]` and `_meta["io.modelcontextprotocol/clientInfo"]`. `server/discover` exists, but it is optional for clients to call (servers MUST implement it); it is not a session-establishing handshake. Consequently, this SEP declares support the same way, per call, not at a one-time initialization step: a new top-level `partialResults` field on `ClientCapabilities`, a bare field, not under `extensions`, for the same reason given above (`extensions` per SEP-2133 is for capabilities living in a separate `ext-*` repo; this changes core `tools/call` semantics directly). `elicitation` is the current precedent for a bare `ClientCapabilities` field (`sampling` and `roots` are both deprecated as of `2026-07-28` per SEP-2577, so they're not good exemplars). Note in any case `ClientCapabilities` has no `tools` field to nest under: that only exists on `ServerCapabilities`, for servers declaring `tools.listChanged`.

Declaring the capability and opting in to streaming for a specific call happen together, in that call's own `_meta`; there's no separate negotiation step to opt in later:

```json
{
  "method": "tools/call",
  "id": 42,
  "params": {
    "name": "generate_report",
    "arguments": { "topic": "Q2 revenue" },
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": {
        "name": "example-host",
        "version": "1.0.0"
      },
      "io.modelcontextprotocol/clientCapabilities": { "partialResults": {} },
      "partialResultToken": "prt-abc"
    }
  }
}
```

Servers MUST NOT emit partial-result notifications for a call unless that call's `_meta["io.modelcontextprotocol/clientCapabilities"]` includes `partialResults`.

### 2. New notification

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/tools/partial_result",
  "params": {
    "partialResultToken": "prt-abc",
    "seq": 3,
    "content": [{ "type": "text", "text": "…next chunk of tool output…" }],
    "structuredContent": { "rowsProcessed": 1200 },
    "final": false
  }
}
```

Semantics:

- `seq` is a monotonically increasing integer starting at 0, scoped to `partialResultToken`; clients MUST apply chunks in `seq` order and MAY buffer out-of-order arrivals. `seq` is not redundant with transport-level ordering: both stdio and a single Streamable HTTP stream already deliver bytes in order, but (a) hosts MAY coalesce or drop chunks under backpressure (see Security Implications), so a receiver needs a way to detect gaps; (b) Streamable HTTP resumption (`Last-Event-ID` replay, see SEP-1335) can reintroduce reordering/duplication across a reconnect, and the SSE `id` it uses is a stream-wide replay cursor, not scoped per `partialResultToken`; (c) hosts forwarding chunks into an MCP App iframe do so via a separate `postMessage` hop after receipt, which is outside any transport ordering guarantee. `seq` gives the receiver a cheap, transport-independent check across all three cases.
- `content` reuses the standard `ContentBlock` union from `CallToolResult` (text, image, audio, resource, embedded resource), so e.g. an `application/a2ui+json` embedded resource chunk is valid, enabling streaming generative UI.
- `structuredContent` carries an incremental structured payload. Merge semantics are **append/replace by the consumer's contract**, not defined by MCP (mirrors how `structuredContent` itself is schema-defined by the tool).
- Delivery is best-effort: clients MUST tolerate missing chunks. The final `CallToolResult` is the sole source of truth and MUST be complete and self-contained (i.e., NOT assume the client saw any partials).
- `final: true` MAY be sent as the last chunk hint; the JSON-RPC response still terminates the call.

### 3. Tool declaration (optional)

A hint so hosts can prepare streaming UI:

```json
{ "name": "generate_report", "annotations": { "streamingHint": true } }
```

### 4. Interaction with other features

- **Tasks (SEP-2663):** when a call is executed as a task, partial-result notifications carry the task's `taskId` (in addition to `partialResultToken`) so a client polling or subscribed via `subscriptions/listen` can correlate them. This is distinct from, and composes with, SEP-2663's own `notifications/tasks`, which is lifecycle/status-only (task created/working/completed) and does not carry incremental content. Open gap: if the call materializes as a task and the originating request's stream subsequently closes (client disconnects, or the server responds with a task handle immediately), there is no live channel left for partial-result notifications to ride on; see Open Questions.
- **Progress notifications:** unchanged; progress = status telemetry, partial results = result data. Servers may emit both.
- **Multi Round-Trip Requests (SEP-2322):** MRTR replaced _server-initiated requests_ (elicitation, sampling, roots/list) with `inputRequests` returned in a result and `inputResponses` supplied on the client's next request, specifically because a server-initiated request expects a future reply, which forces the server (or a shared store behind a load balancer) to hold state until that reply arrives. This SEP's notification is one-way: nothing replies to it, so there is nothing to correlate later and no state to hold beyond the lifetime of the still-open request stream it rides on. Progress notifications already establish that this class of message survives statelessness intact; partial results follow the identical shape and inherit the same exemption. The only place the exemption runs out is exactly the task-mode gap above, where the request stream itself goes away.
- **MCP Apps (ext-apps):** hosts supporting this SEP SHOULD forward chunks to the app view as a new `ui/notifications/tool-output-partial` message, symmetric with the existing `ui/notifications/tool-input-partial`. (Companion change to the Apps extension spec; no tracking issue exists yet on ext-apps, filing one referencing this SEP is part of the follow-up work.)
- **Transports:** stdio delivers notifications natively; Streamable HTTP delivers them as SSE events on the request's stream; no transport changes required.

## Rationale

1. **Separate notification, not an overloaded `notifications/progress` (attempted in #383, revisited in SEP-2632)**: conflating status with result data would mean progress consumers (which render `message` strings) start receiving result payloads they don't expect; progress also lacks ordering (`seq`) and typed result content. Keeping the two orthogonal (progress = telemetry, partial results = data) lets a call emit both without either interfering with the other.
2. **A notification+token, not multiple JSON-RPC responses per id (rejected in #776)**: #776 tried reusing the request `id` across multiple responses and was correctly challenged, since JSON-RPC 2.0 specifies exactly one response per request, and that assumption is load-bearing across every existing client/SDK. A notification keyed by its own token (mirroring `progressToken`) avoids the violation entirely; this is the direction a maintainer (Mike Kistler) already pointed to on that thread before it went dormant.
3. **Transport-layer chunking (multipart / raw SSE data chunks)**: fragments behavior across transports; stdio has no raw-chunk equivalent, so a transport-only fix would be Streamable-HTTP-specific and leave stdio servers unable to stream at all. A data-layer primitive (a JSON-RPC notification) works identically on both transports.
4. **Polling tools / resource subscriptions (attempted in #651)**: today's workaround; N× request overhead, awkward tool-schema pollution, no standardization across servers. #651's resource-based variant genuinely does enable incremental delivery: `ResourceUpdated` notifications signal each new chunk, but the notification itself carries no payload, and the client must issue a separate `resources/read` per update to fetch the actual content. That's a round trip per chunk versus this SEP's single push notification per chunk, and it overloads a subscription primitive designed for "this resource changed," not "here is the next piece of a specific tool call's output."

## Backward Compatibility

Fully additive. Servers gate on the client capability; clients that don't declare it see today's behavior unchanged. The mandatory-complete final result guarantees correctness even if every partial is dropped.

## Security Implications

- **No new trust boundary crossed:** partial-result content is subject to the same server-to-client trust model as the final `CallToolResult`. A malicious/compromised server could already return arbitrary content in the final result, so streaming it incrementally doesn't grant new capability, only new timing.
- **Resource exhaustion / chatty servers:** an unbounded or malicious server could flood a client with notifications. Hosts SHOULD apply the same rate-limiting/backpressure they already apply to `notifications/progress`, and MAY coalesce or drop excess chunks (delivery is explicitly best-effort).
- **MCP Apps forwarding:** if a host forwards `application/a2ui+json` (or other renderable) partial content directly into an iframe via `ui/notifications/tool-output-partial`, the same sandboxing, sanitization, and origin checks that already apply to `ui/notifications/tool-result` MUST apply per-chunk. A partial chunk is not a lower-trust payload than the final result, and implementations must not skip validation on the assumption that "it's just a partial."
- **Token collision/spoofing:** `partialResultToken` MUST be treated like `progressToken`: server-scoped to the originating request; clients MUST ignore partial-result notifications carrying a token they did not issue for an in-flight call.

## Reference Implementation

Not yet started. Planned:

- Schema: add `partialResults?: {}` to `ClientCapabilities`, and `PartialToolResultNotification`/`PartialToolResultNotificationParams` to `schema/draft/schema.ts` + examples.
- TypeScript SDK: server-side `ctx.emitPartial(...)` helper; client-side `onpartialresult` handler.
- ext-apps follow-up PR: `ui/notifications/tool-output-partial` + AppBridge forwarding.
- Demo: A2UI-in-MCP-Apps renderer consuming chunks as its JSONL stream (per the a2ui.org guide), proving progressive generative UI end-to-end.
- Per SEP-2484, reaching `Final` (not just `Accepted`) will require a conformance scenario in the conformance repository plus a traceability file mapping this SEP's MUST/MUST NOT statements to checks; not required to open the PR, but scoped in early since it's a hard gate now.

## Open Questions

1. Should `seq` gaps be an error or silently tolerated? (Proposed: tolerated; final result is authoritative.)
2. Rate limiting / backpressure guidance for chatty servers (e.g., host MAY coalesce chunks).
3. Should partial `content` be defined as _append-only fragments of the final `content` array_ (strict), or free-form incremental data (loose, proposed here)?
4. Whether the model (not just the UI) should be able to observe partials: host policy vs. protocol requirement.
5. Naming: `partial_result` vs. `tool_output_chunk`; token reuse vs. keying on request `id`.
6. **Task-mode gap:** if a `tools/call` materializes as a task (SEP-2663) and its originating request stream closes before the tool finishes, there is no open channel left to deliver `notifications/tools/partial_result` on. Options: (a) accumulate partials server-side and surface them via `tasks/get`/`notifications/tasks` once the client resumes observing, but `Task`'s shape isn't currently defined to carry an ordered partial-content log; (b) scope this SEP to non-task calls only and treat task-mode streaming as follow-up work; (c) require task creation to happen before any partials are sent, so partials are only ever in a small window. Not resolved here (flagging for the sponsor/reviewer).
7. This SEP negotiates via a plain `ClientCapabilities` field and stays Standards Track (see Specification §1), while Tasks and MCP Apps/UI both live in Extensions Track. If review pushes toward Extensions Track for consistency with that precedent, the author is open to it; the core mechanics (notification shape, `seq`, token) don't depend on which track it lands in.
