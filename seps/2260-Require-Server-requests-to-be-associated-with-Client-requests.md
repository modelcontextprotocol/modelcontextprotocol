# SEP-2260: Require Server requests to be associated with a Client request.

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-02-16
- **Author(s)**: MCP Transports Working Group
- **Sponsor**: @CaitieM20 - Caitie McCaffrey
- **PR**: https://github.com/modelcontextprotocol/specification/pull/2260

## Abstract

This SEP clarifies that `roots/list`, `sampling/createMessage`, and
`elicitation/create` requests **MUST** be associated with an originating
client-to-server request (e.g., during `tools/call`, `resources/read`, or
`prompts/get` processing). Standalone server-initiated requests of these types
outside notifications **MUST NOT** be implemented.

Although not enforced in the current MCP Data Layer, logically these requests
**MUST** be associated with a valid client-to-server JSON-RPC Request Id.

The operational server-to-client **Ping** is excepted from this restriction.

## Motivation

### Current Specification

The current specification uses **SHOULD** language in the transport layer:

In context of responding to a POST Request in the Streamable HTTP transport [(2025-11-25/basic/transports.mdx:121-L123)](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/2025-11-25/docs/specification/2025-11-25/basic/transports.mdx?plain=1#L121-L123):

> - "The server **MAY** send JSON-RPC _requests_ and _notifications_ before sending the JSON-RPC _response_. These messages **SHOULD** relate to the originating client _request_."

For the optional GET SSE Stream [(2025-11-25/basic/transports.mdx:146-L148)](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/2025-11-25/docs/specification/2025-11-25/basic/transports.mdx?plain=1#L146C1-L148C32):

> - "The server **MAY** send JSON-RPC _requests_ and _notifications_ on the stream."
> - "These messages **SHOULD** be unrelated to any concurrently-running JSON-RPC _request_ from the client."

Although the GET stream allows "unsolicited" requests, its use is entirely optional and cannot be relied upon by MCP Server authors.

### Design Intent

The design intent of MCP Server Requests is to operate reactively **nested within** other MCP operations:

- **Sampling** enables servers to request LLM assistance while processing a tool call, resource request, or prompt
- **Elicitation** enables servers to gather additional user input needed to complete an operation
- **List Roots** enables servers to identify shared storage locations

**Ping** has a special status as it is primarily intended as a keep-alive/health-check mechanism.

For Streamable HTTP Servers this enables SSE Streams to be maintained for extended periods if no Notifications or Requests are available to be sent. For client-to-server Requests they are associable. Future transport implementations will remove the need for dissociated Pings.

The current specification already describes this pattern:

> "Sampling in MCP allows servers to implement agentic behaviors, by enabling LLM calls to occur _nested_ inside other MCP server features."

However, the normative requirements don't enforce this constraint.

### Simplification Benefits

Making this constraint explicit:

1. **Simplifies transport implementations** - Transports don't need to support arbitrary server-initiated request/response flows, which require a persistent connection from Server to Client; they only need request-scoped bidirectional communication
2. **Clarifies user experience** - Users understand that sampling/elicitation happens _because_ they initiated an action, not spontaneously
3. **Reduces security surface** - Ensures client has context for what scope the additional requested information will be used for. This allows clients to make better informed decisions on whether to provide the requested info.
4. **Aligns with practice** - Based on a scan of GitHub all existing implementations already follow this pattern, except one repo owned by the SEP author with a contrived scenario.

## Specification Changes

### 1. Add Warning Blocks to Feature Documentation

**In `client/sampling.mdx` (after existing security warning):**

```markdown
<Warning>

**Request Association Requirement**

Servers **MUST** send `sampling/createMessage` requests only in association with an originating client request (e.g., during `tools/call`, `resources/read`, or `prompts/get` processing).

Standalone server-initiated sampling on independent communication streams (unrelated to any client request) is not supported and **MUST NOT** be implemented. Future transport implementations are not required to support this pattern.

</Warning>
```

**In `client/elicitation.mdx` (after existing security warning):**

```markdown
<Warning>

**Request Association Requirement**

Servers **MUST** send server-to-client requests (such as `roots/list`,
`sampling/createMessage`, or `elicitation/create`) only in association with an
originating client request (e.g., during `tools/call`, `resources/read`, or
`prompts/get` processing).

Standalone server-initiated requests of these types on independent
communication streams (unrelated to any client request) are not supported and
**MUST NOT** be implemented. Future transport implementations are not required
to support this pattern.

</Warning>
```

**In `client/roots.mdx` (in `User Interaction Model` section):**

```markdown
<Warning>

Servers **MUST** send server-to-client requests (such as `roots/list`,
`sampling/createMessage`, or `elicitation/create`) only in association with an
originating client request (e.g., during `tools/call`, `resources/read`, or
`prompts/get` processing).

Standalone server-initiated requests of these types on independent
communication streams (unrelated to any client request) are not supported and
**MUST NOT** be implemented. Future transport implementations are not required
to support this pattern.

</Warning>
```

**In `basic/utilities/ping.mdx` (In `Overview` section):**

```markdown
<Warning>

`ping` is an MCP-level liveness check and **MAY** be sent by either party at
any time on an established session/connection.

In Streamable HTTP, implementations **SHOULD** prefer transport-level SSE
keepalive mechanisms for idle-connection maintenance; `ping` remains available
for protocol-level responsiveness checks.

Request-association requirements for `roots/list`, `sampling/createMessage`,
and `elicitation/create` do not apply to `ping`.

</Warning>
```

### 2. Clarify Transport Layer Constraints

**In `basic/transports.mdx`, POST-initiated SSE streams (line ~121):**

```diff
- The server **MAY** send JSON-RPC _requests_ and _notifications_ before sending the
- JSON-RPC _response_. These messages **SHOULD** relate to the originating client
- _request_.
+ The server **MAY** send JSON-RPC _requests_ and _notifications_ before sending the
+ JSON-RPC _response_. These messages **MUST** relate to the originating client
+ _request_.
```

**In `basic/transports.mdx`, GET-initiated standalone SSE streams (line ~147):**

```diff
- The server **MAY** send JSON-RPC _requests_ and _notifications_ on the stream.
- These messages **SHOULD** be unrelated to any concurrently-running JSON-RPC
- _request_ from the client.
+ The server **MAY** send JSON-RPC _notifications_ and _pings_ on the stream.
+ These messages **SHOULD** be unrelated to any concurrently-running JSON-RPC
+ _request_ from the client, **except** that `roots/list`,
+ `sampling/createMessage`, and `elicitation/create` requests **MUST NOT** be
+ sent on standalone streams.
```

## Backward Compatibility

### Impact Assessment

This change is expected to have **minimal to no impact** on existing implementations:

1. **Common usage patterns are preserved** - Sampling/elicitation within tool execution, resource reading, and prompt handling remain fully supported
2. **No known implementations affected** - Research conducted on GitHub has shown only one implementation of this pattern. This singular implementation is owned by the SEP author.

### What's Disallowed

The following pattern, which was never explicitly documented or recommended, is now explicitly prohibited:

```python
# ❌ PROHIBITED: Standalone server push
async def background_task():
    while True:
        await asyncio.sleep(60)
        # Try to initiate sampling without any client request context
        await session.create_message(...)  # NOT ALLOWED
```

### What Remains Supported

The canonical pattern remains fully supported:

```python
# ✅ SUPPORTED: Sampling during tool execution
@mcp.tool()
async def analyze_data(data: str, ctx: Context) -> str:
    # Request LLM analysis while processing the tool call
    result = await ctx.session.create_message(
        messages=[SamplingMessage(role="user", content=...)]
    )
    return result.content.text
```

## Implementation Guidance

### For Server Implementers

**No changes required** if your server:

- Only uses server-to-client requests within tool handlers
- Only uses server-to-client requests within resource/prompt handlers
- Uses server-to-client requests synchronously as part of processing a client request

**Changes required** if your server:

- Attempts to initiate server-to-client requests on standalone HTTP GET streams
- Attempts to send server-to-client requests requests independent of client operations
- Has background tasks that try to invoke server-to-client requests

Alternative designs will need to be implemented for the "Changes Required" case.

Implementors performing unsolicited server-to-client requests (typically URL Elicitation) immediately following initialization are encouraged to lazily perform these requests within the scope of a client-to-server request that requires that information from the client.

### Timeout Considerations

When an MCP Server initiates a "nested" request inside a client request, the duration of the parent request extends to include the user's response time.

Implementers **MUST** ensure that:

1. Transport timeouts (e.g. HTTP Request Timeout) are sufficient to accommodate "Human-in-the-loop" delays, which may be unbounded.
2. Short timeouts enforced by infrastructure (e.g. Load Balancers) may result in
   connection termination before the user responds. For Streamable HTTP,
   transport-level SSE keepalive mechanisms **SHOULD** be used to keep
   connections alive and reset timers; `ping` requests **MAY** additionally be
   used for protocol-level responsiveness checks.

### For Client Implementers

**No changes required** - Clients should already handle sampling/elicitation requests in the context of their own outbound requests. Potential to simplify implementations if out-of-band is currently supported.

Clients recieving server-to-client requests with no associated outbound request **SHOULD** respond with a `-32602` (Invalid Params) error.

### For Transport Implementers

Future transport implementations can rely on the guarantee that:

- Sampling/elicitation requests only occur within the scope of a client-initiated request
- Transports don't need to support arbitrary server-initiated request/response flows on standalone channels
- Request correlation and lifecycle management is simplified

## Timeline

(This SEP intends to serve as a public notice of the change prior to future protocol versions that will not be compatible with this usage)

## Alternatives Considered

### 1. Soft Deprecation

Use **SHOULD NOT** language to discourage but not prohibit the pattern.

**Rejected because:** The behavior was never intentionally supported, and leaving it ambiguous prevents transport simplification.

### 2. Keep Current Ambiguity

Leave the existing **SHOULD** language unchanged.

**Rejected because:** This blocks future transport implementations and leaves implementers uncertain about whether the pattern is supported.

### 3. Create a Capability Flag

Add a `sampling.standalone` or similar capability for servers that want this behavior.

**Rejected because:** This adds complexity for a use case with no known demand, and contradicts the "nested" design principle.

## References

- Current sampling documentation: `/specification/draft/client/sampling.mdx`
- Current elicitation documentation: `/specification/draft/client/elicitation.mdx`
- Transport specification: `/specification/draft/basic/transports.mdx`
- User interaction model discussion in client concepts documentation
