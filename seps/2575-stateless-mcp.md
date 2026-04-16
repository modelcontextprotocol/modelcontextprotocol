# SEP-2575: Stateless-by-Default MCP

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2025-06-18
- **Author(s)**: Jonathan Hefner (@jonathanhefner), Mark Roth (@markdroth), Shaun Smith (@evalstate), Harvey Tuch (@htuch), Kurtis Van Gent (@kurtisvg)
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
   - **Client-side:** Developers must write complex code to manage a
     persistent connection and handle the inevitable network failures and
     reconnections, including the logic to resynchronize state after a
     disconnect.

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

This proposal is to **remove the initialization handshake** and "unbundle"
its functions into discrete, stateless components. We will provide new, more
clearly defined mechanisms for clients and servers to exchange this information
without a mandatory state-creating cycle.

> **Note:** Session management (both transport-level and application-level) is
> addressed separately by
> [SEP-2322](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2322)
> and
> [SEP-2567](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2567).
> This SEP focuses exclusively on removing the initialization handshake and
> providing stateless alternatives for version negotiation, discovery, and
> capabilities.

### Protocol Version

To make requests self-contained, metadata previously negotiated during the
handshake must now be included with **every request**.

#### HTTP

For the HTTP transport, protocol version MUST be passed as **HTTP header**. For
the HTTP transport, the headers MUST be treated as the source of truth over the
request payload.

- `MCP-Protocol-Version: 2025-06-18`
  - **Purpose**: To inform the server which version of the MCP specification
    the client is using for this specific request.
  - **Requirement**: This header is **MANDATORY**. Servers should reject
    requests with a missing or unsupported version.
  - This header MUST match the value provided in the Request as specified
    below.

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
}
```

#### Unsupported Protocol Versions

If a server receives a request with an unsupported protocol version, it MUST
return a JSON-RPC error response. For HTTP, the response status code MUST be
`400 Bad Request`. The error MUST conform to the following structure:

```ts
export const UNSUPPORTED_PROTOCOL_VERSION = -32001;

export interface UnsupportedProtocolVersionError extends Omit<
  JSONRPCErrorResponse,
  "error"
> {
  error: Error & {
    code: typeof UNSUPPORTED_PROTOCOL_VERSION;
    data: {
      /**
       * An array of protocol version strings that the server supports.
       */
      supportedVersions: string[];
    };
  };
}
```

#### Version Negotiation Flow

Without an initialization handshake, version negotiation happens inline:

1. The client sends a request with its preferred protocol version in the
   `MCP-Protocol-Version` header and
   `io.modelcontextprotocol/protocolVersion` `_meta` field.
2. If the server supports that version, it processes the request normally.
3. If the server does not support the requested version, it returns an
   `UnsupportedVersionError` containing its list of `supportedVersions`.
4. The client selects a mutually supported version from the list and retries.

Alternatively, a client **MAY** call `server/discover` first to learn the
server's supported versions before sending any other requests.

### Optional Discovery for Server Capabilities

To allow clients to adapt to different server implementations, this
specification introduces a **discovery RPC**. This provides a standard mechanism
for a server to advertise its supported protocol versions and capabilities.

This discovery step is **OPTIONAL**. A client is free to invoke any RPC without
first calling the discovery endpoint. If a client calls an unsupported RPC, the
server **MUST** return a `Method not found` JSON-RPC error (`-32601`). For HTTP,
the response status code MUST be `404 Not Found`.

#### `server/discover` RPC

- **Purpose**: To allow a client to query the server for its supported
  protocol versions, capabilities, and other metadata.

**Request Schema:**

```ts
export interface DiscoveryRequest extends Request {
  method: "server/discover";
  params?: {};
}
```

**Response Schema:**

```ts
export interface DiscoveryResult extends Result {
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
no longer negotiated once at initialization. Instead, a client **MAY** specify its
capabilities on a per-request basis. This allows the server to know what
optional features the client can handle for a specific transaction, such as
streaming responses.

A server **SHOULD** only send requests that match a client's provided
capabilities. The server may send these requests in two ways:

1. **Inline**: As notifications within an SSE stream response to a triggering
   RPC (e.g., `notifications/progress` within a `tools/call` response stream).
2. **On the listen stream**: As events on an open `notifications/listen` SSE stream.

In both cases, the server uses the `clientCapabilities` from the request's
`_meta` to determine what it is allowed to send.

If a server sends a request that erroneously calls a client capability it
doesn't support, a client MUST return a `Method not found` JSON-RPC error
(`-32601`).

If a server requires client capabilities to process a request and the client
has not provided them, the server MUST return a JSON-RPC error. For HTTP, the
response status code MUST be `400 Bad Request`. The client MAY then retry the
request with the required capabilities in `_meta`.

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

In addition to `clientCapabilities`, the following fields previously exchanged
during initialization **MAY** be included in per-request `_meta` fields:

- `"io.modelcontextprotocol/clientInfo"`: `Implementation` — identifies the
  client software without requiring an initialization handshake.
- `"io.modelcontextprotocol/roots"`: `Root[]` — the client's current root
  URIs, replacing the need for `notifications/roots/list_changed`.
- `"io.modelcontextprotocol/logLevel"`: `LoggingLevel` — the desired log
  level for this request, replacing the `logging/setLevel` RPC.

The primary capability defined in this proposal is the ability to handle
streaming responses, which is supported through two distinct models:
server-initiated and client-initiated.

#### Streaming Models

##### Server-Initiated Streaming (Response Stream)

This model applies when a client makes a standard RPC call and the server
responds back with an SSE stream. The client specifies supported capabilities
directly in the request.

The client adds an optional `clientCapabilities` field to `RequestMetaObject`.
For the HTTP transport, a server that supports this **MAY** then respond with
an SSE stream for that transaction.

```ts
export interface RequestMetaObject extends MetaObject {
  progressToken?: ProgressToken;
  "io.modelcontextprotocol/protocolVersion": string;
+ /**
+  * Optional capabilities of the client for this specific request.
+  */
+ "io.modelcontextprotocol/clientCapabilities"?: ClientCapabilities;
}
```

##### Client-Initiated Streaming (Background Streaming)

This model applies when a client wants to proactively open a persistent SSE
stream to receive multiple or unsolicited events.

This is achieved using a dedicated `notifications/listen` RPC. For the HTTP
transport, the client sends this request via `POST`, and the server's response
is an open SSE stream, with a `NotificationsListenNotification` sent as the
first event. For the STDIO transport, this RPC is used to declare the client's
capabilities and interests.

This RPC replaces the existing HTTP GET endpoint for Streamable HTTP. The GET
endpoint is removed; all communication uses POST. Only notifications (not
requests) may be sent on the listen stream, per
[SEP-2260](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2260).

**Request Schema:**

```ts
export interface NotificationsListenRequest extends Request {
  method: "notifications/listen";
  params: {
    _meta?: {
      "io.modelcontextprotocol/protocolVersion": string;
      "io.modelcontextprotocol/clientCapabilities"?: ClientCapabilities;
      "io.modelcontextprotocol/roots"?: Root[];
      // ... other meta fields
    };

    /**
     * Optional filter for which notifications the client wants to receive.
     * If omitted, the server SHOULD send all notifications the client's
     * capabilities support.
     */
    notifications?: {
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
    };
  };
}
```

If `notifications` is omitted entirely, the server **SHOULD** send all
notifications the client's declared capabilities support. If provided, only
the specified notification types are delivered.

**Acknowledgment Notification:**

The server sends this notification as the first event on the stream to
acknowledge that the listen stream has been established. For HTTP, this is the
first SSE event. The stream remains open for subsequent server-to-client
messages until the server sends a final `Result` to close it.

```ts
export interface NotificationsListenNotification extends Notification {
  method: "notifications/listen/acknowledged";
}
```

#### STDIO Transport Behavior

For STDIO, a client **MAY** send a `NotificationsListenRequest` at any time to
declare its capabilities and the messages it is interested in receiving. The
server **MUST** acknowledge it by sending a `NotificationsListenNotification`.

The server **MAY** then send server-to-client messages and notifications for
the duration of the connection. If the connection is terminated (e.g., the
server crashes and restarts), the client **MUST** re-send `NotificationsListenRequest`
to re-establish its declared capabilities.

#### Streamable HTTP Transport Behavior

For HTTP, there are two distinct models for handling streaming:

**1. Server-Initiated Streaming**

To receive a streaming response for a single RPC call, the client **augments the
standard request** by including the `clientCapabilities` object in the `_meta`
field. The server **MAY** then respond with an SSE stream for that transaction.

**2. Client-Initiated Streaming**

To proactively open a persistent SSE stream, the client sends the dedicated
`NotificationsListenRequest` via `POST`. The server's response **is an open SSE
stream** (`Content-Type: text/event-stream`), and the **first request** on this
stream **MUST** be an event containing the `NotificationsListenNotification`.

### Deprecated and Removed RPCs

To simplify the protocol and align with the move to per-request capabilities,
the following RPC methods and notifications are removed:

- `initialize` / `notifications/initialized`: The initialization handshake is
  removed. Version negotiation is handled per-request via
  `MCP-Protocol-Version` headers and `_meta` fields. Capability discovery is
  handled by `server/discover`. Servers compliant with this SEP **SHOULD**
  accept and ignore `notifications/initialized` without error to maintain
  backward compatibility with clients that may send it.
- `logging/setLevel`: This method is removed. Log levels should now be
  specified on a per-request basis using the
  `'io.modelcontextprotocol/logLevel'` field in the `_meta` object.
- `notifications/roots/list_changed`: This notification is removed. Clients
  now provide their current roots directly in per-request `_meta` fields.
  Since the server receives the current roots with each request, there is no
  need for a separate change notification.
- `resources/subscribe` / `resources/unsubscribe`: These methods are removed.
  Resource subscriptions are inherently stateful — the server must remember
  which resources each client has subscribed to. Instead, clients declare
  the resources they want updates for in the `notifications` param of the
  `notifications/listen` request. The server sends
  `notifications/resources/updated` on the listen stream for matching
  resources.

## Rationale

### Stateless-First by Default

The primary design decision of this SEP is to remove the mandatory initialization
handshake, making stateless interaction the default model for the protocol. This
choice is rooted in the "pay as you go" principle and the desire to align MCP
with modern, cloud-native architecture. By making the simplest
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

Session management is now addressed separately by
[SEP-2567](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2567),
which proposes removing sessions entirely and replacing them with explicit
state handles. This aligns with the
[sessions-vs-sessionless decision](https://github.com/modelcontextprotocol/transports-wg/blob/main/docs/sessions-vs-sessionless-decision.md)
made by the Core Maintainers.

### Separation of Concerns

A core principle of this proposal is the "unbundling" of the monolithic
initialization handshake into a suite of discrete, single-purpose RPCs. The
original handshake mixed the concerns of protocol negotiation and capability
discovery into a single, complex interaction. The new design explicitly
separates these:

- **Discovery**: Handled exclusively by `server/discover`.
- **Capabilities**: Handled on a per-request basis via the `_meta` field or
  the `notifications/listen` RPC.

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

1. Client sends a request (e.g. tools/list) with MCP Protocol Version header
   1. HTTP: Server says "400 bad request"
   2. STDIO: returns error indicating initialization was required
2. Client falls back to vPrev (and makes initialization) for future requests

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

## Open Questions

### Should `clientInfo` be part of `ClientCapabilities`?

Currently, `clientInfo` (`Implementation` type) and `clientCapabilities`
(`ClientCapabilities` type) are separate fields. In a per-request model, having
a single field for all client metadata would reduce overhead. However,
`clientInfo` serves a different purpose (identity/UI) than capabilities
(feature negotiation). Should `clientInfo` be folded into `ClientCapabilities`,
remain a separate per-request `_meta` field, or be handled through a different
mechanism entirely (e.g., only sent via `notifications/listen`)?
