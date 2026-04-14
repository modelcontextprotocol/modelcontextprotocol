# SEP-2575: Stateless-by-Default MCP

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2025-06-18
- **Author(s)**: Jonathan Hefner (@jonathanhefner), Mark Roth (@markdroth), Shaun Smith (@evalstate), Harvey Tuch (@htuch), Kurtis Van Gent (@kurtisvg)
- **Sponsor**: None (seeking sponsor)
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
    *   **Server-side:** Developers must implement logic to create, manage, and
        eventually garbage-collect per-client session state. This is a common
        source of bugs and memory leaks.
    *   **Client-side:** Developers must write complex code to manage a
        persistent connection and handle the inevitable network failures and
        reconnections, including the logic to resynchronize state after a
        disconnect.


### Guiding Principles

This proposal is the first step toward establishing a "pay as you go" model for
protocol complexity. We will be guided by the following principles, in order of
preference:



1. **Prioritize Stateless-ness:** Whenever possible, a request must be
   self-contained, providing all information the server needs to process it
   without relying on session state from previous requests.
2. **Prefer State References:** If a fully stateless exchange is not practical,
   references to state should be passed in every request. 
3. **Treat Statefulness as a Last Resort:** The complexity of stateful logic and
   long-lived streaming connections should only be accepted when no simpler
   alternative exists to solve a critical use case.


### The Impact on Key Transports

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
2. Session ID (if the server supports sessions)
3. Server Capabilities (and
   [serverInfo](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/69a292b16a64e086add82fd76fc6aaed68e47de0/schema/draft/schema.ts#L196))
4. Client Capabilities (and
   [clientInfo](?tab=t.xcggn0fi5c29#:~:text=also%20includes%20%60clientInfo%60%20(-,https%3A//github.com/modelcontextprotocol/modelcontextprotocol/blob/69a292b16a64e086add82fd76fc6aaed68e47de0/schema/draft/schema.ts%23L181,-)%20and%20%60serverInfo%60%20())

The requirement of this initialization handshake **enforces the establishment of
a state** that is expected to persist for subsequent communication between
client and server. Furthermore, by bundling these negotiations into a single
initialization phase, the specification creates an implied link between them,
particularly between stateful sessions and the exchange of capabilities.

This proposal is to **deprecate the initialization handshake** and "unbundle"
its functions into discrete, stateless components. We will provide new, more
clearly defined mechanisms for clients and servers to exchange this information
without a mandatory state-creating cycle.


### Protocol Version

To make requests self-contained, metadata previously negotiated during the
handshake must now be included with **every request**. 

---



#### HTTP 

For the HTTP transport, protocol version MUST be passed as **HTTP header**. For
the HTTP transport, the headers MUST be treated as the source of truth over the
request payload. 



*   `MCP-Protocol-Version: 2025-06-18`
    *   **Purpose**: To inform the server which version of the MCP specification
        the client is using for this specific request.
    *   **Requirement**: This header is **MANDATORY**. Servers should reject
        requests with a missing or unsupported version.
    *   This header MUST match the value provided in the Request as specified
        below. 



---



#### Per-request Version

The `protocol-version` MUST be embedded directly within the `_meta` field of the
request payload. For HTTP, this _meta MUST match the associated HTTP header, or
else the server should return a 400 Bad Request. 

The following diff illustrates the required changes to the `Request` interface:


```ts
export interface Request {
   method: string;
   params?: {
     /**
      * See [General fields: `_meta`](/specification/2025-06-18/basic/index#meta) for notes on `_meta` usage.
      */
     _meta?: {
+       /**
+        * The MCP Protocol Version being used for this request.
+        */
+       modelcontextprotocol.io/mcpProtocolVersion: string;

       /**
        * If specified, the caller is requesting out-of-band progress notifications for this request (as represented by notifications/progress). The value of this parameter is an opaque token that will be attached to any subsequent notifications. The receiver is not obligated to provide these notifications.
        */
       progressToken?: ProgressToken;
       [key: string]: unknown;
     };
     [key: string]: unknown;
   };
 }
```



#### Unsupported Protocol Versions

If a server receives a request with an unsupported protocol version, it MUST
return a JSON-RPC error response (400 Bad Request for HTTP).  This response MUST
conform to the following interface: \



```ts
/**
 * Defines the JSON-RPC error object returned for an
 * unsupported protocol version.
 */
export interface UnsupportedVersionError extends Result {
  error: {
    /**
     * MUST be -32000.
     */
    code: -32000;
    /**
     * MUST be "Unsupported protocol version".
     */
    message: "Unsupported protocol version";
    /**
     * MUST contain an array of strings listing the
     * protocol versions supported by the server.
     * Example: ["2025-06-18", "2025-03-26"]
     */
    data: {
        supportedVersions: ["2025-06-18", "2025-03-26"]
    };
  };
}
```



### Optional Discovery for Server Capabilities 

To allow clients to adapt to different server implementations, this
specification introduces a **discovery RPC**. This provides a standard mechanism
for a server to advertise its supported protocol versions and capabilities.

This discovery step is **OPTIONAL**. A client is free to invoke any RPC without
first calling the discovery endpoint. If a client calls an unsupported RPC, the
server **MUST** reject the request with a `404 Not Found` error (for HTTP) or a
`Method not found` JSON-RPC error (`-32601`).



---



#### `server/discover` RPC



*   **Purpose**: To allow a client to query the server for its supported
    protocol versions, capabilities, and other metadata.

**Request Schema:**


```ts
export interface DiscoveryRequest extends Request {
  method: "server/discover";
  params?: {}; // No parameters are needed for a discovery request.
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




---



### Specify Client Capabilities Per-Request

To complete the decoupling from the initial handshake, client capabilities are
no longer negotiated once per session. Instead, a client **MAY** specify its
capabilities on a per-request basis. This allows the server to know what
optional features the client can handle for a specific transaction, such as
streaming responses. 

A server **SHOULD** only send requests that match a client's provided
capabilities. If a client's capabilities change and it wishes to update the
server, a client **SHOULD** send a new RPC. 

If a server sends a request that erroneously calls a client capability it
doesn't support, a client MUST return a Method not found JSON-RPC error
(-32601).

The primary capability defined in this proposal is the ability to handle
streaming responses, which is supported through two distinct models:
server-initiated and client-initiated.


#### Schema Changes


##### Server-Initiated Streaming (Response Stream)

This model applies when a client makes a standard RPC call and the server
responds back with an SSE stream. Rather than associate the client capabilities
with a session, the client may specify supported capabilities in the request. 

The client adds an optional `clientCapabilities` field to the `_meta` object of
its request. For the HTTP transport, a server that supports this **MAY** then
respond with an SSE stream for that transaction.


```ts
 export interface Request {
   // ...
     _meta?: {
       // ... other meta fields
+      /**
+       * Optional capabilities of the client for this specific request.
+       */
+      modelcontextprotocol.io/clientCapabilities?: ClientCapabilities;
	 roots: [
		// ... list of roots 
         ],
"logLevel": "info"
       // ... other meta fields
     };
   // ...
 }
```



##### Client-Initiated Streaming (Background Streaming)

This model applies when a client wants to proactively open a persistent SSE
stream to receive multiple or unsolicited events.

This is achieved using a **dedicated <code>messages/listen</code> RPC</strong>.
For the HTTP transport, the client sends this request via <code>POST</code>, and
the server's response is an open SSE stream, with a
<code>MessagesListenNotification</code> sent as the first event. For the STDIO
transport, this RPC is used for a simple request/response capabilities check.
This RPC replaces the existing /GET endpoint behavior for Streamable HTTP today.
\
 \
Client-initiated streaming <strong>MAY</strong> be associated with a session. If
no session is provided, it's assumed the server is using them for unassociated
or unsolicited requests. 

**Request Schema:**


```ts
export interface MessagesListenRequest extends Request {
  method: "messages/listen";
  params: {
    _meta?: {
      modelcontextprotocol.io/mcpProtocolVersion: string;
      modelcontextprotocol.io/sessionId?: string;
      modelcontextprotocol.io/clientCapabilities?: ClientCapabilities;
      modelcontextprotocol.io/roots: [
		// ... list of roots 
      ],
"logLevel": "info"
      // ... other meta fields
    };
  };
}
```


**Response Schema:**

```ts
export interface MessagesListenNotification extends Notification {
  method: "notifications/messages/listen";
}
```




---



#### STDIO Transport Behavior

For STDIO's simple request/response model, a client **MAY** send a
`MessagesListenRequest` at any time. The server **MUST** process it and reply
with a `MessagesListenNotification`. The interaction is complete after the
response is sent. 

The server **MAY** send any server to client messages or notifications for the
duration of the connection. 



---



#### Streamable HTTP Transport Behavior

For HTTP, there are two distinct models for handling streaming:

**1. Server-Initiated Streaming**

To receive a streaming response for a single RPC call, the client **augments the
standard request** by including the `clientCapabilities` object in the `_meta`
field. The server **MAY** then respond with an SSE stream for that transaction.

**2. Client-Initiated Streaming**

To proactively open a persistent SSE stream, the client sends the dedicated
`MessagesListenRequest` via `POST`. The server's response **is an open SSE
stream** (`Content-Type: text/event-stream`), and the **first request** on this
stream **MUST** be an event containing the `MessagesListenNotification`.


### Changes to Initialization 

Initialization is no longer required to be the first interaction between client
and server. 

A server **MAY** use a stateful session associated with a client, to associate
arbitrary state across multiple interactions. A session does not provide any
specific guarantees on the state (e.g. protocol version and capabilities may
change at any time during the session)  unless the server opts to do so. The
server **SHOULD** document or otherwise communicate to clients when they should
use sessions, and which state (if any) can be relied on by client behavior for
the duration of that session.


#### Initizalization

A client MAY decide to perform the initialization phase to start a session. If a
server supports sessions, it MUST respond back with a `sessionId`. 


```
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
+   "sessionId": "$SESSION_ID"
    "protocolVersion": "2025-03-26",
    "capabilities": {
      "logging": {},
      "prompts": {
        "listChanged": true
      },
      "resources": {
        "subscribe": true,
        "listChanged": true
      },
      "tools": {
        "listChanged": true
      }
    },
    "serverInfo": {
      "name": "ExampleServer",
      "version": "1.0.0"
    },
    "instructions": "Optional instructions for the client"
  }
}
```



#### Per-request session

A client **MUST** attach this to future requests associated with that session.
Sessions do not need to be associated with any particular connection. 



##### HTTP 

For the HTTP transport, session-id MUST be passed as **HTTP headers**. For the
HTTP transport, the headers MUST be treated as the source of truth over the
request payload. 



*   `MCP-Session-Id: <opaque-session-string>`
    *   **Purpose**: To associate a request with an optional, logical session
        that has been explicitly created on the server.
    *   **Requirement**: This header is **OPTIONAL**. Servers **MAY** reject
        requests without this header if they require a session for a particular
        request. 


##### STDIO

For the STDIO transport, where headers are not available, this metadata MUST be
embedded directly within the `_meta` field of the request payload.

The following diff illustrates the required changes to the `Request` interface:


```
export interface Request {
   method: string;
   params?: {
     /**
      * See [General fields: `_meta`](/specification/2025-06-18/basic/index#meta) for notes on `_meta` usage.
      */
     _meta?: {
+        * The optional ID for a logical session. 
+        */
+       modelcontextprotocol.io/sessionId?: string;
       /**
        * If specified, the caller is requesting out-of-band progress notifications for this request (as represented by notifications/progress). The value of this parameter is an opaque token that will be attached to any subsequent notifications. The receiver is not obligated to provide these notifications.
        */
       progressToken?: ProgressToken;
       [key: string]: unknown;
     };
     [key: string]: unknown;
   };
 }
```



#### Errors

There are two new errors introduced by this SEP.


##### Invalid Sessions

If a server receives a request with an invalid session id, it MUST return a
JSON-RPC error response (400 Bad Request for HTTP).  This response MUST conform
to the following interface: \



```
/**
 * Defines the JSON-RPC error object returned for an
 * invalid session ID. 
 */
export interface UnsupportedVersionError extends Result {
  error: {
    /**
     * MUST be -32001.
     */
    code: -32001;
    /**
     * MUST be "Invalid Session ID".
     */
    message: "Invalid Session ID";
  };
}
```



##### Session Required

If a server requires a valid session to respond to a specific request, it MUST
return a JSON-RPC error response (400 bad request). This response MUST conform
to the following interface: \



```
/**
 * Defines the JSON-RPC error object returned for an
 * invalid session ID. 
 */
export interface UnsupportedVersionError extends Result {
  error: {
    /**
     * MUST be -32001.
     */
    code: -32001;
    /**
     * MUST be "Invalid Session ID".
     */
    message: "Invalid Session ID";
  };
}
```



### Deprecated and Removed RPCs

To simplify the protocol and align with the move to per-request capabilities,
the following RPC methods and notifications are deprecated and will be removed:



*   `logging/setLevel`: This method is removed. Log levels should now be
    specified on a per-request basis using the
    `'modelcontextprotocol.io/logLevel'` field in the `_meta` object.
*   `notifications/roots/list_changed`: This notification is removed.
    Functionality requiring proactive updates from the server (like root list
    changes) will be handled by server-initiated streaming.
*   `notifications/initialized`: This notification is defined as a "no-op" (no
    operation). Servers compliant with this SEP should accept and ignore this
    notification without error to maintain backward compatibility with clients
    that may send it.


## Rationale


### Stateless-First by Default

The primary design decision of this SEP is to make the mandatory initialization
handshake optional, making stateless interaction the default model for the
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

Due to a lack of consensus on this specific approach, these changes have been
removed from this SEP to allow the other core stateless-first changes to
proceed. Explicit session management will be revisited in a future SEP.


### Separation of Concerns

A core principle of this proposal is the "unbundling" of the monolithic
initialization handshake into a suite of discrete, single-purpose RPCs. The
original handshake mixed the concerns of protocol negotiation, capability
discovery, and session management into a single, complex interaction. The new
design explicitly separates these:



*   **Discovery**: Handled exclusively by `server/discover`.
*   **Capabilities**: Handled on a per-request basis via the `_meta` field or
    the `messages/listen` RPC.

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
it will require a new version of the protocol.. 


### Supporting Multiple Versions

While this SEP deprecates the `initialize` handshake, a server that wishes to
support both old and new clients **MAY** do so. Such a server can continue to
implement the old `initialize` RPC to handle legacy clients, while also exposing
the new stateless RPCs (`server/discover`, `sessions/create`, etc.) for updated
clients. 

Both servers and clients should be able to handle changes in the versions
appropriately. Two example scenarios are outlined below, where vPrev indicates
the version prior to the SEP, and vAfter indicates a version after it.


#### Client (supporting vPrev) → Server (vPrev, vPost)



1. Client sends initialization 
2. Server supports vPrev, so initialization is returned per spec
3. Client and server communicate per`vPrev`.


#### Client (supporting vPrev. vPost) → Server (vPrev)



4. Client sends a request (e.g. list/tools) with MCP Protocol Version header
    1. HTTP: Server says "400 bad request"
    2. STDIO: returns error indicate initialization was required
5. Client falls back to vPrev (and makes initialization) for future requests 


## Reference Implementation

// TODO


## Security Implications

While this proposal improves the protocol's clarity, implementations **may still
be vulnerable** to common exploits if not secured correctly. The following
points should be considered:



*   **Session Hijacking**: The `sessionId` acts as a bearer token. To prevent
    interception and session hijacking, all communication **MUST** occur over an
    encrypted transport like **TLS**.
*   **Resource Exhaustion**: The `sessions/create` RPC is a potential vector for
    Denial-of-Service attacks. Servers **SHOULD** protect this endpoint with
    **rate-limiting and resource quotas**.


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
the web is built on today. However it does mean that the state cannot exist_ in
the protocol itself_, and should instead specify the state in the request (or
failing that, a reference to the state for the server or client to track). 


### Does this make MCP a fully stateless protocol?

Not entirely (hence 'by default'). Depending on your interpretation of
"requests", the SSE streams mentioned (both client-initiated and
server-initiated) tend to have multiple requests within a context of a stream.
However, these streams are constrained to a single HTTP request and optional to
use, meaning that the complexity is both constrained and optional to use when
the situation requires it. 


### What is it important for STDIO to be stateless as well? 

The transport MCP is using should be an implementation detail only. If one
version of a protocol supports functionality that doesn't cleanly map over to
another version of the protocol, they are really two different protocols.

This makes it easy for developers to switch their services from one transport to
another without needing to make significant changes to the behavior of their
applications, and easier to proxy between different transports correctly.
Otherwise, there will continue to be feature gaps and division between these
different implementations, leading to both confusion and incompatibility. 
