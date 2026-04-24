# SEP-2575: Make MCP Stateless

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2025-06-18
- **Author(s)**: Jonathan Hefner (@jonathanhefner), Mark Roth (@markdroth),
  Shaun Smith (@evalstate), Harvey Tuch (@htuch), Kurtis Van Gent (@kurtisvg)
- **Sponsor**: Kurtis Van Gent (@kurtisvg)
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2575

## Abstract

A truly stateless protocol, where every request is self-contained and can be
understood in isolation, is highly desirable for its inherent simplicity,
scalability, and reliability. The current Model Context Protocol (MCP) is not
stateless by default. The specification requires an initialization handshake
that establishes a session state between the client and server, which persists
for the duration of the connection.

This inherent statefulness makes it difficult to run MCP at scale. Placing an
MCP server behind a standard load balancer, for example, is challenging because
a client's session is coupled to the specific server instance holding its state.

This proposal outlines a series of changes to **enable stateless MCP as the
default**, embracing a "pay as you go" model for protocol complexity and state.
Under this model, we provide simple, stateless features by default and only
introduce the overhead of stateful, long-lived connections for cases where that
functionality is actually required.

Specifically, this SEP proposes removing the state-establishing initialization
handshake and replacing it with discrete, stateless alternatives. This initial
step allows each request to be processed independently, simplifying server-side
logic and paving the way for robust, scalable deployments.

## Motivation

The Model Context Protocol (MCP) specification currently mandates a stateful
initialization handshake. This design choice creates significant challenges for
scalability, reliability, and implementation simplicity. This SEP is motivated
by the need to address these shortcomings.

### The Problem with Statefulness

The core issue is that a server must retain session state from previous requests
to understand subsequent ones. This is in direct opposition to the design of
modern, cloud-native systems which favor stateless services for their resilience
and scalability.

1. **Impediment to Scalability:** The most critical issue is the difficulty of
   load balancing stateful MCP. A simple stateless load balancer (e.g., L4/L7
   round-robin) cannot be used, as it would route a client's requests to
   different backend servers, none of which would have the correct session
   state. Operators are forced to implement complex and fragile solutions like
   sticky sessions, which bind a client to a specific server. This complicates
   infrastructure, can lead to uneven load distribution, and makes horizontally
   scaling the service non-trivial.
2. **Poor Resilience and Fault Tolerance:** In a stateful model, if the specific
   server instance handling a client session fails, that session state is lost.
   The client must detect the connection failure, re-establish a connection
   (likely to a new server instance via the load balancer), and perform the
   entire initialization handshake again. This process is disruptive and
   inefficient, adding complexity around "resumability".
3. **Increased Implementation Complexity:** The current model imposes a
   significant burden on developers.
   - **Server-side:** Developers must implement logic to create, manage, and
     eventually garbage-collect per-client session state. This is a common
     source of bugs and memory leaks.
   - **Client-side:** Developers must write complex code to manage a persistent
     connection and handle the inevitable network failures and reconnections,
     including the logic to resynchronize state after a disconnect.

## Design Principles

This proposal establishes a "pay as you go" model for protocol complexity,
guided by the following principles in order of preference:

1. **Prioritize Stateless-ness:** Whenever possible, a request must be
   self-contained, providing all information the server needs to process it
   without relying on state from previous requests.
2. **Prefer State References:** If a fully stateless exchange is not practical,
   references to state should be passed in every request.
3. **Treat Statefulness as a Last Resort:** The complexity of stateful logic and
   long-lived streaming connections should only be accepted when no simpler
   alternative exists to solve a critical use case.

### Transport Consistency

It is critical that these stateless principles are applied consistently across
all transports. Keeping the `stdio` and `http` implementations in sync ensures a
**unified developer experience**, allowing the core protocol semantics to be
learned once and applied everywhere. This consistency simplifies the creation of
transport-agnostic libraries and tooling, and prevents protocol fragmentation
where different transports behave in fundamentally different ways. A single,
coherent protocol model is essential for a healthy ecosystem.

## Specification

### Overview

This specification fundamentally refactors the MCP interaction model to be
**stateless-first**. Currently, MCP requires a mandatory 3-way initialization
handshake before any resources can be exchanged. This handshake negotiates and
establishes several key pieces of information:

1. MCP Protocol Version
2. Server Capabilities and `serverInfo`
3. Client Capabilities and `clientInfo`

The requirement of this initialization handshake **enforces the establishment of
a state** that is expected to persist for subsequent communication between
client and server. Furthermore, by bundling these negotiations into a single
initialization phase, the specification creates an implied link between them,
particularly between the exchange of capabilities and a mandatory connection
lifecycle.

This proposal is to **remove the initialization handshake** and "unbundle" its
functions into discrete, stateless components. We will provide new, more clearly
defined mechanisms for clients and servers to exchange this information without
a mandatory state-creating cycle.

> **Note:** Session management (both transport-level and application-level) is
> addressed separately by [SEP-2322][SEP-2322] and [SEP-2567][SEP-2567]. This
> SEP focuses exclusively on removing the initialization handshake and providing
> stateless alternatives for version negotiation, discovery, and capabilities.

### Protocol Version

To make requests self-contained, metadata previously negotiated during the
handshake must now be included with **every request**.

#### HTTP

For the HTTP transport, protocol version MUST be passed as an **HTTP header**.
The header value MUST match the value provided in the request payload's `_meta`
field; otherwise the server MUST return a `400 Bad Request` (see
[SEP-2243][SEP-2243]).

- `MCP-Protocol-Version: 2025-06-18`
  - **Purpose**: To inform the server which version of the MCP specification the
    client is using for this specific request.
  - **Requirement**: This header is **MANDATORY**. Servers should reject
    requests with a missing or unsupported version.
  - This header MUST match the value provided in the Request as specified below.

#### Per-request Version

The `protocol-version` MUST be embedded directly within the `_meta` field of the
request payload. For HTTP, this \_meta MUST match the associated HTTP header, or
else the server should return a 400 Bad Request.

The following diff illustrates the required changes to `RequestMetaObject`:

```ts
export interface RequestMetaObject extends MetaObject {
  progressToken?: ProgressToken;
+ /**
+  * The MCP Protocol Version being used for this request.
+  */
+ "io.modelcontextprotocol/protocolVersion": string;
  // Additional per-request fields (clientInfo, clientCapabilities, logLevel)
  // are introduced in the Per-Request Client Capabilities section below.
}
```

#### Unsupported Protocol Versions

If a server receives a request with a protocol version it does not implement
(whether the version is unknown to the server or is a known version the server
has chosen not to support, such as an experimental or draft version), it MUST
return a JSON-RPC error response. For HTTP, the response status code MUST be
`400 Bad Request`. The error MUST conform to the following structure:

```ts
export interface UnsupportedProtocolVersionError extends Omit<
  JSONRPCErrorResponse,
  "error"
> {
  error: Error & {
    code: typeof INVALID_PARAMS;
    data: {
      /**
       * An array of protocol version strings that the server supports.
       */
      supported: string[];
      /**
       * The protocol version that was requested by the client.
       */
      requested: string;
    };
  };
}
```

#### Version Negotiation Flow

Without an initialization handshake, version negotiation happens inline:

1. The client sends a request with its preferred protocol version in the
   `MCP-Protocol-Version` header and `io.modelcontextprotocol/protocolVersion`
   `_meta` field.
2. If the server supports that version, it processes the request normally.
3. If the server does not support the requested version, it returns an
   `UnsupportedProtocolVersionError` containing its list of `supported`
   versions.
4. The client selects a mutually supported version from the list and retries.

Alternatively, a client **MAY** call `server/discover` first to learn the
server's supported versions before sending any other requests.

### Discovery for Server Capabilities

To allow clients to adapt to different server implementations, this
specification introduces a **discovery RPC**. This provides a standard mechanism
for a server to advertise its supported protocol versions and capabilities.

Servers **MUST** implement `server/discover`. Clients **MAY** call it but are
not required to — a client is free to invoke any RPC without first calling the
discovery endpoint. If a client calls an unsupported RPC, the server **MUST**
return a `Method not found` JSON-RPC error (`-32601`). For HTTP, the response
status code MUST be `404 Not Found`.

#### `server/discover` RPC

- **Purpose**: To allow a client to query the server for its supported protocol
  versions, capabilities, and other metadata.

**Request Schema:**

```ts
export interface DiscoverRequest extends Request {
  method: "server/discover";
  params?: {};
}
```

**Response Schema:**

```ts
export interface DiscoverResult extends Result {
  /**
   * A list of MCP Protocol Version strings that this server supports.
   * The client should choose a version from this list for use in
   * subsequent requests.
   */
  supportedVersions: string[];

  /**
   * An object detailing the capabilities of the server.
   */
  capabilities: ServerCapabilities;

  /**
   * Information about the server software implementation.
   */
  serverInfo: Implementation;

  /**
   * Natural language instructions describing how to use the server and
   * its features. This can be used by clients to improve an LLM's
   * understanding of available tools (e.g., by including it in a system prompt).
   */
  instructions?: string;
}
```

### Per-Request Client Capabilities

To complete the decoupling from the initial handshake, client capabilities are
no longer negotiated once at initialization. Instead, a client **MUST** specify
its capabilities on every request. This ensures the server is always fully
informed about what optional features the client can handle for that specific
transaction. An empty capabilities object means the client supports no optional
capabilities — servers **MUST NOT** infer capabilities from prior requests.

#### Per-Request Metadata Schema

Every request's `_meta` carries a small set of fields that previously lived in
the initialization handshake. The full `RequestMetaObject` shape:

```ts
export interface RequestMetaObject extends MetaObject {
  progressToken?: ProgressToken;
  /**
   * The MCP Protocol Version being used for this request.
   */
  "io.modelcontextprotocol/protocolVersion": string;
  /**
   * Identifies the client software.
   */
  "io.modelcontextprotocol/clientInfo": Implementation;
  /**
   * Capabilities of the client for this specific request.
   */
  "io.modelcontextprotocol/clientCapabilities": ClientCapabilities;
  /**
   * The desired log level for this request.
   */
  "io.modelcontextprotocol/logLevel"?: LoggingLevel;
}
```

Field semantics:

- `"io.modelcontextprotocol/protocolVersion"`: `string` — the MCP Protocol
  Version. **Required.** See the Protocol Version section above for negotiation
  details.
- `"io.modelcontextprotocol/clientInfo"`: `Implementation` — identifies the
  client software. **Required.** The `Implementation` schema requires `name` and
  `version`; other fields are optional.
- `"io.modelcontextprotocol/clientCapabilities"`: `ClientCapabilities` — the
  client's capabilities for this request. **Required.**
- `"io.modelcontextprotocol/logLevel"`: `LoggingLevel` — the desired log level
  for this request. **Optional.** If absent, the server **MUST NOT** send any
  log notifications for this request. The client opts in to log messages by
  explicitly setting a level. Replaces the `logging/setLevel` RPC.

Roots are intentionally not included as a per-request `_meta` field. Servers
that need the client's roots **MUST** request them via the MRTR
`ListRootsRequest` mechanism (see [SEP-2322][SEP-2322]), which avoids putting
potentially large root lists on every request and follows the "pay as you go"
principle.

A request missing any required field is malformed; the server **MUST** reject it
with `INVALID_PARAMS` (and `400 Bad Request` for HTTP).

#### Response Streaming

These declared capabilities govern what the server may include in the response
stream. [SEP-2322][SEP-2322] (MRTR) defines how server-to-client interactions
are embedded inline within responses via `IncompleteResult`; this SEP specifies
that those interactions are governed by the per-request `clientCapabilities`
declared in `RequestMetaObject`.

For HTTP, any request's response **MAY** be delivered as an SSE stream
(`Content-Type: text/event-stream`) instead of a single JSON object. Only
notifications (e.g., `notifications/progress`, `notifications/message`) flow as
independent messages on this stream, followed by the final result.
Server-to-client interactions (sampling, elicitation, listRoots) are **not**
sent as independent requests — they are embedded as input requests inside an
`IncompleteResult` returned from specific request paths (e.g., `CallTool`,
`GetPrompt`, `ListResources`). The client satisfies the input requests and
retries the original request.

#### Request Cancellation

How a client cancels an in-flight request depends on the transport:

- **HTTP.** Closing the SSE response stream **MUST** be treated by the server
  as cancellation of that request. Because each request has its own response
  stream, the transport-level disconnect is unambiguous.
- **STDIO.** The client **MUST** send a `notifications/cancelled`
  notification referencing the request ID. STDIO has a single shared channel,
  so there is no per-request stream to close.

Servers **SHOULD** stop work on a cancelled request as soon as practical and
**MUST NOT** send any further messages for it.

#### Missing Required Capabilities

A server **MUST NOT** rely on capabilities the client has not declared. If
processing a request requires a capability the client did not declare in its
`clientCapabilities`, the server **MUST** return a JSON-RPC error specifying
the missing capabilities. For HTTP, the response status code MUST be
`400 Bad Request`.

```ts
export const MISSING_REQUIRED_CLIENT_CAPABILITY = -32003;

export interface MissingRequiredClientCapabilityError extends Omit<
  JSONRPCErrorResponse,
  "error"
> {
  error: Error & {
    code: typeof MISSING_REQUIRED_CLIENT_CAPABILITY;
    data: {
      /**
       * The capabilities the server requires from the client
       * to process this request.
       */
      requiredCapabilities: ClientCapabilities;
    };
  };
}
```

### `subscriptions/listen` RPC

This SEP introduces a new `subscriptions/listen` RPC that replaces the previous
HTTP GET endpoint and ensures consistent behavior between HTTP and STDIO. A
client uses it to open a long-lived channel for receiving notifications outside
the context of a specific request.

The HTTP GET endpoint used by Streamable HTTP for server-to-client messages is
**removed** in this version of the protocol. All communication uses POST.

Per [SEP-2260][SEP-2260], only notifications (not requests) flow on this
channel; server-initiated requests use MRTR (see Response Streaming above) and
are scoped to a specific client request.

#### Request Schema

```ts
export interface SubscriptionsListenRequest extends Request {
  method: "subscriptions/listen";
  params: {
    _meta: {
      "io.modelcontextprotocol/protocolVersion": string;
      "io.modelcontextprotocol/clientInfo": Implementation;
      "io.modelcontextprotocol/clientCapabilities": ClientCapabilities;
      // ... other meta fields
    };

    /**
     * The notifications the client wants to receive on this stream.
     * Each notification type is opt-in; the server **MUST NOT** send
     * notification types the client has not explicitly requested here.
     */
    notifications: {
      /**
       * If true, receive notifications/tools/list_changed.
       */
      toolsListChanged?: boolean;

      /**
       * If true, receive notifications/prompts/list_changed.
       */
      promptsListChanged?: boolean;

      /**
       * If true, receive notifications/resources/list_changed.
       */
      resourcesListChanged?: boolean;

      /**
       * Subscribe to notifications/resources/updated for specific
       * resource URIs. Replaces the resources/subscribe RPC.
       */
      resourceSubscriptions?: string[];

      /**
       * If set, receive notifications/message at or above this level.
       * If absent, no log messages are sent on this stream.
       */
      logLevel?: LoggingLevel;
    };
  };
}
```

The `notifications` field is **required** and the client **MUST** explicitly
opt in to each notification type it wants to receive. If a field within
`notifications` is omitted (or set to `false`), the server **MUST NOT** send
notifications of that type.

#### Acknowledgment Notification

The server sends this notification first to acknowledge that the subscription
has been established. The subscription is long-lived and has no natural
"completion result"; it ends when:

- the client explicitly cancels it (closing the SSE stream on HTTP, or sending
  `notifications/cancelled` on STDIO);
- the underlying connection is closed (HTTP timeout, TCP disconnect, STDIO
  process exit); or
- the server tears it down (e.g., shutdown), in which case it **MUST** close
  the SSE stream (HTTP) or send `notifications/cancelled` referencing the
  subscription's request ID (STDIO).

```ts
export interface SubscriptionsAcknowledgedNotification extends Notification {
  method: "notifications/subscriptions/acknowledged";
  params: {
    /**
     * The notification subscriptions the server has agreed to honor.
     * Only includes notification types the server actually supports.
     * If the client requested an unsupported notification type
     * (e.g., promptsListChanged when the server has no prompts),
     * it is omitted from this set.
     */
    notifications: {
      toolsListChanged?: boolean;
      promptsListChanged?: boolean;
      resourcesListChanged?: boolean;
      resourceSubscriptions?: string[];
      logLevel?: LoggingLevel;
    };
  };
}
```

#### Multiple Concurrent Subscriptions

A client **MAY** have multiple active subscriptions concurrently (e.g., one
listening for tools-list changes, another for resource updates). Each
subscription is identified by the JSON-RPC request ID of its
`SubscriptionsListenRequest`.

To allow STDIO clients to demultiplex notifications belonging to different
subscriptions on the single shared channel, every notification delivered as
part of an active subscription **MUST** include the subscription's request ID
in `_meta`:

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/tools/list_changed",
  "params": {
    "_meta": {
      "io.modelcontextprotocol/subscriptionId": "<original listen request id>"
    }
  }
}
```

This same correlation pattern applies to other server-to-client notifications
that need to be associated with a specific request, such as
`notifications/progress` (which uses the originating request's ID).

#### Stopping a Subscription

- **HTTP.** Closing the SSE response stream stops the subscription.
- **STDIO.** The client sends `notifications/cancelled` referencing the listen
  request's ID. The server **MUST** stop sending notifications for that
  subscription.

#### Transport Behavior

**HTTP.** The client sends `SubscriptionsListenRequest` via `POST`. The server's
response is an open SSE stream (`Content-Type: text/event-stream`), and the
first JSON-RPC message on this stream **MUST** be a
`SubscriptionsAcknowledgedNotification`.

**STDIO.** The client sends `SubscriptionsListenRequest` at any time. The server
**MUST** acknowledge it by sending a `SubscriptionsAcknowledgedNotification`.
Subsequent notifications flow on the bidirectional STDIO channel, each tagged
with the subscription's request ID as described above. If the connection is
terminated (e.g., the server crashes and restarts), the client **MUST** re-send
`SubscriptionsListenRequest` to re-establish its subscriptions.

### Deprecated and Removed RPCs

To simplify the protocol and align with the move to per-request capabilities,
the following RPC methods and notifications are removed:

- `initialize` / `notifications/initialized`: The initialization handshake is
  removed. Version negotiation is handled per-request via `MCP-Protocol-Version`
  headers and `_meta` fields. Capability discovery is handled by
  `server/discover`.
- `logging/setLevel`: Removed. The log level is now specified per-request via
  the `'io.modelcontextprotocol/logLevel'` `_meta` field. There is no
  replacement RPC.
- `roots/list`: Removed as a top-level server-to-client RPC. Servers that need
  the client's roots **MUST** request them via the MRTR `ListRootsRequest`
  mechanism (see SEP-2322).
- `notifications/roots/list_changed`: Removed. Roots are fetched on demand via
  MRTR, so there is no need for a change notification.
- `resources/subscribe` / `resources/unsubscribe`: These methods are removed.
  Resource subscriptions are inherently stateful — the server must remember
  which resources each client has subscribed to. Instead, clients declare the
  resources they want updates for in the `notifications` param of the
  `subscriptions/listen` request. The server sends
  `notifications/resources/updated` on the listen stream for matching resources.
- `ping`: Removed. With independent server-to-client requests eliminated,
  ping no longer serves a useful purpose — any normal RPC call (or the
  `subscriptions/listen` SSE stream's transport-layer keep-alive) demonstrates
  liveness equivalently.

## Rationale

### Stateless-First by Default

The primary design decision of this SEP is to remove the mandatory
initialization handshake, making stateless interaction the default model for the
protocol. This choice is rooted in the "pay as you go" principle and the desire
to align MCP with modern, cloud-native architecture. By making the simplest
interaction model the default, we lower the barrier to entry and reduce
implementation complexity for the most common use cases. This immediately
enables straightforward horizontal scaling and improves resilience, as any
request can be handled by any server instance.

#### Alternative Considered: Optional Handshake

An alternative we considered was to keep the existing stateful handshake but
make it optional. In this model, a client could choose to either perform the
handshake to establish a persistent session or skip it and send self-contained
requests.

#### Why it was rejected:

Supporting two parallel interaction models would have dramatically increased the
complexity of the protocol and every implementation. Servers and clients would
need to build, test, and maintain two separate logic paths, leading to a larger
surface area for bugs. It also violates the design principle of having one
clear, obvious way to perform a core function. By making a clean break, we
ensure the entire ecosystem can move forward and benefit from a simpler, more
scalable, and more robust foundation.

### Explicit Session Management

This proposal originally included dedicated `sessions/create` and
`sessions/delete` RPCs to manage the lifecycle of a logical session.

Session management is now addressed separately by [SEP-2567][SEP-2567], which
proposes removing sessions entirely and replacing them with explicit state
handles. This aligns with the [sessions-vs-sessionless
decision][sessions-decision] made by the Core Maintainers.

### Separation of Concerns

A core principle of this proposal is the "unbundling" of the monolithic
initialization handshake into a suite of discrete, single-purpose RPCs. The
original handshake mixed the concerns of protocol negotiation and capability
discovery into a single, complex interaction. The new design explicitly
separates these:

- **Discovery**: Handled exclusively by `server/discover`.
- **Capabilities**: Handled on a per-request basis via the `_meta` field or the
  `subscriptions/listen` RPC.

The rationale for this is to create a more modular, flexible, and understandable
protocol. Each component now has a single, well-defined responsibility. This
allows clients to use only the parts of the protocol they need, adhering to our
"pay as you go" principle.

#### Alternative Considered: A Monolithic Handshake

We could have kept a single, monolithic handshake RPC and simply added more
parameters and complex logic to it to support the stateless-first model.

#### Why it was rejected:

A single, do-it-all RPC is difficult to implement, test, and evolve. It forces
all clients, even the simplest ones, to be aware of the protocol's most complex
features. By separating these concerns, we've made the protocol easier to learn
and implement correctly, while also making it more flexible and extensible for
the future.

## Backward Compatibility

While this proposal attempts to preserve existing functionality and use-cases,
this proposal introduces a **fundamental, backward-incompatible change**. Thus,
it will require a new version of the protocol.

### Supporting Multiple Versions

While this SEP removes the `initialize` handshake, a server that wishes to
support both old and new clients **MAY** do so. Such a server can continue to
implement the old `initialize` RPC to handle legacy clients, while also exposing
the new stateless RPCs (`server/discover`, etc.) for updated clients.

Both servers and clients should be able to handle changes in the versions
appropriately. Two example scenarios are outlined below, where vPrev indicates
the version prior to the SEP, and vAfter indicates a version after it.

#### Client (supporting vPrev) → Server (vPrev, vPost)

1. Client sends initialization
2. Server supports vPrev, so initialization is returned per spec
3. Client and server communicate per `vPrev`.

#### Client (supporting vPrev, vPost) → Server (vPrev)

For HTTP, the client may attempt any vPost request (e.g., `tools/list` with the
MCP Protocol Version header). The server returns `400 Bad Request` (or
`Unsupported protocol version`); the client falls back to vPrev (and performs
initialization) for future requests.

For STDIO, the client cannot rely on a per-request error to detect the server's
version. A client that supports both a vPost (which does not require
initialization) **and** a legacy version that does require `initialize`
**SHOULD** probe with `server/discover` first to determine which to use:

1. Client sends `server/discover` with the MCP Protocol Version `_meta` field
   set to its preferred vPost.
2. If the server supports vPost (or any vPost-style version the client also
   supports), the client uses the discovered version for subsequent requests.
3. If the server returns `Unsupported protocol version` or `Method not found`,
   the client falls back to its supported legacy version and performs the
   `initialize` handshake.

A client that supports only vPost-style versions has no need to probe — it
simply uses its preferred version and handles `Unsupported protocol version`
errors normally.

## Security Implications

Without a session handshake, every request must be independently authenticated
and authorized. Implementations **MUST** ensure that authentication is not
bypassed by the removal of the initialization phase.

Beyond per-request authentication, this proposal does not introduce additional
security concerns.

## Reference Implementation

// TODO

## FAQ

### What is protocol level statelessness?

[Wikipedia](https://en.wikipedia.org/wiki/Stateless_protocol) defines a
stateless protocol as:

> A stateless protocol is a communication protocol in which the receiver must
> not retain session state from previous requests. The sender transfers relevant
> session state to the receiver in such a way that every request can be
> understood in isolation, that is without reference to session state from
> previous requests retained by the receiver.

This does NOT mean that you can't build stateful applications on top of a
stateless protocol. HTTP is an example of a stateless protocol, which most of
the web is built on today. However it does mean that the state cannot exist _in
the protocol itself_, and should instead specify the state in the request (or
failing that, a reference to the state for the server or client to track).

### Does this make MCP a fully stateless protocol?

Not entirely (hence 'by default'). Depending on your interpretation of
"requests", the SSE streams mentioned (both client-initiated and
server-initiated) tend to have multiple requests within a context of a stream.
However, these streams are constrained to a single HTTP request and optional to
use, meaning that the complexity is both constrained and optional to use when
the situation requires it.

### Why is it important for STDIO to be stateless as well?

The transport MCP is using should be an implementation detail only. If one
version of a protocol supports functionality that doesn't cleanly map over to
another version of the protocol, they are really two different protocols.

This makes it easy for developers to switch their services from one transport to
another without needing to make significant changes to the behavior of their
applications, and easier to proxy between different transports correctly.
Otherwise, there will continue to be feature gaps and division between these
different implementations, leading to both confusion and incompatibility.

### How does `server/discover` relate to the MCP Server Card?

The `server/discover` RPC overlaps with the [MCP Server Card][SEP-2127]
proposal, which defines a `.well-known/mcp.json` document for HTTP-based
discovery. Both mechanisms are intentionally retained: the Server Card is
well-suited to HTTP (no auth required, cacheable, indexable) while
`server/discover` provides a unified RPC interface that works consistently
across HTTP and STDIO transports. The two should be aligned on content where
applicable.

## Open Questions

### What belongs in `_meta` vs. as a top-level protocol field?

This SEP places several previously-handshake-negotiated values
(`protocolVersion`, `clientInfo`, `roots`, `logLevel`, `clientCapabilities`)
into per-request `_meta` fields under the `io.modelcontextprotocol/` namespace.
This follows the spec's allowance for "purpose-specific metadata" reserved by
definitions in the schema.

However, this risks overloading `_meta` over time — at what point do we add
top-level fields again? One possible distinction: required protocol-level fields
(e.g., `protocolVersion`) might better live as top-level fields, while optional
or extension-provided values stay in `_meta`. This question deserves broader
discussion before this SEP is finalized.

### Should `clientInfo` be part of `ClientCapabilities`?

Currently, `clientInfo` (`Implementation` type) and `clientCapabilities`
(`ClientCapabilities` type) are separate fields. In a per-request model, having
a single field for all client metadata would reduce overhead. However,
`clientInfo` serves a different purpose (identity/UI) than capabilities (feature
negotiation). Should `clientInfo` be folded into `ClientCapabilities`, remain a
separate per-request `_meta` field, or be handled through a different mechanism
entirely (e.g., only sent via `subscriptions/listen`)?

[SEP-2127]: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127
[SEP-2243]: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2243
[SEP-2260]: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2260
[SEP-2322]: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2322
[SEP-2567]: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2567
[sessions-decision]: https://github.com/modelcontextprotocol/transports-wg/blob/main/docs/sessions-vs-sessionless-decision.md
