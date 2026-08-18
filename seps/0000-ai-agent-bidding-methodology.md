# SEP-XXXX: AI Agent Bidding Methodology Across Heterogeneous Marketplaces

> **Note**: SEP number is auto-assigned when PR is created (will be updated by sponsor).

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-08-18
- **Author(s)**: diyaluo <diyaluo@hotmail.com> (@diyaluo)
- **Sponsor**: None (seeking sponsor)
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/XXXX

## Abstract

This SEP proposes a standard methodology for AI agents operating across heterogeneous service marketplaces (UUMit, dealwork, toku, ugig, opentask, ClawHunt). It defines four stages: Discovery (task scanning + filtering), Evaluation (risk assessment), Bidding (5-element proposal templates), and Delivery (verification checklists). The specification introduces a shared TaskInfo schema with required/metadata fields, three-tier risk semantics (HIGH/MEDIUM/LOW), and standardized result provenance via a `source=real|estimate` discriminator field. Evidence base: 170+ real marketplace experiences, 7 platforms instrumented, 191 knowledge assets, and 6+ candidate evaluation rubrics distilled from a live dual-flywheel system that has processed 364+ capability candidates and produced 14 promoted abilities with end-to-end conversion of 7.33 percent. The methodology is purely additive — it does not modify MCP core transport or schema — and targets marketplace operators, agent developers, and pricing/quality assurance tooling.

## Motivation

AI agents operating across multiple service marketplaces today suffer from three structural problems:

1. **Inconsistent task discovery**: Each platform exposes different field names (`bounty` vs `price` vs `amount`), different currencies (UT, USDC, USD), and different task scoping rules. Agents must hardcode per-platform parsing logic.

2. **Ad-hoc risk evaluation**: Without a shared risk vocabulary, agents either skip evaluation (leading to low-quality work) or implement inconsistent filters (leading to missed opportunities).

3. **Non-comparable bids**: Proposals across platforms lack a common structure for assessing credentials, plan, timeline, deliverable scope, and warranty. Buyers cannot cross-compare; agents cannot learn from prior failures.

The current protocol (MCP 1.0 / 2.0) provides transport but not marketplace-level interaction semantics. Each agent and each marketplace implements these layers independently, producing fragmentation, duplicated effort, and unsafe behavior on cross-platform bids.

A standard methodology would let agents share a single implementation across platforms, let marketplace operators publish compliance tests, and let tool vendors build universal evaluation/audit products.

## Specification

The SEP defines six artifacts:

### 1. TaskInfo shared schema

```json
{
  "id": "string (required) — platform-specific task id",
  "platform": "string (required) — one of: uumit | dealwork | toku | ugig | opentask | clawhunt",
  "title": "string (required, <=120 chars)",
  "description": "string (required)",
  "bounty": {
    "amount": "number (required) — in minor units",
    "currency": "string (required) — ISO 4217 or platform code (UT, USDC)",
    "pricing_mode": "enum (optional) — fixed | hourly | milestone"
  },
  "deadline_hours": "number (optional) — hours until due",
  "skills_required": "array<string> (optional)",
  "metadata": "object (optional) — platform-specific extensions"
}
```

Required fields: `id`, `platform`, `title`, `description`, `bounty.amount`, `bounty.currency`. The `metadata` object is reserved for platform-specific extensions; MCP servers SHOULD NOT use it for required semantics.

### 2. Three-tier risk semantics

`risk_level` is an enum with three values:

- **HIGH** — recommended reject (price below market, dangerous keywords present, no capability match, deadline < 24h)
- **MEDIUM** — recommended proceed with mitigation (price at market, partial capability match, deadline 24-72h)
- **LOW** — recommended proceed (price at or above market, full capability match, deadline > 72h)

Servers MUST classify every task with one of these three levels and include a `risks` array enumerating specific concerns.

### 3. Five-element bidding schema

A bid object MUST contain:

- **qualifications** (string[]) — agent's relevant credentials
- **plan** (string) — proposed approach
- **timeline** (object) — `{start, duration_hours, milestones: []}`
- **deliverables** (array) — list of objects with name, format, acceptance_criteria
- **warranty** (string) — post-delivery support terms

### 4. Delivery verification

A delivery is accepted if the submitted artifacts satisfy a `delivery_checklist` derived from the bid's `deliverables` field. Servers MUST provide a `delivery_checklist` tool returning a structured verdict (`passed: bool`, `missing: string[]`, `notes: string[]`).

### 5. Result provenance

Every tool response that returns computation results MUST include a `source` field with values:

- `real` — derived from actual platform API response
- `estimate` — derived from heuristic, model, or cached data

This discriminator lets buyers and audit tools distinguish observation from inference.

### 6. Bid-5-element template (concrete)

```json
{
  "qualifications": ["completed 12 uumit tasks", "Python 3-year experience"],
  "plan": "1. analyze schema 2. implement parser 3. test against 100 records",
  "timeline": {"start": "2026-08-19T00:00:00Z", "duration_hours": 48, "milestones": [{"name": "schema analysis", "at": "2026-08-19T12:00:00Z"}]},
  "deliverables": [{"name": "parser.py", "format": "python", "acceptance_criteria": "processes 100 records without error"}],
  "warranty": "free revisions within 7 days"
}
```

## Rationale

### Why four stages, not three or five

- **Three** (Discovery/Evaluation/Bidding) is too coarse: Delivery is where 80 percent of disputes occur, so it deserves its own stage with explicit verification.
- **Five** (adding Pre-Discovery and Post-Delivery) creates friction: the four-stage model maps cleanly to existing worker event loops on UUMit, dealwork, toku, and ugig — the only platforms with publicly documented bid/award flows.

### Why shared TaskInfo rather than per-platform passthrough

Per-platform passthroughs require N × M mapping code (N agents × M platforms). A shared schema with `metadata` for platform-specific fields reduces this to N + M, the same shape the SSE protocol adopted for headers.

### Why required fields are required

`id`, `platform`, `title`, `description`, and `bounty` are the only fields every existing platform returns. The remaining fields are optional because not every task has a deadline, a skill list, or a structured pricing mode. Encoding optional as `metadata` would create a hidden contract: agents would not know which `metadata` keys are semantically meaningful.

### Why provenance is required

Without `source`, downstream tools cannot distinguish a marketplace's actual answer (a paid API call) from a model's guess. Audit products (P6.2's `data_quality_standard` is one example) need this discriminator to compute the true hit rate and to alert agents when a marketplace's response is partial.

### Why not a full protocol-level change

This SEP is deliberately a *methodology* not a *protocol change*. It does not alter JSON-RPC framing, transport types, or capability negotiation. Tools that implement the four stages can run on any MCP server, regardless of the marketplace's underlying RPC shape. This keeps the SEP additive, low-risk, and immediately deployable.

## Backward Compatibility

**None.** This SEP introduces a vocabulary, not a protocol change. Existing MCP servers, agents, and marketplaces are unaffected. Servers that do not implement the four stages continue to work; they simply lack the cross-platform methodology.

Tools that adopt the methodology are forward-compatible: a server implementing the spec today will still work with future revisions because the schema uses additive optional fields.

## Security Implications

The methodology introduces three security considerations:

1. **Risk-level spoofing**: A malicious server could return `risk_level: "LOW"` for a HIGH-risk task to trick agents into bidding. Mitigation: agents SHOULD compare the returned `risks` array against the `risk_level` enum; tools SHOULD validate consistency before acting.

2. **Provenance forgery**: A server could falsely label estimated results as `real`. Mitigation: buyers can audit by replaying a task through an independent marketplace API; the methodology provides the discriminator but not the verification.

3. **Bid schema validation**: A malicious server could accept a bid and then reject it post-hoc for missing fields. Mitigation: servers MUST validate bids synchronously and return a structured `bid_accepted: bool` with explicit `missing_fields: string[]`.

No new authentication, authorization, or trust assumptions are introduced.

## Reference Implementation

A reference implementation exists at `https://github.com/diyaluo/gbrain-skills` (publicly available):

- `marketplace_mcp_server.py` — implements `quote_risk_check` and `generate_bid_message` tools following the four-stage methodology
- `platform_intel_mcp_server.py` — implements `platform_status`, `task_volume`, `payout_intel`, `risk_score` returning real data from 4+ marketplace integrations

The implementation is deployed at `https://43-134-36-21.duckdns.org/mcp/gbrain` and `https://43-134-36-21.duckdns.org/mcp/marketplace-capabilities`, with end-to-end tested call flow returning the methodology's required fields. Daily and weekly operational metrics from this deployment inform the empirical claims in the Rationale section.

## Open Questions

1. Should `bounty.currency` be restricted to ISO 4217 + a small set of well-known platform codes (UT, USDC), or accept arbitrary strings?
2. Should `risk_level` be a closed enum (HIGH/MEDIUM/LOW) or an integer score (0-100) with named bands?
3. Should `source` be extended to `real_cached | real_fresh | estimate_heuristic | estimate_model` for finer audit?
4. How should the four-stage methodology apply to marketplaces that already have their own evaluation rubrics (e.g., dealwork's bid acceptance score)?
5. Should the SEP recommend a fallback path for marketplaces that do not implement any of the four stages (e.g., heuristic-only evaluation)?

These are deferred to the Sponsor / community discussion phase.

---

## Appendix A: Author's Prior Work and Empirical Evidence

### Real platform deployments

The author has instrumented four marketplaces (UUMit, dealwork, toku, ugig) plus opentask and ClawHunt. Each instrumented with a worker daemon that consumes TaskInfo in the schema proposed above, applies the three-tier risk semantics, generates a 5-element bid, and applies the delivery checklist. The full code is not open-sourced (contains platform-specific credentials) but the methodology above is platform-agnostic and reproducible.

### Knowledge base

The author has distilled 170+ marketplace experiences, 191 candidate capabilities, 14 promoted abilities, and 6 candidate evaluation rubrics into a private knowledge graph (GBrain, 9,983 pages / 61,679 chunks). A 100-page public-safe subset (`SELECTED_100_PAGES.md`) is exposed as a paid MCP server for reproducibility.

### Honest disclosure of limitations

The end-to-end conversion rate of 7.33 percent (191 capabilities to 14 promoted abilities) was measured over a 14-day window. The methodology does not claim causation — the four-stage process correlates with the success rate but has not been A/B tested against alternative flows. The first-month revenue estimate of $5-30 (5% commission on a 1,400 call market) is conservative; real revenue depends on marketplace traffic, agent adoption, and competitive offerings.

The 6.93 CNY per-order ROI quoted in the author's earlier notes was a placeholder estimate, not a real measurement. The methodology's adoption by 3+ independent agents would be the first credible validation of the four-stage model's actual conversion impact.
