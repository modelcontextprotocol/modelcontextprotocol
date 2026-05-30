# SEP-DRAFT: Client-Generated Session Identifiers (`Mcp-Client-Session-Id`)

- **Status:** Draft
- **Type:** Standards Track
- **Created:** 2026-05-30
- **Author(s):** @javapro108
- **Sponsor:** None
- **PR:** 2822

---

## Abstract

The `2026-07-28` RC removes the protocol-level session and the `Mcp-Session-Id`
header. That's the right call. But it leaves one gap: there's no standard way for a
client to say "these requests belong together."

This proposal adds `Mcp-Client-Session-Id`. The client generates a UUID v4 before
its first request and sends it on every subsequent one — as an HTTP header on
Streamable HTTP transports, or in `params._meta` for stdio and other transports. The
server can use it however it likes: log correlation, application-level state key,
or just ignore it.

Nothing in the `2026-07-28` RC is touched. This adds one identifier, follows the
`_meta` convention from SEP-414, and requires no changes to the JSON-RPC envelope,
capability negotiation, or OAuth flows.

**Note:** Mcp-Client-Session-Id is just used to explain concept, however any other meaningful name/terminology can be adopted.

---

## Motivation

The `2026-07-28` RC makes MCP stateless at the protocol layer — no
`initialize`/`initialized` handshake (SEP-2575), no `Mcp-Session-Id` (SEP-2567),
W3C Trace Context in `_meta` (SEP-414). A tool call becomes a single self-contained
HTTP request that any server instance can handle. No sticky sessions, no shared
session store.

The problem is that removing the session also removes the only standard way clients
had to group related requests. A few cases where this hurts:

- An agent runs a multi-step workflow. Something fails. You want to pull all requests
  for that workflow from the logs. Without a client-supplied identifier, you can't.
- A stateful server wants to scope application state to a logical client session, but
  now has to generate its own opaque key and do a round-trip to issue it — even
  though the client already knows what it wants the session to be.
- A client spans both HTTP and stdio within one logical session. There's no
  transport-agnostic way to tie those requests together.

None of this requires bringing back protocol-level state. It just requires the client
to be able to carry a stable identifier it already has.

### A stable client ID also enables server-side personalisation

The three cases above are about correlation. But a stable, client-owned identifier
opens up a different category of capability: servers can use it to decide _what_ to
expose, not just how to label requests in logs.

Today, a server responds to `tools/list`, `resources/list`, and `prompts/list` the
same way for every client. The result gets stuffed into the model's context window
regardless of whether most of it is relevant to the current task. As tool catalogs
grow — and they are growing fast — this becomes a real problem. A client doing
document summarisation doesn't need the same tool surface as one running a CI
pipeline, but without any client identity there's no clean way for the server to tell
them apart.

With `Mcp-Client-Session-Id`, servers can build filtering and scoping logic on top
of a key they can actually reason about:

- **Capability scoping.** Return only the tools, resources, or prompts registered for
  a given client session. An orchestrator that pre-registers its intended workflow
  gets back a focused list; a generic client gets the full catalog.
- **Dynamic tool surfaces.** A server can expand or contract the available tool set
  mid-session — after an auth step, after the client signals its task type, or based
  on usage patterns observed across prior requests carrying the same ID.
- **Context budget management.** Servers aware of context window constraints can
  prioritise what they return for a known client, keeping the total token cost of
  `tools/list` + `resources/list` + `prompts/list` within a budget rather than
  dumping everything unconditionally.
- **Per-client resource namespacing.** `resources/list` can return only the resources
  scoped to this client's session, avoiding cross-session noise in multi-tenant
  deployments.

None of this is specified here — these are application-level patterns that servers
can build once they have a reliable client identifier. The point is that
`Mcp-Client-Session-Id` is the missing primitive that makes them possible without
any further protocol changes.

**Why client-generated?** The client owns the context — conversation history, agent
state, tool call lineage, and increasingly the decision about which tool surface it
actually needs. The RC makes this explicit with the explicit-handle pattern: the
model carries identifiers as ordinary arguments rather than hiding them in transport
state. A client-generated session ID fits that model naturally — the client knows
what session it's in before it makes its first request, so it shouldn't need the
server to tell it. It also kills the last bootstrapping round-trip: in a fully
stateless protocol there's no good place for an exchange whose only purpose is to
hand the client an ID it could have generated itself.

---

## Specification

### Identifier

The client SHOULD generate an `Mcp-Client-Session-Id` before sending its first
request — a UUID v4 (RFC 9562) in lower-case canonical form:

```
xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
```

The value MUST stay constant for the lifetime of the logical session. New session,
new ID. Servers MUST NOT reject a request solely because it carries this header.

### Carrier 1 — HTTP Header (Streamable HTTP)

```http
POST /mcp HTTP/1.1
MCP-Protocol-Version: 2026-07-28
Mcp-Method: tools/list
Content-Type: application/json
Authorization: Bearer <token>
Mcp-Client-Session-Id: 550e8400-e29b-41d4-a716-446655440000
```

The header MUST be sent on every request in the session — including listing requests
(`tools/list`, `resources/list`, `prompts/list`) and all other standard methods, not
just invocation requests. Servers MAY echo it in the response for debugging; that's
optional and carries no protocol weight.

### Carrier 2 — `_meta` Field (All Transports, Including stdio)

The same value goes in `params._meta` on every JSON-RPC request and notification,
following the same pattern SEP-414 uses for W3C Trace Context. This applies to all
standard MCP methods — listing, invocation, and subscription alike:

| Category      | Methods                                                                                                                                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tools         | `tools/list`, `tools/call`                                                                                                                                                                                |
| Resources     | `resources/list`, `resources/read`, `resources/subscribe`, `resources/unsubscribe`                                                                                                                        |
| Prompts       | `prompts/list`, `prompts/get`                                                                                                                                                                             |
| Roots         | `roots/list`                                                                                                                                                                                              |
| Sampling      | `sampling/createMessage`                                                                                                                                                                                  |
| Notifications | `notifications/cancelled`, `notifications/progress`, `notifications/roots/list_changed`, `notifications/tools/list_changed`, `notifications/resources/list_changed`, `notifications/prompts/list_changed` |

A `tools/list` request looks like this:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {
    "_meta": {
      "clientSessionId": "550e8400-e29b-41d4-a716-446655440000"
    }
  }
}
```

And a `tools/call`:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "_meta": {
      "clientSessionId": "550e8400-e29b-41d4-a716-446655440000"
    },
    "name": "search",
    "arguments": { "q": "otters" }
  }
}
```

Both carry the same `clientSessionId` — the identifier is stable across the entire
session regardless of which method is being called. `clientSessionId` has no reserved
MCP prefix and is valid under the `_meta` key naming rules in the base spec.

### Using Both Carriers Together

On HTTP transports, clients SHOULD send both. The values MUST be identical. If they
differ, the server SHOULD log a warning and MAY use either; it MUST NOT reject the
request on that basis alone.

A complete `2026-07-28`-style request:

```http
POST /mcp HTTP/1.1
MCP-Protocol-Version: 2026-07-28
Mcp-Method: tools/call
Mcp-Name: search
Content-Type: application/json
Authorization: Bearer <token>
Mcp-Client-Session-Id: 550e8400-e29b-41d4-a716-446655440000

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "_meta": {
      "clientSessionId": "550e8400-e29b-41d4-a716-446655440000",
      "traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
    },
    "name": "search",
    "arguments": { "q": "otters" }
  }
}
```

`clientSessionId` and `traceparent` coexist in `_meta` without conflict. The trace
ID changes per request; the client session ID doesn't.

### Server Behaviour

Servers can do whatever makes sense for their architecture:

- **Stateless:** treat it as a correlation handle for logs and traces, nothing
  stored. Works fine behind a round-robin load balancer.
- **Stateful:** use it as an application-level state key directly — no round-trip
  needed because the client already provided the key.

```go
func extractClientSessionID(r *http.Request, params map[string]any) string {
    // Header form — HTTP transports
    if id := r.Header.Get("Mcp-Client-Session-Id"); id != "" {
        return id
    }
    // _meta form — all transports including stdio
    if meta, ok := params["_meta"].(map[string]any); ok {
        if id, ok := meta["clientSessionId"].(string); ok {
            return id
        }
    }
    return "" // not supplied — server may generate its own correlation ID
}

func mcpHandler(w http.ResponseWriter, r *http.Request) {
    var body struct {
        Params map[string]any `json:"params"`
    }
    json.NewDecoder(r.Body).Decode(&body)

    clientSessionID := extractClientSessionID(r, body.Params)

    // Stateless path: attach to trace context, no storage required
    ctx := trace.WithField(r.Context(), "clientSessionId", clientSessionID)

    // Stateful path: use as application-level state key
    // state := sessionStore.GetOrCreate(clientSessionID)

    handleMCPRequest(ctx, w, r)
}
```

### Client Reference Implementation

```javascript
// Generated once, before the first request
const clientSessionId = crypto.randomUUID();

async function mcpRequest(method, params = {}) {
  const body = {
    jsonrpc: "2.0",
    id: crypto.randomUUID(),
    method,
    params: {
      ...params,
      _meta: {
        ...(params._meta ?? {}),
        clientSessionId, // constant across all requests
      },
    },
  };

  return fetch("/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "MCP-Protocol-Version": "2026-07-28",
      Authorization: `Bearer ${bearerToken}`,
      "Mcp-Client-Session-Id": clientSessionId,
    },
    body: JSON.stringify(body),
  }).then((r) => r.json());
}
```

`crypto.randomUUID()` is available in all modern browsers and Node.js ≥ 14.17, no
extra dependencies.

---

## Rationale

**Why not reuse `Mcp-Session-Id`?** That header is removed in `2026-07-28`
(SEP-2567). Reusing the name would be confusing when reading code that could be
running against either spec version, and it would re-introduce the implication that
the server owns the session. `Mcp-Client-Session-Id` makes ownership obvious.

**Why `_meta` and not a new top-level field?** `_meta` is already where
cross-cutting protocol metadata lives — SEP-414 put trace context there for exactly
this reason. Keeping session correlation there too means one consistent place to look
on all transports, with no JSON-RPC envelope changes.

**Prior art.** Client-generated correlation IDs are not a new idea:

| System        | Identifier              | Generated by       |
| ------------- | ----------------------- | ------------------ |
| OpenTelemetry | `traceparent` (W3C)     | Originating client |
| AWS X-Ray     | `X-Amzn-Trace-Id`       | Client or gateway  |
| W3C Baggage   | `baggage`               | Client             |
| Stripe        | `Idempotency-Key`       | Client             |
| This proposal | `Mcp-Client-Session-Id` | Client             |

**Security.** This is a correlation handle, not a capability. It grants no
authorization — that's still the OAuth 2.1 bearer token's job. A client sending
someone else's session ID gains nothing: there's no server-side session to hijack in
the stateless case, and stateful servers should be scoping access via the bearer
token anyway. UUID v4 collision odds (~10⁻³⁷ per pair) aren't worth worrying about.

---

## Compatibility with `2026-07-28`

| `2026-07-28` change                           | How this proposal relates                                                |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| SEP-2567 removes `Mcp-Session-Id`             | Introduces a client-owned replacement that needs no server round-trip    |
| SEP-2575 removes the handshake                | Client generates the ID before the first request; no handshake needed    |
| SEP-414 formalises `_meta` for trace context  | Uses the same `_meta` convention for session correlation                 |
| Stateless protocol core                       | Header and `_meta` carriers work on any instance behind a round-robin LB |
| Explicit-handle pattern for application state | Client-owned ID is visible to the model and composable across tool calls |

Servers not yet on `2026-07-28` ignore the new header and `_meta` key. No flag day,
no migration.

---

## Open Questions

1. **`_meta` namespace.** Should `clientSessionId` get a `modelcontextprotocol.io/`
   prefix (e.g. `io.modelcontextprotocol/clientSessionId`) to match how the RC
   namespaces other reserved keys? Prevents third-party key collisions but requires a
   schema update.

2. **Reconnection behaviour.** If a client reconnects with a previously used
   `Mcp-Client-Session-Id`, what should servers guarantee about restoring prior
   state, if anything? Left to implementers for now; a follow-on SEP could
   standardise it.

3. **Mismatch error code.** Should a header/`_meta` value mismatch produce a defined
   error code rather than a SHOULD-level warning? Would make the failure mode easier
   to detect and handle consistently across implementations.
