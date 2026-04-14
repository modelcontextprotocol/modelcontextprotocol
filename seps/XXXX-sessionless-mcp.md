# SEP-XXXX: Sessionless MCP via Explicit State Handles

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-03-11
- **Author(s)**: Peter Alexander (@pja-ant)
- **Sponsor**: Peter Alexander (@pja-ant)
- **PR**: https://github.com/modelcontextprotocol/specification/pull/{NUMBER}
- **Related**: [SEP-1442](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1442) (Stateless-by-default MCP), [SEP-2322](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2322) (Multi Round-Trip Requests), [SEP-2549](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2549) (TTL for List Results)

## Abstract

This proposal removes the protocol-level session concept from MCP, replacing implicit session-scoped state with explicit, server-minted state handles that the model carries and threads through subsequent calls. [SEP-1442] makes sessions optional by defaulting to stateless operation; this proposal removes the opt-in as well.

After more than a year in the spec, sessions have not converged on a consistent meaning across clients: some scope them per tool call, some per application launch, some per page load, and almost none resume them. A server author cannot predict what scope or lifetime a session will have when their server is connected to an arbitrary client, which has made the session unreliable as a container for application state. This proposal holds that application state can be served by explicit identifiers, and that the session abstraction adds constraints (fixed cardinality, undefined lifetime, uncacheable list endpoints across session boundaries) without corresponding benefit.

Under this proposal, a server that currently scopes a shopping cart (for example) to the session instead exposes a tool `create_basket()` that returns a `basket_id` and threads that ID through subsequent tool calls, e.g. `add_item(basket_id, ...)`. The model decides what is shared and what is isolated; list endpoints become cacheable across what used to be session boundaries; and agent orchestrators can freely share or not share application state as needed. Explicit state handles are not a new protocol construct — there is no schema or wire format for them. They are a tool-design pattern; the protocol change is the removal of sessions, which leaves handles as the way to express cross-call state.

[SEP-1442]: https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1442
[SEP-2322]: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2322
[SEP-2549]: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2549

## Motivation

### What sessions scope today

The current spec is not fully precise about which behaviors are session-bound, but in practice five categories of things attach to a session's lifetime:

1. **Negotiated capabilities and protocol version.** The result of `initialize` — which protocol version is in use and which optional capabilities each side supports — is established once per session and assumed for its duration. [SEP-1442] resolves this by removing `initialize` and carrying version/capability information per-request, so this proposal treats it as already addressed.

2. **Elicitation and sampling intermediate state.** When a tool call triggers an `elicitation/create` or `sampling/createMessage` round-trip, the server has to correlate the eventual response with the original in-flight tool call — state that today lives implicitly in the session. [SEP-2322] (Multi Round-Trip Requests) resolves this by carrying the correlation state explicitly through the request/response cycle, so this proposal treats it as already addressed.

3. **Application state.** The canonical example is a shopping cart: `add_item()`, `add_item()`, `checkout()`, with the cart existing implicitly per-session. This generalizes to any stateful workflow — a Playwright browser instance, a database transaction, an open file descriptor.

4. **Mutable list endpoints.** `tools/list` (and `resources/list`, `prompts/list`) can legally return different results over a session's lifetime. For example, a server could expose an `enable_admin_tools` tool that mutates what subsequent `tools/list` calls return.

5. **Resource subscriptions.** Subscription lifetime is tied to session lifetime. ([SEP-1442] addresses this separately and it is not re-examined here.)

With (1), (2), and (5) handled by other SEPs, this proposal addresses (3) and (4).

### Problems with session scoping

The issues below apply whether sessions are mandatory (the current spec) or opt-in (the direction [SEP-1442] takes).

#### Session lifetime is undefined, and servers can't design around it

The spec does not say when a session begins or ends, because it depends on the host application. In practice, deployed clients vary widely and few scope sessions to a conversation: ChatGPT creates a fresh session for every individual tool call, and Claude.ai did the same until recently;[^per-call] most desktop and IDE clients create one at application launch and keep it for the process lifetime; web clients typically create one per page load. Almost no clients resume a prior session after a disconnect or restart, and on the server side the reference TypeScript SDK provides no public API for reconstructing a session on a different node, so multi-node deployments cannot honor resumption even when a client attempts it.[^ts-sdk-resume] A subagent might share its parent's session or get its own — there is no convention.

[^per-call]: [microsoft/playwright-mcp#1045](https://github.com/microsoft/playwright-mcp/issues/1045), Sep 2025 — server author reports both ChatGPT and Claude.ai closing the session after each tool call, dropping browser state; ["Connector tool calls generating fresh MCP session each invocation"](https://community.openai.com/t/connector-tool-calls-generating-fresh-mcp-session-each-invocation/1364975), OpenAI Developer Community, Nov 2025.
[^ts-sdk-resume]: [modelcontextprotocol/typescript-sdk#1658](https://github.com/modelcontextprotocol/typescript-sdk/issues/1658), Mar 2026 — `StreamableHTTPServerTransport` stores session state in private instance fields with no API to rehydrate from external storage.

This matters because server authors are the ones deciding what to scope to the session, and they need to know what a session corresponds to in order to do that correctly. A Playwright server that ties a browser instance to the session needs to know whether that means one user turn, one agent process, or one long-lived chat. The spec does not specify this and different hosts give different answers, so the server is designing against an abstraction whose semantics it does not control.

The practical consequence is that session-scoped application state often does not survive. Against a per-tool-call client it is destroyed before the next call; against a per-app-launch client it is shared across every conversation in the window and then lost on restart; against any client that does not resume, it is gone when the app restarts. Servers that appear to be using session state successfully are usually stdio servers relying on process lifetime, which is a property of the transport rather than the protocol.

#### List endpoints cannot be cached across sessions

Because `tools/list` may be session-dependent, a client cannot assume a result fetched in one session is valid in the next. Every new session must re-fetch, even when the server's tool set is fixed at build time and never changes, which is the common case.

The Python SDK's own design issue for client-side list caching lists "what is the cache key — per-session or per-server-URL?" as an open question,[^py-sdk-cache] and gateway implementers have shipped per-session caching specifically because they could not assume cross-session validity from the spec.[^agentgateway-cache] Every list endpoint must be treated as potentially session-scoped, so each must be re-fetched per session to be safe.

[^py-sdk-cache]: [modelcontextprotocol/python-sdk#2108](https://github.com/modelcontextprotocol/python-sdk/issues/2108), Feb 2026.
[^agentgateway-cache]: [agentgateway/agentgateway#1510](https://github.com/agentgateway/agentgateway/issues/1510), Apr 2026.

For hosts that regularly spawn subagents, this is a multiplier on the hot path. The possibility that a server is session-scoped forces `O(subagents × servers)` calls to `tools/list`: every subagent, for every server, every time, even if the underlying tool set has not changed since the orchestrator first connected. The client cannot skip the call because it cannot know in advance which servers are session-scoped. For an orchestrator spawning many short-lived subagents, this overhead can exceed the protocol traffic of the actual tool calls. Under this proposal the same workload is `O(servers)`: the orchestrator fetches each list once and every subagent reuses the cached result.

If list endpoints were a function only of the server deployment and the authenticated principal, clients could cache them and invalidate on an explicit signal. [SEP-2549] specifies such a signal (a server-advertised TTL plus `notifications/*/list_changed`), but its caching model is only sound if the list does not also vary per session. Removing sessions makes that model safe; a subagent can then inherit its parent's cached lists at zero cost.

#### Cardinality is fixed at one per session

Session state has a cardinality of exactly one per session. The model gets one cart, one browser, one of whatever the server scopes to the session; it cannot have two, and it cannot have zero.

This is a problem when different pieces of state need different scopes. Consider an orchestrator that spawns several subagents to independently research products to buy. The subagents should add to the same shopping cart (they are collaborating on one order) but each needs its own browser state (they are browsing different sites in parallel).

No session boundary satisfies both:

| Session model               | Cart (want: shared) | Browser (want: isolated) |
|-----------------------------|:-------------------:|:------------------------:|
| Subagents share parent's    | ✓ shared           | ✗ shared (clobbers)     |
| Subagents get their own     | ✗ isolated         | ✓ isolated              |

With explicit IDs the orchestrator calls `create_basket()` once, passes the resulting `basket_id` to each subagent, and each subagent separately calls `create_browser()` for its own `browser_id`. The model decides what is shared and what is isolated per piece of state, rather than having one scope imposed on everything.

The same lack of an identifier also means session state is not addressable from outside the session that created it. A cart created in one chat is invisible to another chat; if a user wants to resume work in a new conversation, hand something off to a different agent, or share state with a colleague, the session model provides nothing to refer to it by. An explicit `basket_id` can be passed to any of those.

## Specification

### Summary of changes

1. **Remove the session concept from the protocol.** The `Mcp-Session-Id` header is removed and the spec language describing session lifecycle and session-scoped behavior is deleted. The protocol is sessionless at every layer. (This supersedes the opt-in stateful path that [SEP-1442] retained.)

2. **List endpoints are session-independent.** With no session, the results of `tools/list`, `resources/list`, and `prompts/list` have no per-session or per-connection scope to depend on. Lists can still change for other reasons (server deployment, auth changes); caching and invalidation mechanics for those are specified separately in [SEP-2549].

3. **Stateful workflows use explicit handles.** With sessions gone, servers that need to maintain state across tool calls do so by returning an identifier from a creation tool and accepting it as a parameter on subsequent calls.

That third point is **not a protocol change**. There is no `handles/*` method, no handle type in the schema, no wire-level concept of a handle at all. From the protocol's perspective a handle is a string in a tool result and a string in a tool argument, indistinguishable from any other tool data. "Explicit state handles" is a tool-design pattern that the spec documents and recommends — in the same way it might document pagination or error-message conventions — not something it implements. The normative content of this SEP is the removal in (1); (2) follows from it, and (3) is the guidance that fills the gap.

### Explicit state handles

#### Pattern

Where a server would previously have relied on implicit session-scoped state — `add_item` calls operating on a per-session cart — it instead exposes an explicit creation tool that returns a handle:

```jsonc
// → tools/call
{ "name": "create_basket", "arguments": {} }

// ← result
{ "content": [{ "type": "text", "text": "Created basket bsk_a1b2c3" }],
  "structuredContent": { "basket_id": "bsk_a1b2c3" } }
```

The model then threads that handle through subsequent calls as an ordinary argument:

```jsonc
// → tools/call
{ "name": "add_item",
  "arguments": { "basket_id": "bsk_a1b2c3", "sku": "shoes" } }

// ← result
{ "content": [{ "type": "text", "text": "Added shoes to bsk_a1b2c3 (1 item)" }] }

// → tools/call
{ "name": "checkout",
  "arguments": { "basket_id": "bsk_a1b2c3" } }
```

Nothing here is a protocol extension: `basket_id` is an ordinary string field in `structuredContent` and an ordinary string argument to subsequent tools. This pattern is already the norm in widely-deployed remote MCP servers that manage durable resources:

| Server (official, remote)                                       | Create tool → returned ID         | Operate tools taking that ID                            |
|-----------------------------------------------------------------|-----------------------------------|---------------------------------------------------------|
| [Linear](https://linear.app/docs/mcp)                           | `create_issue` → issue id         | `get_issue`, `update_issue`, `create_comment`           |
| [Notion](https://developers.notion.com/docs/mcp)                | `notion-create-pages` → page id   | `notion-update-page`, `notion-move-pages`               |
| [GitHub](https://github.com/github/github-mcp-server#tools)     | `create_pull_request` → PR number | `pull_request_read`, `update_pull_request`, `merge_pull_request` |
| [Stripe](https://docs.stripe.com/mcp)                           | `create_customer` → customer id   | `create_invoice`, `list_subscriptions`                  |

The approach can be adopted for less-persistent objects (a browser context, an in-progress cart) by giving the created object a limited lifetime, and/or limiting its discoverability to the principal that created it. The server owns the state, the client holds a name for it, and authorization is checked on every call.

#### Guidance for servers

None of the following is normative. Handles are a tool-design pattern, not a protocol feature, and servers are free to shape them however fits their domain. The pattern works best when:

- **Handles are opaque.** A handle that encodes internal structure (`cart_user42_2026-03-11`) invites clients to parse it or models to guess it; an opaque handle such as `bsk_a1b2c3` does not.
- **Possession is not authorization (where auth exists).** For authenticated servers, validate `(handle, auth_context)` on every call; handles will end up in chat logs, copy-paste buffers, and subagent prompts. For unauthenticated servers, where the handle is necessarily a bearer token, generate it with at least 128 bits of cryptographically secure entropy and bound its lifetime. See [Security Implications](#security-implications).
- **Durability is documented in the tool description.** Handles outlive connections by design, so "the state lasts until the connection closes" is no longer applicable. Put the policy in the `create_*` tool's description — "returns a basket_id; baskets expire after 24h idle" — so it is visible to the model when it decides to create state. A policy only in server documentation is not visible to the model.
- **Expired handles return useful errors.** When a tool receives a handle for state that has expired or been destroyed, the error should say so — "basket bsk_a1b2c3 has expired" rather than "invalid argument". A clear expiry error lets the model recover by calling `create_*` again; an opaque error typically leads to retries or failure.
- **Creation takes parameters.** `create_context(cluster="staging")` is preferable to `create_context()` followed by `set_cluster(ctx, "staging")`: one round-trip instead of two, and the state cannot exist half-configured.
- **Cleanup is available.** A `destroy_*(handle)` tool lets models release resources. A `list_*()` tool lets a model recover after losing track of what it created. Neither is required.

#### Guidance for clients

From the client's perspective, a handle is an ordinary string in a tool result. The main client responsibility is ensuring that string survives context compaction; if the conversation is summarized and the handle is in the discarded portion, the state is orphaned. Clients that track tool-call results across compaction boundaries handle this already.

### Session-independent list endpoints

With sessions removed, list endpoints no longer have a session to vary against. This is the only constraint this SEP places on `tools/list`, `resources/list`, and `prompts/list`: there is no longer a per-session or per-connection scope for their results to depend on. Lists can still change for other reasons — a server deploys a new version, a user's plan or granted scopes change — and this SEP does not enumerate or restrict those.

How clients learn that a cached list has gone stale is the subject of [SEP-2549], which defines a server-advertised TTL on list responses and the interaction with `notifications/*/list_changed`. The two SEPs are complementary: this one removes the session as a source of variation, so there is a stable thing to cache; [SEP-2549] specifies how long to cache it and when to invalidate.

One consequence of the constraint above is that servers can no longer mutate `tools/list` as a side effect of tool calls; the `enable_admin_tools()`-mutates-the-list pattern is no longer permitted. In practice this is rarely used. For the same effect, servers can expose all tools unconditionally at list time and enforce authorization at call time (which is already the common posture for auth-gated tools).

### Consequential spec edits

Two places in the current spec define behavior in terms of session scope and need re-scoping:

- **JSON-RPC request ID uniqueness.** The spec currently requires that a request `id` "MUST NOT have been previously used by the requestor within the same session." The purpose of `id` is for the sender to correlate an incoming response with the request that produced it; the receiver only echoes it. With sessions removed, the constraint is re-scoped accordingly: a sender MUST NOT issue a request whose `id` matches that of another request it has sent and not yet received a response for. This is transport-agnostic, sufficient for correlation under every transport, and is what the TypeScript and Python SDKs already do via a monotonically increasing counter per client object. ([JSON-RPC 2.0 §4](https://www.jsonrpc.org/specification#request_object) itself imposes no uniqueness requirement — it only requires the receiver to echo the `id` — so this remains an MCP-level constraint.)
- **Pagination cursor validity.** The spec currently advises clients not to "persist cursors across sessions." With sessions removed, this advice disappears. Cursor stability and snapshot consistency are outside the scope of this proposal.

## Rationale

### Why remove sessions rather than just default them off?

[SEP-1442] already addresses making MCP work behind load balancers and without sticky routing. The reasons for going further are:

- **Opt-in sessions still prevent list caching.** A client cannot cache `tools/list` across session boundaries unless it knows the server does not opt into session-scoped mutation, and it cannot know that in advance. The client therefore re-fetches per session per server even though few servers opt in. The `O(subagents × servers)` cost from the Motivation section is caused by sessions being possible, not by sessions being used, so making them optional does not remove it.
- **The primitive influences server design.** Offering session-scoped state in the spec leads server authors to use it for workflows that would be better served by explicit IDs.
- **Fewer primitives reduce implementation surface.** Every protocol concept must be implemented by SDK authors, documented, and learned by new users.

### Expressiveness

A session provides exactly one scope per connection. Explicit IDs provide as many scopes as the model creates, and each can be shared or isolated independently. Anything expressible with a session is expressible with a single ID the model creates at the start of the conversation; the converse does not hold.

### Resumption

Because handles appear in tool results, they are part of the chat transcript. Any client that persists its chats — which is most of them — therefore persists the handles automatically. Reopening a conversation after an app restart, a page reload, or on a different device puts the handle back in front of the model with no additional resumption machinery, and this behavior is consistent across clients. Session-based state, by contrast, requires the client to persist and resend `Mcp-Session-Id` out of band, which (as covered in the Motivation) almost no clients do.

### Anticipated objections

#### Garbage collection

Sessions provide a lifecycle signal — when the session ends, state is freed. Without it, the model might forget to call `destroy_basket()`, and state leaks.

However, sessions do not deliver this reliably in practice. As covered in the Motivation, real clients either never end the session (per-app-launch), end it constantly (per-tool-call), or end it at moments uncorrelated with the conversation (page reload, network blip). Stateless HTTP servers behind load balancers never see a connection-close. Servers already rely on TTL-based expiry today; the session boundary is not what performs cleanup.

Explicit IDs with a documented durability policy ("baskets expire after 24h idle") is the same mechanism, made explicit.

#### Models have to carry the IDs forward

With implicit session state, the server tracks the identifier; with explicit IDs, the model is responsible for threading `basket_abc123` through every relevant call. The failure modes are hallucinating a slightly-wrong ID, or the ID falling out of context when the conversation is compacted.

Models already carry opaque identifiers through conversations routinely — file paths, URLs, commit hashes, PR numbers, UUIDs returned from prior tool calls — and current models do this reliably. Compaction is the harder case, but it affects any long-horizon state: if the compactor drops live tool-call results, the model loses track of what is in the session-scoped cart as well, not just the cart's ID.

#### IDs in chat history

A `basket_id` that can be pasted anywhere could become an unauthenticated capability in the user's chat log.

For authenticated servers, the ID should be a name, with the server checking `(id, auth_context)` on every call. Google Doc IDs sit in URLs and browser history; access is controlled by ACL, not ID secrecy. The same applies here.

For servers without authentication, the ID is necessarily a bearer token — possession is the only thing the server can check. In that case the handle should follow standard practice for unguessable capability tokens: generated from a cryptographically secure random source with at least 128 bits of entropy (e.g. UUIDv4, or 22+ characters of URL-safe base64), never derived from predictable inputs, and given a bounded lifetime. This is the same posture as other ephemeral public IDs in common use — "anyone with the link" share URLs, password-reset tokens, Stripe Checkout session IDs — and carries the same tradeoff: convenient, but anyone who obtains the token has access for its lifetime.

#### Breaking change

Sessions are in the spec today; removing them breaks anyone relying on them.

An automated survey of a 1000-repo random sample of open source MCP servers (classified by per-repo LLM analysis) found:

| Category                                                     | Share | Migration                                     |
|--------------------------------------------------------------|------:|-----------------------------------------------|
| No application-level reference to MCP session ID             | 90.0% | None                                          |
| `Map<sessionId, Transport>` routing (TS SDK boilerplate)     |  3.5% | Removed by a sessionless SDK transport        |
| Transport setup only (`sessionIdGenerator`, never read)      |  2.8% | Delete one constructor option                 |
| **Session-keyed application state**                          |  2.5% | Migrate to explicit handles or auth principal |
| **Proxy / gateway sticky routing**                           |  0.7% | Needs designed replacement                    |
| **Auth binding** (JWT claims, PKCE verifier keyed on session)|  0.5% | Replace with server-generated nonce or token subject |

The bolded rows are the repos that use the session ID for application semantics. The hardest-hit category — gateways that spawn one upstream per session — needs a designed replacement rather than a mechanical edit; see [Backward Compatibility](#backward-compatibility).

## Backward Compatibility

This is a **breaking change** for servers that rely on protocol-level session state. The migration path depends on server category:

**Stdio servers using process-lifetime state.** These are the most common stateful servers today and are not broken by this proposal in their default deployment: the process lifetime still exists, and a server that keeps a single in-memory browser instance per process continues to work with a stdio client that spawns one process. Stdio servers never had `Mcp-Session-Id`.

**HTTP servers using `Mcp-Session-Id`.** These are less common and must migrate to explicit handles. The migration is mechanical: replace the session-scoped state map with a handle-keyed state map, add a `create_*` tool, add the handle as a parameter to stateful tools.

**Servers using session ID as a telemetry key.** Some servers tag traces, logs, or rate-limit buckets with the session ID to correlate activity within a session. This already worked inconsistently across clients — against per-tool-call clients every event lands in its own bucket, and against clients that don't resume the correlation breaks at every restart. These use cases need to move to a different scoping mechanism, typically the authenticated principal (bearer token subject, API key) or a request-level correlation ID.

**Proxies and gateways using session ID for sticky routing.** Gateways that route by `Mcp-Session-Id` lose their routing key — but they only needed one because their upstreams were stateful. If the upstream is stateless (or migrates to explicit handles, where the state key is in the tool arguments and any replica can serve it from shared storage), the gateway needs no sticky routing at all. The residual case is gateways that bridge HTTP to stdio by spawning one subprocess per session; those need a different correlation key, which is a transport-layer concern (route by authenticated principal, or a cookie / gateway-issued header) rather than something this SEP defines.

**Servers binding auth artifacts to session ID.** A small number of servers store OAuth PKCE verifiers, session→user pinning maps, or JWT claims keyed on the session ID. In the PKCE case the server is already passing a correlation value through the OAuth `state` parameter (the browser callback is not an MCP request and never carried `Mcp-Session-Id`), so the change is to put a server-generated nonce in `state` instead of the session ID. Session→user pinning was a defense against the session-routing/auth decoupling described in [Security Implications](#security-implications) and is not needed once every request is independently authenticated. The migration is mostly mechanical, though worth a review since auth code is involved.

**Clients.** Clients become simpler: they no longer track or resend session identifiers, or need to determine whether a given server is stateful. List-endpoint caching becomes safe.

Rollout is a clean break: sessions are removed in the next spec version, with no deprecation window. Servers that currently rely on session-scoped state stay on the current protocol version until they have migrated to explicit handles. Protocol version negotiation already handles mixed-version deployments — a client that supports both versions speaks the old protocol to an unmigrated server and the new one to everyone else. This avoids shipping a version where clients support both modes simultaneously, which would prevent the caching benefit (a client cannot cache list endpoints if any connected server might be session-scoped).

## Security Implications

### Handle exposure

The main security consideration introduced by this SEP is that handles will end up in places session IDs did not — chat logs, subagent prompts, copy-paste buffers, potentially other users' screens.

This is a change in exposure surface, not a new class of vulnerability. Session IDs are already capability-bearing in practice: the Python SDK's stateful session manager, for example, routes by `Mcp-Session-Id` alone without verifying that the authenticated identity on the request matches the one that created the session, so a leaked session ID allows hijack by any other authenticated principal.[^py-sdk-hijack] The "validate `(id, auth_context)` on every call" guidance below applies equally to today's session IDs and to explicit handles; this SEP makes the requirement more visible because handles are more visible.

[^py-sdk-hijack]: [modelcontextprotocol/python-sdk#2100](https://github.com/modelcontextprotocol/python-sdk/issues/2100).

For authenticated servers, the recommended posture is the same one Google Doc IDs and GitHub PR numbers take: the ID identifies the resource, and the auth context on the request determines access. Servers that validate `(handle, auth_context)` on every call are unaffected by handle exposure.

For unauthenticated servers there is no auth context to check, so the handle is a capability token. These should be generated with at least 128 bits of cryptographically secure entropy, never derived from predictable inputs, and given a bounded lifetime — the same practice as "anyone with the link" share URLs or password-reset tokens. Exposure of such a handle grants access for its lifetime; servers should size that lifetime accordingly.

This is guidance, not a protocol requirement, since the protocol has no handle concept to enforce against.

## Reference Implementation

All official SDKs except PHP already provide a stateless mode, implemented as not generating a session ID (e.g. `sessionIdGenerator: undefined` in the TypeScript SDK, `stateless_http=True` in the Python SDK). This SEP makes that mode the only option for servers speaking the new protocol version. SDKs that support multiple protocol versions retain the session-ID-generating code path for older versions; the change is that it is no longer reachable when the negotiated protocol version is the one this SEP introduces.

