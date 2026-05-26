# SEP-2793: Tool Risk Metadata

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-05-27
- **Author(s)**: walbis (@walbis)
- **Issue**: #2793

| SEP Number        | #2793                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------- |
| **Title**         | Tool Risk Metadata                                                                           |
| **Author**        | walbis                                                                                       |
| **Sponsor**       | _seeking_                                                                                    |
| **Status**        | Draft                                                                                        |
| **Created**       | 2026-05-27                                                                                   |
| **Specification** | MCP 2025-11-25 (draft)                                                                       |
| **Prototype**     | https://github.com/walbis/karai (`config/tool_policies.yaml` — manual catalogue, ~30 tools)  |
| **PR**            | #2793 (https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2793)                                                                                    |
| **SDKs**          | TBD                                                                                          |

## Abstract

Extend `ToolAnnotations` with structured, machine-readable **risk metadata** —
graded `riskLevel`, action `category`, `blastRadius`, `reversibility`,
`sideEffects`, `approvalRecommendation`, and `minTrustLevel` — so MCP clients
can make consistent allowlist and approval decisions across tools without each
client rebuilding the same bespoke per-tool catalogue.

All fields are optional and purely additive; clients that don't understand
them are unaffected, and servers that don't declare them work unchanged.

## Motivation

`ToolAnnotations` already carries boolean hints (`readOnlyHint`,
`destructiveHint`, `idempotentHint`, `openWorldHint`). Those answer
**yes/no** questions; they don't answer **how risky / what scope / how
reversible**. In practice every MCP-consuming agent platform reinvents the
same graded vocabulary:

- **KARAI**'s `config/tool_policies.yaml` (~30 tools) carries
  `min_level`, `risk_level` (`low|medium|high|critical`), `category`
  (`read|observe|mutate|delete|destroy|utility`), `destructive`, and
  `approval_escalation`.
- Other consumers (Claude Desktop, Cursor, Cline, Continue, OpenDevin, …)
  ship analogous allowlists in YAML/JSON config or hard-coded heuristics.
- Tool authors have no standard place to declare *intended* risk — the
  `description` field is free-form, can't be parsed, and isn't trusted.

This causes:

1. **Approval fatigue / silent escalation.** When consumers default too
   permissive, mutating tools are auto-approved; when too strict, read-only
   tools spam the operator. Without a graded scale this can't be tuned per
   category.
2. **N×M reinvention.** Every (consumer × MCP server) pair re-classifies
   the same tools. A community catalogue (CycloneDX-style for tools)
   only works if there's a standard shape to fill in first.
3. **Compliance gap.** Enterprise audit / BDDK / SOC2 reviewers ask
   "which tools require approval, why?" — there's no standard answer.

`destructiveHint` *almost* fills this gap but is binary: a tool that
deletes one row and a tool that drops a whole namespace get the same
flag. This proposal grades the existing direction rather than replacing it.

## Specification

Extend `ToolAnnotations` in `schema/draft/schema.ts`:

```typescript
export interface ToolAnnotations {
  // ── existing fields (unchanged) ─────────────────────────────────
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;

  // ── new: graded risk metadata (all optional) ────────────────────

  /**
   * Graded risk classification, complementing the binary
   * `destructiveHint`. Clients use this to decide approval policy.
   */
  riskLevel?: "low" | "medium" | "high" | "critical";

  /**
   * Action category. Clients use this for default policy and UI.
   * `read` and `observe` are non-mutating; `mutate` changes state;
   * `delete` removes specific items; `destroy` removes broad scopes.
   */
  category?: "read" | "observe" | "mutate" | "delete" | "destroy" | "utility";

  /**
   * Scope of an undesired outcome:
   * `item` — single resource;
   * `namespace` — a collection / project;
   * `cluster` — whole cluster or account;
   * `organization` — multi-tenant impact;
   * `global` — service-wide impact.
   */
  blastRadius?: "item" | "namespace" | "cluster" | "organization" | "global";

  /**
   * Whether the effect can be undone:
   * `auto` — tool is idempotent or has built-in undo;
   * `manual` — operator can roll back via a separate action;
   * `none` — irreversible (state loss, sent message, charged card).
   */
  reversibility?: "auto" | "manual" | "none";

  /**
   * Side effects the tool may produce beyond its primary action,
   * for compliance/audit reporting. Open vocabulary; common values:
   * `"state_loss"`, `"downtime"`, `"cost"`, `"external_notification"`,
   * `"data_exfiltration"`, `"privilege_change"`.
   */
  sideEffects?: string[];

  /**
   * Client policy hint:
   * `none` — auto-approve;
   * `single` — one approver;
   * `multi` — multiple approvers required.
   * Advisory; the client's own policy engine ultimately decides.
   */
  approvalRecommendation?: "none" | "single" | "multi";

  /**
   * Advisory minimum trust level on a 1–5 scale
   * (1 = observer / read-only operator, 5 = autonomous engineer).
   * Mirrors common agent-platform trust ladders; clients map to their
   * own scale.
   */
  minTrustLevel?: number;  // 1..5
}
```

### Default behaviour

A client that doesn't recognise these fields ignores them — purely additive.
A server that doesn't declare them works exactly as today.

When a client implements risk-aware policy and a tool is missing risk
metadata, the client SHOULD default to its most-restrictive policy bucket
(e.g. `riskLevel="critical"`, `approvalRecommendation="multi"`) until an
operator explicitly classifies that tool. This matches the "fail-closed"
principle familiar to security-conscious deployments.

### Inference

Servers can declare these fields; consumers without server-declared
metadata can **infer** them from the tool's name, description, and input
schema. A reference inferrer service (planned as separate work under
`mcp-risk-inferrer`) will use a verb-based heuristic (`get|list|describe`
→ `read`/`low`; `create|apply|update` → `mutate`/`medium`;
`delete|destroy|drop` → `delete`/`high`; flags like `force`, `recursive`,
`cascade` bump risk; namespace patterns matching `prod|production` bump
blastRadius) plus optional LLM augmentation for nuance. The inferrer
emits the same `ToolAnnotations` shape, so server-declared and inferred
manifests are interchangeable.

## Rationale

**Why extend `ToolAnnotations` instead of adding a parallel `risk` block?**
Existing hints are already advisory metadata about the tool's runtime
character. Risk is the same kind of advisory metadata at a finer grain;
parallel structures would force clients to consult two places.

**Why closed enums for most fields but open strings for `sideEffects`?**
Closed enums let clients build deterministic UI and policy logic; open
strings let new side-effect categories emerge in the wild without spec
revision (consumers ignore unknown values).

**Why `minTrustLevel` as a number 1–5 instead of a string?** Numeric
ordering supports `<` / `≥` comparisons natively in policy engines. The
1–5 range mirrors the most common agent-trust ladder (observer → assistant
→ operator → engineer → autonomous); consumers using different scales
map at the boundary.

**Why isn't approval enforcement specified?** Approval is a client
concern (UI, identity, audit). The spec offers a *recommendation* the
tool author surfaces; what the client does with it (auto-approve in
dev, require dual approval in prod) stays a client policy decision.

**Should `destructiveHint` be deprecated?** No — it's the binary view
many consumers already wire to. `riskLevel` is additive, not a
replacement.

## Backward compatibility

Pure addition to an optional object. Older clients ignore the new
fields; older servers don't emit them. No breaking change.

## Reference implementations

- **KARAI** (https://github.com/walbis/karai) — already maintains a
  manual classification at `config/tool_policies.yaml` for 30+ K8s
  tools, using a vocabulary almost identical to this proposal. That
  catalogue is the proof of need: every consumer ends up writing one.
- **mcp-risk-inferrer** (planned, OSS) — a reference inferrer service
  that derives this metadata from existing tools that haven't declared
  it, so the ecosystem can bootstrap without waiting for every server
  to update.

## Open questions

1. **Resource / Prompt analogues.** Resources (data exfiltration risk)
   and Prompts (injection vector risk) have parallel concerns. This SEP
   scopes to Tools; a follow-up SEP could extend the same vocabulary if
   the community thinks it's useful.
2. **Versioned manifests.** Should `ToolAnnotations` carry a schema
   version so consumers know which vocabulary set applies? Deferred —
   the protocol version already covers this implicitly.
3. **Trust scale normalisation.** `minTrustLevel: 1..5` is opinionated.
   If consumers diverge significantly, a free-form string with an
   accompanying convention doc might serve better. Soliciting feedback.

## Security considerations

- A malicious server can declare low risk for a high-risk tool. Clients
  SHOULD NOT trust server-declared metadata blindly when the server isn't
  authenticated/curated. The reference inferrer + community-curated
  catalogues (separate work) provide the verification layer.
- The most-restrictive default for missing metadata is the safe baseline;
  this proposal doesn't change that.
