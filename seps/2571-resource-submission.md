# SEP-2571: Resource Submission — Client-to-Server Resource Creation

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-04-14
- **Author(s)**: Chris Welker (@cswelker)
- **Sponsor**: None (seeking sponsor)
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2571

## Abstract

This SEP proposes adding `resources/create` and `resources/delete` methods to the MCP specification, allowing clients to submit resources to a server and receive a URI back. The current resources API is read-only from the client's perspective — servers expose resources, clients consume them. This proposal makes the interface bidirectional, enabling agents to deliver content (prompts, configs, data) to a server without requiring custom tools. This unlocks a class of coordination patterns — multi-agent handoffs, job orchestration, async pipelines — that the current spec cannot address with a standard interface.

## Motivation

The current MCP resources spec is read-only from the client's perspective. Servers expose resources; clients list and read them. This works well for static, server-owned content but breaks down in agentic and multi-step orchestration scenarios where a client needs to *deliver* content to a server for later use.

### Concrete use case: job orchestration

Consider an orchestrator MCP server that accepts job definitions — configs, prompt templates, data payloads — from clients. When a job is registered, its associated resources must be stored server-side so the job can execute later, independently of the submitting client. Today this requires a custom tool (e.g. `upload_prompt`, `store_config`). This works but forces every orchestration system to reinvent the same pattern with a different interface.

### The broader pattern: agent-to-agent coordination

Multi-agent systems frequently need to pass content between agents via a shared server:

- Agent A submits a document for Agent B to process
- An orchestrator stores prompt templates that worker agents will use at runtime
- A client pre-loads context that a long-running job will need after the client disconnects
- A pipeline stage deposits output for the next stage to consume

In all these cases, the client is the *source* of a resource, not just a consumer. The current spec has no standard way to express this.

### Why a standard primitive matters

Custom tools work. But they push a general coordination primitive into application-specific territory. Every orchestrator, every async job runner, every agent handoff system ends up building the same thing with slightly different interfaces, none of which compose. `resources/create` is the natural complement to `resources/read`. The concept of a URI-addressable resource already exists in the spec — this proposal makes it writable.

## Specification

### `resources/create`

Submits a resource to the server. The server stores it and returns a URI that can be used in any subsequent context where a resource URI is accepted.

#### Request

```json
{
  "method": "resources/create",
  "params": {
    "name": "prospect-research-prompt",
    "mimeType": "text/plain",
    "content": "Research the following company and extract...",
    "metadata": {
      "ttl": 3600,
      "tags": ["prompts", "prospecting"]
    }
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Human-readable name for the resource |
| `mimeType` | string | yes | MIME type of the content (`text/plain`, `application/json`, `application/octet-stream`, etc.) |
| `content` | string | yes | Resource content. UTF-8 text, or base64-encoded binary when `mimeType` is not a text type |
| `metadata` | object | no | Arbitrary key-value pairs. Servers may define well-known keys (e.g. `ttl`, `tags`). Servers that do not recognize a key MUST ignore it |

#### Response

```json
{
  "uri": "resource://prompts/prospect-research-prompt/abc123",
  "name": "prospect-research-prompt",
  "mimeType": "text/plain",
  "createdAt": "2026-04-14T00:00:00Z"
}
```

The returned `uri` is the canonical reference for this resource. It MUST be stable for at least the duration of the server session. Servers MAY expire resources after the TTL specified in metadata, if provided.

### `resources/delete`

Deletes a resource previously created by the client.

#### Request

```json
{
  "method": "resources/delete",
  "params": {
    "uri": "resource://prompts/prospect-research-prompt/abc123"
  }
}
```

#### Response

Empty result on success. Servers MUST return an error if the URI does not exist or the client does not have permission to delete it.

### Capability negotiation

Servers that support resource submission MUST advertise this in their capabilities:

```json
{
  "capabilities": {
    "resources": {
      "create": true,
      "delete": true
    }
  }
}
```

Clients MUST check for these capabilities before issuing `resources/create` or `resources/delete`.

### Binary content

When submitting binary content, the client MUST base64-encode the `content` field and set `mimeType` to a non-text type. Servers MUST decode it accordingly. This follows the same convention as the existing `BlobResourceContents` type.

### Error handling

Servers SHOULD return standard JSON-RPC error codes:

- `-32602` (Invalid params) — missing required fields or malformed content
- `-32000` (Server error) — storage failure or quota exceeded
- A server-defined code for permission errors on `resources/delete`

## Rationale

### Why not a custom tool?

Custom tools work for single implementations but do not compose. If resource submission is part of the spec, any compliant client can submit resources to any compliant server without prior coordination. This is the same argument that justified standardizing `tools/call` rather than leaving every server to define its own invocation convention.

### Why `resources/create` rather than `resources/write` or `resources/upload`?

`create` is consistent with the HTTP/REST pattern (`POST` to create a new resource, receive a reference back). `write` implies updating an existing resource at a known URI, which is a different operation. `upload` is informal. `create` is unambiguous.

### Why allow `metadata`?

Servers have legitimate reasons to accept hints — TTL, tags, access scope — without the spec needing to enumerate them. Making `metadata` an open object with defined ignore-unknown semantics follows the same pattern as `_meta` elsewhere in the spec.

### Alternatives considered

**Reuse the `prompts` primitive.** The `prompts` primitive is close but is server-defined — servers publish named prompt templates, clients fill them in. It does not support client-submitted content. Extending it to handle arbitrary client submissions would distort its semantics.

**Use a tool.** Works today, but produces N incompatible interfaces. Ruled out as a standard approach for the reasons above.

**Server-defined upload endpoints outside MCP.** Breaks the single-transport model and requires clients to discover and authenticate against a separate channel.

## Backward Compatibility

This proposal adds new methods; it does not modify existing ones. Clients that do not use `resources/create` or `resources/delete` are unaffected. The capability negotiation mechanism ensures clients can detect whether a server supports the new methods before using them. No breaking changes.

## Security Implications

**Storage limits.** Servers accepting arbitrary client-submitted content must enforce size and quota limits. The spec should require servers to return an appropriate error (suggest `-32000`) when limits are exceeded.

**Access control.** Resources created by one client should not be readable by arbitrary other clients unless the server explicitly allows it. The spec does not prescribe the access model but SHOULD require that the URI returned is not trivially guessable (e.g. no sequential IDs).

**Content injection.** Servers that later serve submitted content to other agents should treat it as untrusted input. This is particularly relevant in agentic pipelines where a submitted resource may be read directly into an LLM context — a malicious submission could attempt prompt injection against a downstream agent. Servers SHOULD surface the submitting client's identity alongside the resource when serving it, so consumers can apply appropriate trust levels.

**Deletion scope.** `resources/delete` MUST be scoped so a client can only delete resources it created, unless the server explicitly grants broader permissions.

## Reference Implementation

The `resources/create` pattern is already implemented in practice by job orchestration systems that require prompt and config payloads to be stored server-side before a job executes. The interface proposed here generalizes what those systems do with custom tools today.

A reference implementation will be built on [ZeroMCP](https://github.com/probeo-io/antidrift/tree/main/zeromcp) (`@antidrift/zeromcp`, npm), a zero-config MCP runtime that already supports HTTP transport and pluggable tool handlers. ZeroMCP is MIT-licensed and in active use. The implementation will be linked here once published.

## Open Questions

1. Should `resources/create` support updating an existing resource (idempotent re-submission by name), or should each call always create a new URI? The current proposal always creates a new URI; an `upsert` variant could be a follow-on.
2. Should `resources/list` return client-created resources alongside server-defined ones, or should there be a filter? The current proposal does not modify `resources/list` behavior — servers may include or exclude submitted resources at their discretion.
3. Should TTL be a first-class field rather than buried in `metadata`? Open to community input.
