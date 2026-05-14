# SEP-2145: Standardize `tools/call` Failure Reporting

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-01-23
- **Author(s)**: Konstantin Konstantinov (@KKonstantinov)
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2145
- **Related**:
  - SEP-1303: Input Validation Errors as Tool Execution Errors (`seps/1303-input-validation-errors-as-tool-execution-errors.md`)
  - Issue discussion: https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1303
  - Nov 7 comment motivating this SEP: https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1303#issuecomment-3501234096

## Abstract

This SEP proposes clarifying and extending `tools/call` error handling so that more tool-invocation failure modes are reported as **Tool Execution Errors** (i.e., a successful JSON-RPC response containing a `CallToolResult` with `isError: true`), rather than as JSON-RPC **Protocol Errors**.

Building on SEP-1303 (input validation errors), this SEP focuses on: (1) **tool resolution** failures (unknown tool names, tools that are present but not callable due to server policy/disablement), and (2) **output validation** failures for tools that declare an `outputSchema` but return missing or non-conforming `structuredContent`.

The goal is to make these failures consistently visible to language models (and other clients), improving self-correction and recovery behavior.

## Motivation

SEP-1303 established that tool input validation failures are most useful when returned as tool execution errors, because models can read the message and self-correct.

In practice, additional `tools/call` failure modes are similarly actionable (or at least strategically useful) to surface to the model:

- **Unknown tool**: When the model calls a tool name that does not exist (e.g., stale tool list, wrong name, tool name produced by another tool), returning a tool execution error allows the model to select an alternative tool or re-list tools.
- **Tool not callable**: Servers may have tools that are temporarily unavailable, restricted, or disabled by policy. Returning a tool execution error allows the model to pick an alternative path or avoid repeated failing attempts.
- **Output schema failures**: If a tool declares `outputSchema` but fails to produce valid `structuredContent`, returning a tool execution error allows the model/client to fall back to unstructured output, retry with different parameters, or report a clear diagnostic.

Today, the draft schema documentation states that "errors in finding the tool" should be protocol errors, and SEP-1303 retained that categorization when it went Final. This SEP proposes reversing that decision so that resolution failures are model-visible. The current split causes inconsistent implementations and pushes "out-of-the-box" behavior into client-specific policy, which many hosts will not implement.

## Specification

### Terminology

- **Protocol Error**: A JSON-RPC error response (`error` object) indicating a failure to process the request at the JSON-RPC / MCP method layer (e.g., invalid JSON-RPC, invalid request shape, method not found, server internal failure before a method result can be constructed).
- **Tool Execution Error**: A successful JSON-RPC response (`result` object) that contains a `CallToolResult` with `isError: true`, where the `content` describes the failure.
- **Tool Invocation**: The conceptual operation of attempting to run the named tool with provided `arguments` after the server has accepted a well-formed `tools/call` request.

### Normative requirements (server behavior)

Given a `tools/call` request that satisfies the `CallToolRequest` schema (i.e., it is not malformed at the protocol level), servers:

1. **MUST** report tool input validation failures as Tool Execution Errors (extending the categorization established by SEP-1303).
   - This includes failures of JSON Schema validation against the tool's `inputSchema` as well as additional programmatic validation (ranges, invariants, cross-field checks, etc.).

2. **MUST** report tool resolution failures as Tool Execution Errors, including:
   - **Unknown tool**: `params.name` does not match any callable tool.
   - **Tool not callable**: the tool exists conceptually but cannot be executed (e.g., disabled, unavailable, policy-restricted).

3. **MUST** report tool execution failures as Tool Execution Errors, including:
   - Exceptions thrown by the tool implementation.
   - Timeouts or server-internal aborts that occur during tool execution (if the server can still return a `CallToolResult`). Client-initiated cancellation continues to follow the [cancellation utility](/specification/draft/basic/utilities/cancellation).

4. **SHOULD** report output validation failures as Tool Execution Errors when a tool declares an `outputSchema`, including:
   - `structuredContent` is missing when the server/tool intended to provide structured output.
   - `structuredContent` is present but does not conform to `outputSchema`.
   - `structuredContent` is present but is not an object (root must be `type: "object"`).

   Note: `tools.mdx` already requires "Servers MUST provide structured results that conform to `outputSchema`" and "Clients SHOULD validate." This requirement is defense-in-depth: when a server fails to conform, it SHOULD also report the failure as a Tool Execution Error rather than returning silently invalid output.

5. **MUST** use Protocol Errors only for protocol-level failures, such as:
   - Malformed requests that fail to satisfy the `CallToolRequest` schema (e.g., missing `params`, wrong types).
   - JSON-RPC method-level failures (e.g., `tools/call` method not supported / not implemented).
   - Server failures that prevent constructing a `CallToolResult` at all (e.g., unrecoverable internal errors before tool invocation can be represented as a result).

### Error message guidance (non-normative)

When returning Tool Execution Errors, servers **SHOULD** include a short, actionable message in the first `content` item (typically a `text` content block). Recommended patterns:

- Unknown tool: `Unknown tool: <name>. Re-run tools/list and retry.`
- Tool not callable: `Tool unavailable: <name>. Reason: <reason>.`
- Input validation: `Invalid input: <tool_name>. <details>.`
- Output validation: `Tool produced invalid structured output for <tool_name>: <details>.`

Servers **SHOULD** avoid leaking sensitive policy details in messages.

### Examples

#### Protocol error (malformed request)

If the request is invalid at the `CallToolRequest` schema level (e.g., missing `params.name`, invalid `params` type, etc.), the server returns a JSON-RPC error response.

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "error": {
    "code": -32602,
    "message": "Invalid params"
  }
}
```

#### Tool execution error (unknown tool)

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Unknown tool: invalid_tool_name. Re-run tools/list and retry."
      }
    ],
    "isError": true
  }
}
```

#### Tool execution error (tool not callable / disabled / policy-restricted)

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Tool unavailable: update_flight_details. This tool is disabled or policy-restricted."
      }
    ],
    "isError": true
  }
}
```

#### Tool execution error (output schema validation failure)

```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Tool produced invalid structured output for get_weather: structuredContent did not conform to outputSchema."
      }
    ],
    "isError": true
  }
}
```

### Specification text changes (draft targets)

This SEP intends to update the draft specification text in:

- `docs/specification/draft/server/tools.mdx` (Error Handling section) to:
  - Treat "Unknown tools" (tool name resolution) as a Tool Execution Error for `tools/call`.
  - Add explicit categories for "tool not callable" and "output schema validation failures" as Tool Execution Errors.
  - Keep Protocol Errors focused on malformed `CallToolRequest` and server-level failures.
- `schema/draft/schema.ts` documentation for `CallToolResult.isError` to remove/adjust language suggesting that "errors in finding the tool" should be protocol errors, aligning it with the above requirements.
- `schema/draft/schema.ts` documentation for `InvalidParamsError` (Tools bullet) and the associated example files (`examples/InvalidParamsError/unknown-tool.json`, `examples/InvalidParamsError/invalid-tool-arguments.json`) so the generated Schema Reference matches.

#### Proposed draft wording for `docs/specification/draft/server/tools.mdx` (Error Handling)

```md
## Error Handling

Tools use two error reporting mechanisms:

1. **Protocol Errors**: Standard JSON-RPC errors for protocol-level issues like:
   - Malformed requests (requests that fail to satisfy [CallToolRequest schema](/specification/draft/schema#calltoolrequest))
   - Server errors (when the server cannot return a tool result)
   - Unsupported methods (e.g., server does not implement `tools/call`)

2. **Tool Execution Errors**: Reported in tool results with `isError: true`:
   - Tool resolution failures (unknown tool name)
   - Tool availability failures (disabled, unavailable, policy-restricted)
   - Input validation errors (e.g., date in wrong format, value out of range; arguments do not match tool `inputSchema`)
   - Output validation errors (e.g., tool declared `outputSchema` but returned missing or non-conforming `structuredContent`)
   - API failures
   - Business logic errors

**Tool Execution Errors** contain actionable feedback that language models can use to self-correct and retry with adjusted parameters or alternative strategies.
**Protocol Errors** indicate issues with the request structure or method support itself.
Clients **SHOULD** provide tool execution errors to language models to enable self-correction.
Clients **MAY** provide protocol errors to language models, though these are less likely to result in successful recovery.
```

#### Proposed adjustment to `CallToolResult.isError` documentation (draft schema)

This SEP proposes changing the `CallToolResult.isError` documentation to treat "errors in finding the tool" as a Tool Execution Error for `tools/call` (i.e., return `CallToolResult` with `isError: true`) when the request itself is well-formed.

## Rationale

- **Proposes a clearer direction for SDK behavior**: As noted in the Nov 7 discussion, the Python SDK returns `CallToolResult` with `isError: true` for unknown tools, disabled tools, and various output schema failures. The TypeScript SDK previously did the same, but [typescript-sdk#1389](https://github.com/modelcontextprotocol/typescript-sdk/pull/1389) (merged March 2026) reverted it to protocol errors to conform with the current spec text. This SEP would reverse that direction, making tool execution errors the normative behavior and reducing host-specific divergence.
- **Improves model recovery**: Even when the model cannot "fix" the underlying cause (e.g., tool disabled), it can adapt (use a different tool, ask the user, or take a different path). Hiding these failures behind protocol errors often prevents that.
- **Preserves protocol integrity**: Protocol errors remain appropriate for malformed requests and method-level failures; this SEP does not attempt to redefine JSON-RPC semantics.

## Backward Compatibility

This SEP does not change JSON-RPC framing or introduce new required fields.

However, it is a **behavioral change** for servers that currently return Protocol Errors for tool resolution and output validation failures. Clients that rely on a JSON-RPC error response for these cases will need to handle `CallToolResult.isError: true` equivalently.

Notably, [typescript-sdk#1389](https://github.com/modelcontextprotocol/typescript-sdk/pull/1389) (merged March 2026) recently changed the TypeScript SDK to return protocol errors for unknown tools, conforming to the current spec. Accepting this SEP would require reverting that change. [python-sdk#1872](https://github.com/modelcontextprotocol/python-sdk/pull/1872) proposes a similar alignment for the Python SDK and would also need to be reconsidered.

Mitigations:

- Clients already need to handle `isError: true` for tool input validation errors per SEP-1303; extending that handling to the additional scenarios should be straightforward.

## Security Implications

- Returning tool execution errors for "tool not callable" can leak policy details if the server includes overly specific messages. Servers **SHOULD** provide user-appropriate, least-privilege error text.
- Returning tool execution errors for unknown tools does not introduce a new capability leak beyond what `tools/list` already provides, but implementations should avoid enumerating available tool names in error text unless appropriate.

## Reference Implementation

The Python SDK currently wraps exceptions and returns `CallToolResult` with `isError: true` for unknown tools and other failures. The TypeScript SDK previously did the same, but [typescript-sdk#1389](https://github.com/modelcontextprotocol/typescript-sdk/pull/1389) (merged March 2026) reverted it to protocol errors for unknown tools to conform with the current spec text. Accepting this SEP would require re-reverting the TypeScript SDK.

This SEP's reference implementation would be a documentation + SDK conformance update:

- Update the draft tools error handling documentation and schema documentation as described above.
- Add/adjust conformance tests (where available) to assert:
  - unknown tool → `CallToolResult.isError: true`
  - tool not callable (policy/disabled) → `CallToolResult.isError: true`
  - output schema mismatch → `CallToolResult.isError: true`

## Alternatives Considered

- **Keep unknown tools as Protocol Errors**: Rejected because "unknown tool" is not a JSON-RPC method-level failure; it is a tool-invocation outcome that is often recoverable by the model.
- **Let clients decide what to pass to the model**: Rejected as insufficient for interoperability; many hosts will not implement bespoke forwarding/translation logic.

## Open Questions

- Should output schema failures be **MUST** (instead of SHOULD) be surfaced as Tool Execution Errors when `outputSchema` is declared?
- Should the spec standardize a machine-readable error code/type inside `CallToolResult` (beyond `isError`) to distinguish unknown tool vs validation vs execution failure?

## Acknowledgments

All participants in https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1303
