# SEP-3498: Separating Data Model from Transport Representation

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-09-30
- **Author(s)**: Kurtis Van Gent (@kurtisvg)
- **Sponsor**: Transports Working Group
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3498
- **Discussion**: https://github.com/modelcontextprotocol/transports-wg/pull/58
- **Original draft**: [Transports WG SEP draft](https://github.com/modelcontextprotocol/transports-wg/blob/032af28261ae709c7ca2e690db26c1fa0d52322a/proposals/data-model/0000-separating-data-model-from-transport-representation.md)

## Abstract

Separate MCP's data types from their transport representation. Requests,
notifications, responses, and errors share four fields: `protocolVersion`,
`method`, `metadata`, and `payload`. Requests also have a `name` when the method
identifies a tool, prompt, or resource. Each transport specification defines how
these types translate to and from its wire format, including how request IDs
are handled. This SEP does not change either transport's wire format: stdio and
Streamable HTTP continue to use JSON-RPC. The new data model is not a new wire
envelope.

## Motivation

We are exploring adapting stdio to use HTTP. This could let stdio and Streamable
HTTP share more behavior and reduce duplication between JSON-RPC fields and HTTP
headers.

For example, a `tools/call` request over Streamable HTTP carries its protocol
version in two places:

```text
Header: MCP-Protocol-Version: 2026-07-28
Body:   params._meta["io.modelcontextprotocol/protocolVersion"] = "2026-07-28"
```

A future HTTP-over-stdio specification could carry that value only in the
header. Removing the body field would break SDKs that expose the current
`CallToolRequest` schema directly, even though the tool call has not changed.

[PR #56](https://github.com/modelcontextprotocol/transports-wg/pull/56) shows a
similar problem: it proposes moving trace context to HTTP headers while keeping
it in `params._meta` for stdio. Code reading `params._meta.traceparent` would no
longer find it in an HTTP request that uses only the header.

Separating the data model lets applications use fields such as
`request.protocolVersion` regardless of where a transport carries them. Each
transport specification defines the translation to and from its wire format.
This SEP leaves both existing JSON-RPC wire formats unchanged; HTTP over stdio
and PR #56's trace propagation changes are separate proposals.

## Specification

### Data model

The [proposed schema](https://github.com/modelcontextprotocol/transports-wg/blob/032af28261ae709c7ca2e690db26c1fa0d52322a/proposals/data-model/data-model.schema.ts) uses this common shape:

```typescript
interface MCPMessage<P = unknown, M extends Metadata = Metadata> {
  protocolVersion: string | undefined;
  method: string | undefined;
  metadata: M;
  payload: P;
}
```

- `protocolVersion` is the MCP version, not the JSON-RPC version.
- `method` names the operation. Responses use the original request's method.
- `metadata.meta` holds message-level metadata, except protocol version and
  transport IDs. Requests and notifications share `MessageMetadata`. Requests
  require client capabilities in `meta`; notifications may omit `meta`.
- `payload` holds the parameters, result, or error, without message-level `_meta`.
  Nested metadata, such as `Tool._meta`, stays in place. Nested MRTR input requests
  keep their existing `method` and `params` fields.

Requests, notifications, and successful responses require a version and method.
Errors may leave either undefined when the original request cannot be identified.

Requests add an optional `name` field, required for these methods:

| Method           | Meaning of `name`                  | Field removed from the request payload |
| ---------------- | ---------------------------------- | -------------------------------------- |
| `tools/call`     | Tool name                          | `name`                                 |
| `prompts/get`    | Prompt name                        | `name`                                 |
| `resources/read` | Resource URI, not its display name | `uri`                                  |

Requests without a defined `name` mapping, such as `tools/list`, omit it.
Other payload fields, including structured references in `completion/complete`
and names inside tool arguments, stay in place. Responses and notifications
do not add this field.

The message types are `MCPRequest`, `MCPNotification`, `MCPResponse`, and
`MCPErrorResponse`. The API operation MUST identify the message type;
implementations MUST NOT guess it from the method or payload.
TypeScript type names are not available at runtime.

The transport section of the specification defines how this data model is
translated to and from the wire format. Transport implementations MUST keep
request IDs and routing state outside the data model.
Cancellation and subscription messages use that state to identify their target.
A cancellation payload contains only the optional reason.

Method-specific types, capabilities, client identity, progress tokens, and error
`code`, `message`, and `data` keep their existing meaning and requirements. Tool
execution failures remain results with `isError`.

### Example: `tools/call`

Before, the request inherits JSON-RPC fields, and its parameters inherit `_meta`:

```typescript
// original.schema.ts (selected declarations)
interface JSONRPCRequest extends Request {
  jsonrpc: typeof JSONRPC_VERSION;
  id: RequestId;
}

interface RequestParams {
  _meta: RequestMetaObject;
}

interface CallToolRequest extends JSONRPCRequest {
  method: "tools/call";
  params: CallToolRequestParams;
}
```

After, the target name and metadata are separate from the payload, and the
request has no transport ID:

```typescript
// data-model.schema.ts (selected declarations)
interface MessageMetadata {
  meta?: MetaObject;
}

interface MCPRequest<P = unknown> extends MCPMessage<P, MessageMetadata> {
  protocolVersion: string;
  method: string;
  name?: string;
  metadata: MessageMetadata & { meta: RequestMetaObject };
}

interface RequestParams {}

interface CallToolRequest extends MCPRequest<
  Omit<CallToolRequestParams, "name">
> {
  method: "tools/call";
  name: string;
}
```

The payload keeps `arguments`, `inputResponses`, and `requestState`.
`Omit<CallToolRequestParams, "name">` removes the target from the payload;
`request.name` holds it instead. `_meta` moves to `metadata.meta`, and the
version moves to `protocolVersion`. The transport implementation supplies `id`
and rebuilds the original `params` according to its transport specification.

### Transport Specifications

Each transport specification MUST define how the data model translates to and
from its wire format, including body fields, headers, and routing state. A wire
schema alone is not enough. The specifications below are independent: changing
one transport's translation does not change the other transport's requirements.
These translations preserve the existing JSON-RPC wire formats; they do not
serialize `MCPMessage` directly.

#### stdio

The [stdio wire schema](https://github.com/modelcontextprotocol/transports-wg/blob/032af28261ae709c7ca2e690db26c1fa0d52322a/proposals/data-model/stdio.schema.ts) describes the JSON-RPC objects.

##### Encoding

Implementations MUST select the message type from the API operation, add
`jsonrpc: "2.0"`, and apply this table. Copy the payload first, then add the
target and metadata fields.

| Data-model field  | Request                                                                             | Notification               | Successful response        | Error response            |
| ----------------- | ----------------------------------------------------------------------------------- | -------------------------- | -------------------------- | ------------------------- |
| `method`          | `method`                                                                            | `method`                   | Transport state only       | Transport state, if known |
| `name`            | `params.name` for `tools/call` and `prompts/get`; `params.uri` for `resources/read` | Not present                | Not present                | Not present               |
| `payload`         | `params`                                                                            | `params`, if defined       | `result`                   | `error`                   |
| `metadata.meta`   | `params._meta`                                                                      | `params._meta`, if present | `result._meta`, if present | Not added                 |
| `protocolVersion` | `params._meta["io.modelcontextprotocol/protocolVersion"]`                           | Transport state only       | Transport state only       | Transport state, if known |

1. For `tools/call`, `prompts/get`, and `resources/read`, require a string `name`
   and reject a duplicate target field in the payload. Other methods omit
   `name` unless they define a mapping for it.
2. Assign outgoing request IDs and echo them in responses. Omit notification
   IDs and preserve absent error IDs. Preserve string versus numeric IDs.
   Restore cancellation targets to `params.requestId` and subscription IDs to
   `params._meta["io.modelcontextprotocol/subscriptionId"]` or
   `result._meta["io.modelcontextprotocol/subscriptionId"]`, as required.
3. Preserve absent versus empty parameters and metadata. Omit absent fields
   rather than replacing them with `null`. Preserve error data, allowed
   extension fields, and nested metadata. Reject conflicting copies of moved
   fields and missing or mismatched required routing state.
4. Serialize each object as one line followed by a newline. Escape newlines
   inside strings; pretty-printing MUST NOT add newlines within a message.

##### Decoding

Implementations MUST:

1. Parse one complete line at a time, validate `jsonrpc: "2.0"` and the message
   schema, and identify the message type from the JSON-RPC envelope. Copy
   `method` for requests and notifications; discard `jsonrpc`.
2. For requests, extract
   `params._meta["io.modelcontextprotocol/protocolVersion"]` into
   `protocolVersion`. For `tools/call` and `prompts/get`, extract `params.name`
   into `name`; for `resources/read`, extract `params.uri`. Require a string
   target for these methods.
3. Keep `id`, cancellation targets, and subscription IDs in transport state.
   Match responses by request ID, subscription notifications by subscription
   ID, and progress notifications by token before dispatch. Preserve string
   versus numeric IDs and absent error IDs.
4. Move the remaining message-level `_meta` into `metadata.meta` and the
   remaining `params` or `result` fields into `payload`. For errors, use `error`
   as the payload. Missing parameters become `payload: undefined`; empty objects
   stay empty. Preserve error data, allowed extension fields, and nested metadata.
5. Get response method/version from the stored request and notification version
   from transport state. Reject missing or mismatched required routing state;
   do not guess a request or default an unknown version to the latest.
   Uncorrelated errors may have an unknown method or version.

##### Exchange behavior

Clients send requests and notifications to the server's `stdin`; servers send
responses and notifications through `stdout`. Diagnostics go to `stderr`.

Cancel an exchange with `notifications/cancelled`, using the target request ID
in `params.requestId`. Receiving it cancels that exchange. Cancelling one request
MUST NOT close the shared stdio channel.

This revision has no server-initiated wire requests; MRTR input requests stay
inside result payloads. The remaining lifecycle and security rules follow the
pinned [stdio specification][stdio-spec].

#### Streamable HTTP

The [Streamable HTTP wire schema](https://github.com/modelcontextprotocol/transports-wg/blob/032af28261ae709c7ca2e690db26c1fa0d52322a/proposals/data-model/streamable-http.schema.ts) describes the
JSON-RPC objects carried in HTTP bodies and SSE events. The HTTP exchange
associates responses and notifications with their originating request. Existing
JSON-RPC envelope requirements remain defined by the wire schema.

##### Encoding

Select the message type from the API operation. Send each request as a separate
POST containing one JSON-RPC object.

###### JSON-RPC body fields

Implementations MUST set these fields from the data model, transport state, or
the fixed values listed below. Copy the payload first, then add the target and
metadata fields.

| JSON-RPC field                                            | Source or fixed value                | When to set                                      |
| --------------------------------------------------------- | ------------------------------------ | ------------------------------------------------ |
| `jsonrpc`                                                 | Fixed: `"2.0"`                       | Every message                                    |
| `method`                                                  | `method`                             | Requests and notifications                       |
| `params`                                                  | Copy of `payload`                    | Requests; notifications when payload is defined  |
| `params.name`                                             | `name`                               | `tools/call`, `prompts/get`                      |
| `params.uri`                                              | `name`                               | `resources/read`                                 |
| `params._meta`                                            | Copy of `metadata.meta`              | Requests; notifications when metadata is present |
| `params._meta["io.modelcontextprotocol/protocolVersion"]` | `protocolVersion`                    | Every request                                    |
| `params._meta["io.modelcontextprotocol/subscriptionId"]`  | Subscription ID from transport state | Subscription notifications that require it       |
| `result`                                                  | Copy of `payload`                    | Successful responses                             |
| `result._meta`                                            | Copy of `metadata.meta`              | Successful responses when metadata is present    |
| `result._meta["io.modelcontextprotocol/subscriptionId"]`  | Subscription ID from transport state | Subscription results that require it             |
| `error`                                                   | `payload`                            | Error responses                                  |

1. For `tools/call`, `prompts/get`, and `resources/read`, require a string `name`
   and reject a duplicate target field in the payload. Other methods omit
   `name` unless they define a mapping for it. Other payload fields keep their
   names: for example, `payload.arguments` becomes `params.arguments`.
2. Restore subscription IDs from transport state at the locations in the table.
3. Preserve absent versus empty parameters and metadata. Omit absent fields
   rather than replacing them with `null`. Preserve error data, allowed
   extension fields, and nested metadata. Reject conflicting copies of moved
   fields and missing or mismatched required routing state.

###### HTTP request headers

Implementations MUST set these headers from the data model or the fixed values
listed below:

| HTTP header            | Data-model source or fixed value                                                                                           | When to set                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `Content-Type`         | Fixed: `application/json`                                                                                                  | Every request                                                     |
| `Accept`               | Fixed: `application/json, text/event-stream`                                                                               | Every request                                                     |
| `MCP-Protocol-Version` | `protocolVersion`                                                                                                          | Every request                                                     |
| `Mcp-Method`           | `method`                                                                                                                   | Every request                                                     |
| `Mcp-Name`             | `name`                                                                                                                     | `tools/call`, `prompts/get`, `resources/read`                     |
| `Mcp-Param-{Name}`     | Value at the annotated property path in `payload.arguments`; `{Name}` comes from `x-mcp-header` in the tool's input schema | `tools/call`, when the annotated argument is present and non-null |

Parameter extraction, omitted/null values, conversion to strings, and Base64
encoding MUST follow the pinned [header rules][http-header-rules]. Capabilities
and client identity are carried in `params._meta`; they have no header mapping.

##### Decoding

Implementations MUST:

1. Parse the JSON-RPC object, validate `jsonrpc: "2.0"` and the message schema,
   and identify the message type from the envelope. Copy `method` for requests
   and notifications; discard `jsonrpc`. For an `application/json`
   response, parse one object; for `text/event-stream`, parse each SSE event's
   data as a message. Ignore SSE comments.
2. For incoming requests, decode and check MCP headers against the body before
   dispatch. Missing, malformed, or mismatched required MCP headers produce HTTP
   400 and `HeaderMismatch` (`-32020`). Headers MUST NOT override body values.
3. For requests, extract
   `params._meta["io.modelcontextprotocol/protocolVersion"]` into
   `protocolVersion`. For `tools/call` and `prompts/get`, extract `params.name`
   into `name`; for `resources/read`, extract `params.uri`. Require a string
   target for these methods. Each mirrored value becomes one data-model field.
4. Associate responses and notifications with the request whose HTTP response
   carries them. Extract subscription IDs into transport state.
5. Move the remaining message-level `_meta` into `metadata.meta` and the
   remaining `params` or `result` fields into `payload`. For errors, use `error`
   as the payload. Missing parameters become `payload: undefined`; empty objects
   stay empty. Preserve error data, allowed extension fields, and nested metadata.
6. Get response method/version and notification version from the HTTP exchange.
   Do not default an unknown version to the latest. Errors generated before a
   valid request is available may have an unknown method or version.

##### Exchange behavior

A server returns one response as `application/json`, or sends notifications and
its final response as SSE event data using `text/event-stream`.
`subscriptions/listen` keeps its SSE response open for subscription notifications.

Closing a request's SSE stream signals cancellation; implementations MUST NOT
also send `notifications/cancelled`. This revision defines no core
client-to-server HTTP notifications. If an extension permits notification POSTs,
acceptance returns HTTP 202 with no body, which MUST NOT create an `MCPResponse`.

HTTP failures without a valid MCP error body remain transport failures. This
revision has no server-initiated wire requests; MRTR input requests stay inside
result payloads. Other status, lifecycle, and security rules follow the pinned
[Streamable HTTP specification][http-spec].

[stdio-spec]: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/d0e246ea3c69eafaa2806bc4cd28025703ba2c2b/docs/specification/draft/basic/transports/stdio.mdx
[http-spec]: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/d0e246ea3c69eafaa2806bc4cd28025703ba2c2b/docs/specification/draft/basic/transports/streamable-http.mdx
[http-header-rules]: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/d0e246ea3c69eafaa2806bc4cd28025703ba2c2b/docs/specification/draft/basic/transports/streamable-http.mdx#request-metadata

## Rationale

Removing only `jsonrpc` would still tie application types to the placement of
`params`, `result`, and `error`. Separating metadata and payload lets each
transport specification define their placement. Separate API operations
distinguish requests from responses: both can refer to `tools/call`, so the method
alone is not enough.

Request-level `name` lets routing and logging code identify the target without
inspecting the payload. Its meaning follows `Mcp-Name`, including a resource URI
for `resources/read`. Keeping it on requests avoids adding it to every message;
removing the payload copy avoids conflicting target values.

## Backward Compatibility

Streamable HTTP and stdio continue to send and receive JSON-RPC messages with
the same fields, headers, and framing. Version negotiation stays unchanged.
Peers do not need to adopt the new data model to communicate. Code using
wire-shaped types can continue using the wire schemas. Code adopting the data
model must translate messages according to the transport specification.
No SDK tier requirements are added.

## Security Implications

Transport implementations MUST validate metadata, match messages to the correct
request, and reject conflicting header/body values before dispatch. Client
identity remains self-reported metadata, not proof of identity. Existing authentication and
authorization rules still apply.

## Reference Implementation

The [Transports WG prototype](https://github.com/modelcontextprotocol/transports-wg/tree/032af28261ae709c7ca2e690db26c1fa0d52322a/proposals/data-model) includes the proposed TypeScript
data model, wire schemas, a [message converter](https://github.com/modelcontextprotocol/transports-wg/blob/032af28261ae709c7ca2e690db26c1fa0d52322a/proposals/data-model/checks/mapping.ts),
and [compatibility checks](https://github.com/modelcontextprotocol/transports-wg/blob/032af28261ae709c7ca2e690db26c1fa0d52322a/proposals/data-model/checks/verify.cjs). These links pin the
reviewed revision so the examples remain reproducible.

The original and both transport wire schemas are identical to
[the MCP schema at commit `d0e246e`](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/d0e246ea3c69eafaa2806bc4cd28025703ba2c2b/schema/draft/schema.ts).
The prototype checks TypeScript compatibility, 23 message round trips, and
rejection of missing or duplicate request targets. It covers message conversion;
HTTP headers, SSE parsing, and stream I/O still need integration tests.

To run it, check out Transports WG commit
`032af28261ae709c7ca2e690db26c1fa0d52322a` and run:

```sh
cd proposals/data-model
npx --yes --package=typescript@5.9.3 -- node checks/verify.cjs
```

Specification integration and any required conformance coverage remain work
for finalization. This draft does not modify the published schema or transports.
