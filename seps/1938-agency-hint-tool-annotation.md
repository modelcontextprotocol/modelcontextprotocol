# SEP 1938: Add `agencyHint` tool annotation

## Preamble

- **SEP Number**: 1938
- **Title**: Add `agencyHint` tool annotation
- **Authors**: Rajesh Kamisetty
- **Type**: Standards Track
- **Status**: draft
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1938
- **Discussion**: https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1792

## Abstract

This SEP proposes a new optional boolean tool annotation, `agencyHint`, on the `ToolAnnotations` interface in the Model Context Protocol (MCP) specification.

The goal of `agencyHint` is to tell clients that a tool represents an _agentic_ capability: it may perform multi-step reasoning, planning, or autonomous decision-making toward a goal, rather than a single atomic operation. This hint lets clients differentiate agent-like tools from simple procedural ones, enabling better UX patterns (e.g., confirmation flows, progress UI, or monitoring) without changing the underlying protocol semantics.

## Motivation

MCP already defines several tool annotations—such as `destructiveHint`, `idempotentHint`, `openWorldHint`, `readOnlyHint`, and `taskHint`—that communicate key behavioral and UX-related characteristics of tools. None of these, however, express whether a tool itself is _agentic_.

As agentic tools become more common, clients increasingly need to treat them differently from simple “call-and-return” tools:

- A tool that orchestrates a long-running workflow with multiple sub-operations may warrant additional confirmation, monitoring, or logging compared to a single API call.
- Agent-like tools may take initiative, explore options, or perform multiple actions under a single invocation, which can surprise users if surfaced with the same UX as a simple read-only tool.
- Some clients may wish to group, highlight, or gate agentic tools in their UI (e.g., prompting users before enabling them, or applying stricter human-in-the-loop policies).

Today, there is no explicit, machine-readable way for a client to distinguish “agentic” tools from simple tools based on the specification alone. `agencyHint` fills this gap in a backward-compatible, advisory way.

## Specification

### New annotation

Extend the `ToolAnnotations` interface with an optional `agencyHint` boolean field:

```ts
interface ToolAnnotations {
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
  readOnlyHint?: boolean;
  taskHint?: "never" | "optional" | "always";
  agencyHint?: boolean; // NEW: Indicates whether the tool exhibits agentic behavior
  title?: string;
}
```

### Semantics

- `agencyHint?: boolean`
  - When present and set to `true`, this signals that the tool may perform:
    - Multi-step reasoning or planning,
    - Multi-step or long-running operations,
    - Goal-directed behavior that may result in multiple underlying actions.
  - When omitted or set to `false`, clients should assume the tool is _not_ agentic and behaves as a simple, single-step operation (subject to other hints like `destructiveHint` and `openWorldHint`).

This hint is purely advisory: it does not alter protocol-level behavior, message formats, or error semantics. It is intended for clients and maintainers to inform UX, risk posture, and orchestration strategies.

### Guidance for tool authors

Tool authors _should_ set `agencyHint: true` when:

- The tool internally coordinates multiple sub-steps or API calls as part of a single invocation.
- The tool encapsulates an internal “agent loop” (e.g., plan–act–observe cycles, tool-chaining, or autonomous retries).
- The tool can take non-trivial action on behalf of the user (even if it is not destructive) without the user necessarily seeing each sub-step.

Tool authors _may_ leave `agencyHint` unset (or `false`) when:

- The tool is a straightforward, single API call or single transformation.
- The tool’s behavior is entirely captured by other hints (`destructiveHint`, `readOnlyHint`, etc.) and does not involve agent-like orchestration.

### Guidance for clients

Clients _may_ use `agencyHint` to:

- Apply stronger confirmation or review flows before invoking agentic tools.
- Provide richer UX (progress UI, streaming logs, or “activity feeds”) for long-running, multi-step operations.
- Group or label agentic tools distinctly (e.g., “agents” vs “utilities”) in tool pickers or configuration panels.
- Combine `agencyHint` with other hints to calibrate risk:
  - `agencyHint: true` + `destructiveHint: true` → candidate for stricter human-in-the-loop controls.
  - `agencyHint: true` + `readOnlyHint: true` → lower risk, but potentially still long-running.

Clients _must not_ assume that a missing `agencyHint` implies anything other than “no explicit claim” of agentic behavior. In the absence of this hint, clients should fall back to their default behaviors.

## Rationale

### Why a dedicated hint?

An explicit `agencyHint` provides a simple, composable signal:

- It avoids overloading existing hints such as `destructiveHint` or `openWorldHint`, which capture _what_ a tool can affect, not _how_ it behaves internally.
- It allows tools to be both agentic and non-destructive, or non-agentic and destructive; these are orthogonal concerns.
- It aligns with MCP’s existing pattern of lightweight, advisory hints that help clients adapt UX and safety posture without changing the protocol.

### Alternatives considered

- **Deriving “agency” from tool names or descriptions**  
  This is brittle, client-specific, and hard to standardize. A simple boolean annotation is easier to reason about and more robust across implementations.
- **Introducing a richer “tool type” enum**  
  While an enum could encode more nuance (e.g., `tool`, `agent`, `workflow`), it increases complexity and raises migration questions. A single boolean hint is a minimal, incremental step which does not preclude future evolution if the ecosystem needs more granularity.
- **Encoding agentic behavior via `taskHint`**  
  `taskHint` controls how often a tool should be used in task-oriented flows, not whether the tool itself _is_ an agent. Keeping these concerns separate leads to clearer semantics.

### Interoperability and ecosystem impact

- The hint is optional and advisory, so existing servers and clients remain valid.
- Clients that do not understand `agencyHint` can ignore it.
- Clients that _do_ understand `agencyHint` gain a portable, standardized way to treat agentic tools differently, which should improve user trust and safety.

## Backward Compatibility

The change is strictly additive:

- `agencyHint` is an optional field on an existing interface.
- Existing tools are unaffected and remain valid.
- Existing clients that do not recognize `agencyHint` will continue to function as before.
- There is no impact on wire formats, versioning, or backwards compatibility guarantees of the MCP specification.

No migration steps are required for existing tools; authors can adopt the hint incrementally.

## Reference Implementation

A reference implementation for `agencyHint` should include:

1. **Specification updates**
   - Extend the ToolAnnotations definition in the MCP specification to include `agencyHint`.
   - Add narrative text describing intended semantics, guidance for tool authors, and guidance for clients.

2. **SDK updates**
   - Update at least one official MCP SDK (e.g., TypeScript and/or Python) to:
     - Expose `agencyHint` on tool-definition types.
     - Propagate the field into any generated schema or metadata.
   - Add tests confirming that tools with `agencyHint` serialize and deserialize correctly.

3. **Example servers and clients**
   - Update example MCP servers to demonstrate tools with `agencyHint: true` and `false`.
   - Update example clients to show how `agencyHint` might influence:
     - Tool catalog UI (grouping/labeling “agents”),
     - Invocation confirmation flows,
     - Monitoring or progress displays for agentic tools.

Completion of these steps, and adoption in at least one client and one server, should be considered sufficient for marking the SEP’s reference implementation as complete.

## Security Implications

`agencyHint` does not introduce any new protocol-level capabilities or message types. However, it has important implications for how clients might manage risk:

- **Improved risk signaling**  
  Agentic tools can perform more complex sequences of actions under a single invocation. Being able to label these tools explicitly gives clients a hook to require stronger user consent, richer logging, or more conservative defaults.

- **No security guarantees**  
  `agencyHint` is advisory, not enforced. A malicious or careless server could mislabel tools. Clients should treat `agencyHint` as _one_ signal among many and continue to apply their own trust and policy decisions.

- **Safer UX by default**  
  Clients that adopt `agencyHint` can:
  - Prompt users more clearly when invoking agentic tools,
  - Make it easier to disable or sandbox such tools,
  - Surface clearer explanations of what an agentic tool is allowed to do.

Overall, `agencyHint` aims to _reduce_ risk by making agentic behavior more visible and configurable, without weakening existing security properties.
