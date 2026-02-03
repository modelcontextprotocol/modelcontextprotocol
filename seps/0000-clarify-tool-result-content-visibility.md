# SEP-0000: Clarify Tool Result Content and Model Visibility

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-02-03
- **Author(s)**: Kyrubeno (@kyrubeno)
- **Sponsor**: None (seeking sponsor)
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/0000
- **Related Issues**: https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1624

## Abstract

This SEP clarifies the intended usage and model visibility of `CallToolResult.content` and
`CallToolResult.structuredContent`. It formalizes the distinction between model-oriented output
(`content`) and machine-oriented output (`structuredContent`), provides guidance on semantic
alignment when both fields are present, and clarifies client behavior for selecting which field to
expose to models. The clarification is especially important now that MCP Apps is an official
extension, where tool results may drive interactive UI experiences and should not inadvertently
flood model context. The changes are non-breaking and do not modify the protocol surface area.

## Motivation

Since `structuredContent` was introduced in PR #371 and back-compat relaxed in PR #559, servers and
clients have implemented divergent interpretations of how `content` and `structuredContent` should
be used:

- Clients disagree on which field to pass to models, with some preferring `content`, others
  preferring `structuredContent`, and some forwarding both.
- Server authors have returned different semantic information in each field, causing inconsistent
  behavior across clients.
- Tool authors receive mixed guidance, including inspector warnings that assume `content` must be a
  JSON-serialized copy of `structuredContent`.

The official MCP Apps extension
(https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/) makes the ambiguity more
urgent. Tools can now return interactive UIs and richer data for hosts to render. Without explicit
guidance, model context can be flooded with UI-oriented data or the UI can lack a reliable
structured payload. The ext-apps issue #380 and related client issues (for example, python-sdk
#1796 and vscode #290063) highlight persistent confusion about what is model-visible and what is
host-only.

This SEP consolidates the consensus from issue #1624 and related discussions: `content` is the
model-facing representation, `structuredContent` is for programmatic or UI use, and clients should
choose the appropriate field for their use case rather than forwarding both verbatim.

## Specification

This SEP proposes the following clarifications to the MCP specification (draft):

1. **Tool result audiences**

   - `content` is the model-oriented representation of a tool result, optimized for readability
     and token efficiency. It is the default field to pass into model context for conversational
     and agent experiences.
   - `structuredContent` is the machine-oriented representation for programmatic use, code
     generation, typed orchestration, and UI hydration (including MCP Apps).

2. **Semantic alignment**

   - When both `content` and `structuredContent` are present, they SHOULD be semantically
     equivalent (same information, different presentation). `content` may summarize or
     textualize `structuredContent` without listing every field verbatim, but it SHOULD NOT
     contradict it.
   - For backwards compatibility, tools that return `structuredContent` SHOULD also return a
     `content` representation of the same information. JSON-serialized text is acceptable, but
     not required.

3. **Client selection guidance**

   - Clients SHOULD choose the field that best matches their experience:
     - Conversational/agent UX: prefer `content`.
     - Programmatic/code mode: prefer `structuredContent`.
   - Clients SHOULD NOT forward both fields verbatim to the model as separate inputs.

4. **MCP Apps and model visibility**

   - For MCP Apps hosts, `content` is the model-visible summary, while `structuredContent` and
     `_meta` are typically used for UI rendering or host-specific metadata.
   - Apps can update model context explicitly using the MCP Apps API (e.g., `ui/update-model-context`).

5. **Output schema documentation**

   - The output schema section should emphasize that `outputSchema` applies to
     `structuredContent`, while `content` remains a model-oriented representation.

## Rationale

This proposal aligns the spec with the original design intent of PR #371 (structured output for
programmatic tool use) and the back-compat adjustments in PR #559 (retaining `content`). It resolves
cross-client inconsistencies and prevents the same tool result from being interpreted differently
depending on which field a client prefers.

With MCP Apps now official, clarifying model visibility is essential. UI hosts need a reliable,
structured payload for rendering, while models benefit from concise summaries rather than raw UI
data. Explicit guidance reduces token waste, improves context quality, and avoids inadvertent
exposure of UI-only data to the model.

Alternatives such as introducing new audience annotations or side-channel fields were considered
but rejected for this SEP due to higher complexity and breaking-change risk. The goal is to clarify
existing fields without adding new protocol surface area.

## Backward Compatibility

This SEP introduces no protocol-level breaking changes. Existing servers and clients remain valid.
The clarifications are additive guidance intended to reduce ambiguity. Implementations that already
return only `structuredContent` or only `content` continue to be allowed, though tool authors are
encouraged to provide both when feasible for maximum compatibility.

## Security Implications

Clarifying model visibility reduces accidental leakage of large or sensitive UI data into model
context. No new protocol features or attack surfaces are introduced.

## Reference Implementation

This SEP is implemented through documentation updates in the specification. SDK and inspector
updates are expected to follow but are not required for adoption.

## Alternatives Considered

- **Audience annotations or explicit visibility flags**: would require new protocol fields and
  capability negotiation.
- **Deprecating one field**: would break existing implementations.
- **Treating `structuredContent` as a purely host-only side channel**: would conflict with
  programmatic/code-mode use cases that benefit from structured model inputs.

## Open Questions

- Should future extensions define explicit audience selectors (model/host/user) for tool results?
- Should empirical benchmarks on model performance with structured vs unstructured tool outputs be
  published to guide best practices?
