# SEP-3313: Structured Tool-Failure Classification (`ToolFailure`)

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-08-27
- **Author(s)**: John Zaguirre (@johnyzaguirre-glean)
- **Sponsor**: None (seeking sponsor)
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3313

## Abstract

This SEP proposes a small, additive extension to `CallToolResult` that lets
servers attach structured, machine-readable classification to a tool
execution failure. Today, a failing tool call communicates only
`isError: true` plus free-text `content`; clients, agents, and human
operators must all parse prose to decide how to react or how to
troubleshoot. This SEP adds an optional `io.modelcontextprotocol/toolFailure`
`_meta` key carrying a broad behavioral `class`
(`capability` / `reliability` / `governance`), an extensible `code`, retry
hints, a mandatory operator `correlationId`, and a short `agentGuidance`
string aimed at the calling model. The extension is fully additive: servers
and clients that ignore it see no change in behavior.

## Coordination status

This SEP remains Draft pending Core Primitives Working Group discussion.
The prototype is preserved in the author's
[fork](https://github.com/johnyzaguirre-glean/modelcontextprotocol/tree/draft/tool-failure-classification).
The authorization cases need alignment with
[SEP-2643](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2643)
through the Auth IG. Classification, correlation, and retry semantics also
need alignment with the
[shared error-policy draft](https://github.com/YoadElkayam/mcp-fuse/blob/main/sep/SEP-error-policy.md),
which incorporates contributions from discussion #2930 and credits this
proposal's author. The choices below remain proposals for group review.

## Motivation

[Discussion #2930](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/2930)
observed that MCP tool failures fall into a small number of recurring
shapes — missing auth, permission denial, unsupported capability, transient
failure, policy refusal, and "user must act" — but the spec gives servers
no structured way to say which shape a given failure is. In practice this
means:

- **Clients and agents can't reliably branch on failure type.** An agent
  seeing `isError: true` with a text message has to pattern-match prose to
  decide whether to retry, ask the user to log in, or give up. This is
  fragile across servers and languages.
- **Retry logic is unsafe by default.** Without a `retryable` signal tied
  to the tool's declared `idempotentHint`, clients either never auto-retry
  (leaving transient failures to the user) or retry unsafely.
- **Operators can't correlate a user's bug report with server logs.**
  Enterprise operators debugging a failed tool call have no standard field
  to match what the user saw against what the server logged, so triage is
  slow and manual.
- **Diagnostic detail and model-facing guidance are conflated.** Verbose
  diagnostic text wastes context when all the model needs is a short
  instruction ("ask the user to reconnect their account").

This SEP builds on three ideas raised in the discussion:

1. Split a broad **behavioral class** from a granular **code**, so clients
   can dispatch on class while servers keep the freedom to define new codes
   (@HarperZ9).
2. Provide an operator **correlation ID** for reliable cross-referencing
   (this proposal's author and @YoadElkayam). This draft proposes mandatory
   presence within `ToolFailure`; the shared draft uses SHOULD for server
   generation. The requirement strength remains open for alignment.
3. Keep a short, separate **agent-facing guidance** string apart from
   verbose diagnostics, to avoid wasting model context (@YoadElkayam,
   mcp-fuse).

## Specification

### Placement for tool execution failures

Per the existing specification (`schema/draft/schema.ts`, see the
`isError` doc comment on `CallToolResult`), errors that originate from the
tool itself SHOULD be reported inside the result object with `isError: true`
so the calling model can see actionable feedback and self-correct. This
SEP follows that guidance by extending `CallToolResult` without allocating
a new JSON-RPC error code. Protocol-level failures, such as an unknown
tool, retain their existing error response. A shared classification
vocabulary could also be carried in `Error.data` for those failures;
vocabulary reuse and response placement are separate design questions.

### Extension point: `_meta`

The classification is carried under the existing, general-purpose `_meta`
extension mechanism, using the same namespaced-key pattern already used for
`io.modelcontextprotocol/subscriptionId`
(`SubscriptionsListenResultMetaObject`). This keeps the change additive: no
new required field appears on `CallToolResult` itself.

```ts
/**
 * Broad behavioral class of a tool failure, controlling how a client should
 * react independent of the specific ToolFailure.code:
 *
 * - `capability`: the operation itself cannot succeed as requested (e.g. an
 *   unsupported feature). Stop and surface to the user
 *   or agent for a different approach — retrying as-is will not help.
 * - `reliability`: a transient condition. Retry eligibility depends on
 *   the client behavior rules, including `retryable`, `retryNotBefore`,
 *   and the tool's declared `idempotentHint`.
 * - `governance`: refused by policy (auth, approval, audit). Requires
 *   out-of-band action (e.g. a human approval), not a retry.
 */
export type ToolFailureClass = "capability" | "reliability" | "governance";

export interface ToolFailure {
  /** The broad behavioral class of this failure. */
  class: ToolFailureClass;

  /**
   * A specific, machine-readable failure code (e.g. "auth_required").
   * An open string, not a closed enum, so servers can define new codes
   * without a spec change. A baseline vocabulary is RECOMMENDED
   * (see below).
   */
  code: string;

  /**
   * Whether a client MAY retry this exact call. Only meaningful for
   * class: "reliability"; MUST be absent or false otherwise.
   *
   * Auto-retry eligibility also depends on the tool's declared
   * `idempotentHint` — a client MUST NOT auto-retry a non-idempotent tool
   * even when `retryable` is true.
   */
  retryable?: boolean;

  /**
   * Earliest time (Unix epoch milliseconds) at which a retry is likely to
   * succeed. A "not before" hint, not a guarantee. Only meaningful when
   * `retryable` is true.
   */
  retryNotBefore?: number;

  /**
   * A server-generated identifier correlating this failure with the
   * server's own logs, for operator troubleshooting. REQUIRED so operators
   * can reliably match a user-reported failure to server-side diagnostics;
   * intermediaries relaying this result MUST preserve it unchanged.
   */
  correlationId: string;

  /**
   * A short instruction for the calling model describing how to proceed
   * (e.g. "ask the user to re-authenticate"), kept separate from verbose
   * diagnostic detail in `content` so it doesn't waste context.
   */
  agentGuidance?: string;
}

export interface CallToolErrorMetaObject extends ResultMetaObject {
  /**
   * Structured classification of the failure. Present only on error
   * results (isError: true) from servers that implement this extension.
   */
  "io.modelcontextprotocol/toolFailure"?: ToolFailure;
}
```

`CallToolResult._meta` is typed as `CallToolErrorMetaObject` (widening its
inherited `ResultMetaObject` type).

### Baseline code vocabulary

`code` is intentionally open, but the following baseline values are
RECOMMENDED so common cases interoperate out of the box, grouped by
`class`:

| `class`       | `code`                                                                         |
| ------------- | ------------------------------------------------------------------------------ |
| `capability`  | `capability_unsupported`, `resource_not_found`, `invalid_input`                |
| `reliability` | `retryable_transient_error`                                                    |
| `governance`  | `auth_required`, `permission_denied`, `policy_blocked`, `user_action_required` |

Servers MAY define additional codes consistent with one of the three
classes. Clients MUST dispatch primary behavior on `class` and treat `code`
as informational/logging detail when they don't recognize it.

### Client behavior

- A client that does not understand this extension MUST continue to behave
  exactly as it does today (treat the result as an opaque error via
  `isError` and `content`).
- A client that understands the extension SHOULD branch primarily on
  `class`:
  - `capability` / `governance`: MUST NOT auto-retry the call.
  - `reliability`: MAY auto-retry, but only when `retryable` is `true` AND
    the tool's `idempotentHint` permits it, and MUST NOT retry before
    `retryNotBefore` if present.
- Any intermediary (proxy, gateway) relaying a `CallToolResult` MUST
  preserve `_meta["io.modelcontextprotocol/toolFailure"]` unchanged,
  including `correlationId`.

## Rationale

**Why `_meta` instead of a new top-level field on `CallToolResult`?**
A new required or optional top-level field is a larger surface to reason
about for every existing `CallToolResult` consumer. `_meta` is the
specification's existing, designed-for-this extension point, and there is
precedent for exactly this shape of addition
(`SubscriptionsListenResultMetaObject`). Piggybacking on it keeps this SEP
fully additive and low-risk to adopt incrementally.

**Why a `class` enum plus an open `code` string, rather than one closed
enum?** An early proposal in the discussion used a single closed set of
codes. @HarperZ9 pointed out that the proposed codes actually require
different client _behavior_ (stop-and-prompt vs. retry vs.
refuse-pending-approval), and that behavior dispatch should not depend on
recognizing every possible code a server might emit. Splitting a small,
closed `class` (behavior contract) from an open `code` (specific diagnosis)
lets clients written today handle servers' future codes correctly by
falling back to `class`.

**Why is `correlationId` mandatory, not optional?** The primary
enterprise/operator pain point raised in the discussion was the inability
to match a user's report of "the tool failed" to the corresponding server
log line. An optional field is inconsistently implemented; making it
required within the `ToolFailure` object (which itself remains optional)
guarantees that any server adopting this extension gets the operator
benefit, without forcing adoption on servers that don't implement the
extension at all.

**Alternatives considered:**

- _Carry classification in the JSON-RPC `Error.data` field._ The existing
  specification recommends `CallToolResult.isError` for tool execution
  failures, which is this draft's initial scope. Reusing the vocabulary in
  `Error.data` for legitimate protocol errors remains an alignment question.
- _A single closed enum of failure codes._ Rejected per the `class`/`code`
  rationale above — a closed enum would need a spec revision every time a
  new failure shape emerged.
- _Bundling retry/idempotency "contract" fields (caller keys, dedup
  behavior, tri-state `idempotentHint`) into this proposal._ Out of scope.
  The [shared error-policy draft](https://github.com/YoadElkayam/mcp-fuse/blob/main/sep/SEP-error-policy.md)
  develops these semantics from discussion #3188. This SEP's current
  idempotency gate needs alignment with that work, including read-only
  tools, trust in annotations, and ambiguous execution outcomes.

## Backward Compatibility

Fully backward compatible. `io.modelcontextprotocol/toolFailure` is an
optional key on an already-optional, already-extensible `_meta` object.
Existing servers that never set it are unaffected. Existing clients that
don't read it see no change: they continue to interpret `isError` and
`content` exactly as before. There are no changes to required fields, no
removed fields, and no new JSON-RPC error codes.

## Security Implications

- `correlationId` is intended to be an opaque, server-generated identifier
  for log correlation. Servers MUST NOT encode sensitive information
  (session tokens, user identifiers, request payloads) in it — it should be
  treated like a trace/request ID.
- `agentGuidance` is a short instruction string sent to the calling model.
  As with any server-controlled text reaching the model, clients SHOULD
  treat it as data, not as a command to the client itself, consistent with
  existing guidance on treating tool output as untrusted content.
- This extension introduces no new authentication, authorization, or data
  validation surface; it only classifies failures that already occur under
  the existing protocol.

## Reference Implementation

A working prototype schema change (types, doc comments, and a passing
example) was submitted in
[PR #3312](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3312)
and remains available in the
[prototype branch](https://github.com/johnyzaguirre-glean/modelcontextprotocol/tree/draft/tool-failure-classification),
which adds `ToolFailureClass`, `ToolFailure`, and `CallToolErrorMetaObject`
to `schema/draft/schema.ts`, wires `_meta?: CallToolErrorMetaObject` onto
`CallToolResult`, and includes
`schema/draft/examples/ToolFailure/policy-blocked.json`. The original
prototype reported passing `npm run check:schema:ts` (tsc/eslint/prettier)
and `npm run check:schema` (259/259 example validations, including the new
example). Those checks validate schema shape; client behavior remains to
be demonstrated.

A client-side reference implementation demonstrating retry dispatch on
`class` (a small proxy or SDK patch) is not yet linked; this is required
before the SEP can move past `Draft`/`In-Review`, per the
[prototype requirements](https://modelcontextprotocol.io/community/sep-guidelines#prototype-requirements).

## Open Questions

- How should auth and permission failures map to classes? This draft groups
  them under `governance`; the shared draft uses `capability` and reserves
  `governance` for policy refusal. Authorization remediation should align
  with SEP-2643, including precedence if both metadata objects appear.
- Should operator `correlationId` be required or recommended? How should it
  relate to SEP-2643's `authorizationContextId`, which is echoed on retry?
  Debug correlation, authorization correlation, and continuation state
  have distinct roles.
- Can the vocabulary be reused across tool results and legitimate
  protocol errors without changing the existing response boundaries?
- How should retry eligibility account for `readOnlyHint`, `idempotentHint`,
  and trust in server annotations? A timing hint alone does not establish
  replay safety. Ambiguous outcomes and failed reconciliation must retain
  their uncertainty.
- Should retry timing use this draft's absolute `retryNotBefore` or the
  shared draft's relative `retry.afterMs`?
- How should clients expose `agentGuidance` to the model while retaining
  diagnostics for operators? Placement in `_meta` alone does not define
  model visibility or replace the existing tool-result content fallback.
- Should `retryNotBefore` also be exposable via an HTTP response header for
  transports where inspecting `_meta` before the body is fully parsed would
  help proxies/gateways? Raised informally by @YoadElkayam in the related
  discussion; not addressed here to keep this SEP scoped to the result
  schema.
- Should there be a companion, non-normative documentation page (guide) in
  `docs/` listing the baseline code vocabulary and example client dispatch
  logic, independent of whether/when this SEP is accepted? The original
  discussion raised "documentation-first before a formal SEP" as an option;
  this SEP and such a guide are not mutually exclusive.

## Review scenarios

These non-normative scenarios define the next client/server validation
work. Both SEPs and the shared error-policy draft remain proposals.

| Scenario                                                            | Response under discussion                                                                                                                                                                                                                               | Expected client action                                                                                                                                                        | Operator correlation                                                                                                                                       |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A credential lacks authorization for a tool call.                   | SEP-2643 uses `CallToolResult` with `isError: true` and authorization metadata containing `reason: "insufficient_authorization"`, `remediation: "available"`, and an `authorization_remediation` hint. An HTTP challenge is authoritative when present. | Obtain the required authorization through the applicable flow before retrying. Echo `authorizationContextId` if supplied.                                                     | Relate the denial and retry through the authorization handle. Decide whether a separate log-correlation ID is needed and how the user receives it.         |
| Policy permanently disallows an operation.                          | For an authorization denial, SEP-2643 uses `CallToolResult` with `isError: true`, `remediation: "unavailable"`, and no remediation hints. This prototype would describe the case as `governance` / `policy_blocked`; their coexistence is unresolved.   | Stop and show the denial. Avoid unchanged retries or reauthorization for a terminal denial. Preserve an operator-visible reference.                                           | Match the reported denial to the server's policy-decision log without exposing sensitive policy details.                                                   |
| A trusted, idempotent tool encounters a transient upstream failure. | This prototype uses `CallToolResult` with `isError: true` and `toolFailure` metadata containing `class: "reliability"`, `code: "retryable_transient_error"`, `retryable: true`, `retryNotBefore`, and `correlationId`.                                  | Apply the replay-safety gate and the retry bound. A side-effecting call with an uncertain outcome needs separate handling; the failure class alone does not establish safety. | Preserve the failure's correlation ID through the client and match it to server logs. Keep operation identity and per-attempt diagnostics distinguishable. |

Validation should exercise the response, the client's action, and the
user-visible support reference for each case. It should also confirm that
clients ignoring the metadata retain the existing `isError` and `content`
fallback. A runnable client/server demonstration is still pending.

## Acknowledgments

Thanks to @Mohataseem89, @HarperZ9, and @YoadElkayam for the ideas
developed in discussion #2930. Thanks also to @aurumflux20 for the shared
retry-safety work and to @nbarbettini and @monmohan for connecting the
authorization-denial work.
