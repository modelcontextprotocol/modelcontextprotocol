# SEP-0000: Standardize Implementation-Specific JSON-RPC Error Codes

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-05-04
- **Author(s)**: matthew.khouzam@ericsson.com (@matthewkhouzam)
- **Sponsor**: Ericsson (Ericsson)
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/0000

## Abstract

This SEP standardizes three implementation-specific JSON-RPC error codes in
the MCP schema, `-32000` (Server Error), `-32001` (Not Found), and `-32002`
(Resource Not Found), and documents the canonical mapping between common
runtime exceptions (e.g. `FileNotFoundError`, `PermissionError`,
`TimeoutError`) and the error codes that servers should return. The change
adds three new constants and `*Error` interfaces to the draft schema
(`schema/draft/schema.ts`) alongside the existing standard JSON-RPC error
codes and the previously-defined `-32042` `URL_ELICITATION_REQUIRED`. The
existing standard codes (`-32602` Invalid Params, `-32603` Internal Error)
are unchanged; this SEP only clarifies when implementations SHOULD use them.

## Motivation

MCP currently defines only the five standard JSON-RPC error codes plus a
single implementation-specific code (`-32042` `URL_ELICITATION_REQUIRED`,
marked `@internal`). Server implementations in the wild frequently need to
signal conditions that are not naturally expressed by the standard codes:

- A requested resource URI does not exist.
- A requested entity (prompt, tool, task, etc.) does not exist on a non-
  resource method.
- A server-side operation failed due to permissions, timeouts, or rate
  limiting, none of which are accurately described as "internal errors."

Without guidance, SDKs and servers each invent their own mappings. Clients
cannot reliably distinguish "the resource you asked for does not exist" from
"the server had an unexpected bug", which is important for retry, UI, and
telemetry decisions. This SEP reserves three codes in the JSON-RPC
implementation-defined range `[-32000, -32099]` and provides an explicit
exception → code mapping that SDK authors can implement consistently.

The FastMCP project already returns these error codes, and with the middleware
pattern, this is a step to security fast failing being baked into the
protocol rather than implementation specific.

## Specification

### Error Code Table

| Code     | Name               | Meaning                                   | Triggered by                                                                  |
| -------- | ------------------ | ----------------------------------------- | ----------------------------------------------------------------------------- |
| `-32002` | Resource Not Found | Requested resource does not exist         | `FileNotFoundError`, `KeyError`, `NotFoundError` on `resources/*` methods     |
| `-32001` | Not Found          | Requested entity not found (non-resource) | `FileNotFoundError`, `KeyError`, `NotFoundError` on non-`resources/*` methods |
| `-32000` | Server Error       | Server-side failure                       | `PermissionError`, `TimeoutError`, or rate limit exceeded                     |

This also aligns with the FastMCP mapping

### Schema Additions

Three new constants and three new interfaces are added to
`schema/draft/schema.ts` in the implementation-specific range
`[-32000, -32099]`:

```ts
// Implementation-specific JSON-RPC error codes [-32000, -32099]
export const SERVER_ERROR = -32000;
export const NOT_FOUND = -32001;
export const RESOURCE_NOT_FOUND = -32002;

export interface ServerError extends Error {
  code: typeof SERVER_ERROR;
}

export interface NotFoundError extends Error {
  code: typeof NOT_FOUND;
}

export interface ResourceNotFoundError extends Error {
  code: typeof RESOURCE_NOT_FOUND;
}
```

The previously-defined `URL_ELICITATION_REQUIRED = -32042` remains unchanged.
The generated `schema/draft/schema.json` is regenerated from the TypeScript
source via `npm run generate:schema`.

### Behavioral Requirements

Implementations that return errors SHOULD follow the mapping above:

1. **`-32000` Server Error** SHOULD be used when the server cannot complete
   a request due to operational conditions such as:
   - The caller lacks permission to perform the operation.
   - An upstream operation timed out.
   - A rate limit has been exceeded.

   Servers MAY include a human-readable `error.message` and structured
   `error.data` (e.g. `retryAfter` seconds for rate limiting).

2. **`-32001` Not Found** SHOULD be used when any other MCP method
   references a named entity that does not exist on the server (for example,
   an unknown task ID on `tasks/*`). This MUST NOT be used for
   `resources/*` methods, use `-32002` instead.

3. **`-32002` Resource Not Found** SHOULD be used when a `resources/read`,
   `resources/subscribe`, or `resources/unsubscribe` request references a
   URI the server does not expose. Servers MAY include the offending URI in
   `error.data.uri`.

Clients MUST tolerate unknown error codes and MUST NOT assume the absence
of these codes means the server does not support MCP.

## Rationale

**Why `-32000`, `-32001`, `-32002`?** These codes sit at the low end of the
JSON-RPC implementation-defined range and are already used by several
popular JSON-RPC libraries (including the MCP Python SDK today) for the
same semantic purposes. Standardizing the values the ecosystem is already
converging on is less disruptive than picking new ones.

**Why an exception-level mapping?** SDK authors repeatedly have to decide
how to translate language-level exceptions into JSON-RPC error codes.
Documenting the mapping in the spec (rather than only in each SDK's docs)
prevents divergent behavior across SDKs and gives clients a reliable
contract.

**Why separate `-32001` and `-32002`?** `resources/*` is the only surface
where "not found" is addressable by a URI that the client can re-request or
subscribe to. Clients often want to special-case resource-not-found for UI
purposes (e.g. offering to refresh a list), so a distinct code avoids
string-matching on `error.message`.

**Alternatives considered:**

- _Use only `-32603` for all server-side failures._ Rejected: it collapses
  recoverable cases (rate limit, not found) with truly unexpected ones,
  which prevents clients from retrying or rendering the right UI.
- _Introduce a single `-32000` catch-all._ Rejected for the same reason,
  loses the information clients need.
- _Put these in the standard JSON-RPC range._ Not available; JSON-RPC
  reserves `[-32768, -32000]` for protocol-level codes and explicitly
  assigns `[-32000, -32099]` for server implementation use.

## Backward Compatibility

This change is **additive and backward compatible**:

- No existing constant, interface, or error code is removed or renumbered.
- `-32602` and `-32603` retain their existing meanings.
- Servers that already return `-32000`/`-32001`/`-32002` continue to work;
  this SEP ratifies existing practice.
- Servers that do not adopt the new codes can continue returning `-32603`
  , clients are required to tolerate this.

Clients written against older schemas will treat the new codes as generic
JSON-RPC errors, which is the documented default behavior for unknown
implementation-specific codes.

## Security Implications

None directly. The new error codes carry the same information currently
conveyed via `-32603` and `error.message` string inspection, so no new
information is disclosed. Implementers should continue to avoid leaking
sensitive details (file paths outside the server's resource surface, stack
traces, internal hostnames) in `error.message` or `error.data`, regardless
of which code is used.

Rate limit responses (`-32000`) SHOULD include only the information needed
for the client to back off (e.g. `retryAfter`) and SHOULD NOT expose per-
user quota state that could aid enumeration attacks.

## Reference Implementation

The schema change is implemented in this PR:

- `schema/draft/schema.ts`, adds `SERVER_ERROR`, `NOT_FOUND`,
  `RESOURCE_NOT_FOUND` constants and their corresponding `ServerError`,
  `NotFoundError`, `ResourceNotFoundError` interfaces.
- `schema/draft/schema.json`, regenerated via `npm run generate:schema`.

A full reference implementation additionally requires:

- SDK updates (TypeScript, Python, at minimum) translating the mapped
  exception classes to the new codes.
- Conformance tests asserting that servers raising `FileNotFoundError` on
  a `resources/read` surface produce `-32002`, and so on for each row of
  the table above.

These SDK changes are out of scope for this SEP's schema patch but are
required before the SEP can move to `Final`.

This also is the default behaviour of FastMCP. https://github.com/PrefectHQ/fastmcp

## Testing Plan

- **Schema**: `npm run check:schema` confirms TypeScript/JSON schema parity
  and that example files validate against their respective types.
- **SDK conformance**: SDK test suites should assert the exception → code
  mapping for each row in the table, using a minimal in-process server and
  client.
- **Client tolerance**: Clients should be tested against servers emitting
  unknown codes (e.g. `-32050`) to confirm graceful handling.

## Open Questions

1. Should `-32002` `ResourceNotFoundError` include a required
   `data.uri` field in the schema, or leave it as an optional convention?
2. Should rate-limit responses use a dedicated code (e.g. `-32003`) rather
   than overloading `-32000`, given that `Retry-After` semantics differ
   meaningfully from permission and timeout failures?
3. Should the mapping table be language-neutral (e.g. "missing entity
   error") instead of naming Python exceptions, to avoid the appearance
   that Python is privileged?
