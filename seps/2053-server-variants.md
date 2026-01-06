# SEP-2053: Server Variants

- **Status**: Draft
- **Type**: Extensions Track
- **Created**: 2026-01-05
- **Author(s)**: Sambhav Kothari (@sambhav)
- **Sponsor**: None
- **PR**: [#2053](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2053)

## Abstract

This SEP introduces a server-level variant mechanism to the Model Context Protocol, enabling servers to expose multiple variants simultaneously. Each variant includes a unique identifier, human-readable description, and key-value hints that intelligent clients can use to select an appropriate variant for their context. During initialization, clients provide variant hints (model family, use case, capabilities), and servers respond with a ranked list of available variants. The first variant in the list serves as the recommended default. Clients select variants on a per-request basis via the `_meta` field, which applies to all server capabilities (tools, resources, prompts, and subscriptions) for that request.

This design follows the established `ModelPreferences` pattern from MCP sampling, which uses hints for soft matching combined with structured metadata for intelligent selection.

**Packaging note:** This SEP is currently specified as an MCP extension to minimize core schema churn. Variant hints and variant enumeration are carried inside a negotiated extension payload, while per-request selection remains in `_meta` using a canonical, namespaced key.

**Terminology note:** This SEP uses "variant" (not "version") to describe parallel configurations. This distinguishes the concept from MCP's `protocolVersion` (spec revision dates). Variants are coexisting alternatives that allow the same underlying tools to be reusable across fundamentally different agent architectures.

---

## Motivation

### Problem Statement

**Server capabilities are monolithic.** A single capability definition (tools, prompts, resources) must serve all clients equally, regardless of:

- Which LLM is interpreting the capabilities (Claude vs GPT vs Gemini vs local models)
- What the client's use case is (autonomous agent vs human assistant vs IDE)
- What capabilities the client has (rich rendering vs text-only)
- What context constraints exist (128k tokens vs 4k tokens)

### Design Goals

This proposal aims to achieve the following:

1. **Parallel Variants**: Servers can expose multiple variants (e.g., `claude-optimized`, `gpt-optimized`, `compact`) simultaneously as parallel offerings
2. **Intelligent Selection**: Clients can automatically select the best variant based on context (model, use case, capabilities) using structured metadata
3. **Per-Request Flexibility**: Variant selection happens per-request via `_meta`, requiring no session state (fully stateless)
4. **Backward Compatibility**: Existing servers without variants continue to work; existing clients ignore variant fields
5. **LLM-Friendly Metadata**: Variant descriptions and hints are structured for LLM reasoning about variant selection
6. **Server-Wide Scope**: Variant selection applies to all capabilities (tools, resources, prompts, subscriptions), not per-capability
7. **Graceful Deprecation**: Clear deprecation mechanism with migration guidance when variants need sunsetting

### Background

The Model Context Protocol currently lacks a mechanism to adapt server capabilities based on client context. As noted in [Issue #469](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/469), there's demand for agent-aware content adaptation: different agents and models benefit from different prompt formats, tool descriptions, and parameter schemas.

This SEP also addresses concerns raised in multiple community discussions around adaptation schemes, tool optimization, and enterprise challenges with capability negotiation (see [Prior Art](#prior-art) in Rationale for related issues).

### Current Limitations

1. **One-size-fits-all tools**: Tool descriptions optimized for Claude may be suboptimal for GPT-4, and vice versa. Servers cannot offer model-specific variants.

2. **No context awareness**: Servers have no information about the client's use case (autonomous agent vs. human assistant) or context constraints (token limits, rendering capabilities).

3. **Forced trade-offs**: Server authors must choose between verbose descriptions (better for some models) and compact ones (better for context-limited scenarios).

4. **Complex client-side logic**: Without protocol support, clients must implement their own adaptation logic, reducing portability and increasing complexity.

5. **No cross-agent reusability**: Different agents have fundamentally different requirements—a coding assistant needs different tool surfaces than a research agent or an autonomous task executor. Without variants, tool authors must either build separate servers or create one-size-fits-all tools that serve no agent optimally.

### Real-World Use Cases

Server-level variants address several important scenarios:

#### Cross-Agent Tool Reusability (Primary Use Case)

**This is the core motivation for this SEP.** For MCP tools to be truly reusable across the diverse ecosystem of AI agents, they need to expose different surface areas tailored to each agent's architecture and requirements:

| Agent Type                   | Tool Description Needs      | Schema Needs           | Context Priority           |
| ---------------------------- | --------------------------- | ---------------------- | -------------------------- |
| **Coding Assistant**         | Code-focused, with examples | IDE-integration params | Precision > Brevity        |
| **Research Agent**           | Comprehensive, sourced      | Citation metadata      | Depth > Speed              |
| **Task Automation Agent**    | Minimal, action-focused     | Strict validation      | Reliability > Readability  |
| **Conversational Agent**     | User-friendly, explanatory  | With defaults          | Clarity > Completeness     |
| **Multi-Agent Orchestrator** | Machine-readable            | Typed interfaces       | Composability > Simplicity |

Without variants, tool authors face an impossible choice: either build separate MCP servers for each agent type, or create generic tools that don't serve any agent optimally. This fragments the ecosystem and reduces tool reusability.

**Example: A file management server serving different agents:**

```json
{
  "availableVariants": [
    {
      "id": "coding-assistant",
      "description": "File operations optimized for coding workflows. Includes syntax-aware operations, diff generation, and IDE-friendly output formats. Tools assume code file context.",
      "hints": { "useCase": "coding", "contextSize": "standard" }
    },
    {
      "id": "automation-agent",
      "description": "Minimal file operations for automated pipelines. Strict input validation, machine-readable outputs, comprehensive error codes. No interactive confirmations.",
      "hints": { "useCase": "automation", "contextSize": "compact" }
    },
    {
      "id": "conversational",
      "description": "File operations with human-friendly descriptions and confirmations. Includes helpful suggestions and explains operations in plain language.",
      "hints": { "useCase": "conversational", "contextSize": "verbose" }
    }
  ]
}
```

**Key insight**: Different variants can expose **entirely different sets of tools**, not just different descriptions. For example, a `coding-assistant` variant might include refactoring and diff tools, while an `automation-agent` variant only exposes basic CRUD operations with batch support.

#### Domain-Specific Examples

##### Developer Productivity Platforms

Developer platforms (GitHub, GitLab, Jira, Linear, Azure DevOps, etc.) have complex, interconnected capabilities spanning code, issues, CI/CD, security, and project management. Different agents need different slices of this surface:

| Agent Type                   | Tools Needed                                    | Tools to Exclude                         |
| ---------------------------- | ----------------------------------------------- | ---------------------------------------- |
| **Code Review Agent**        | PR operations, diff tools, review comments      | Issue management, CI/CD, security alerts |
| **Project Management Agent** | Issues, labels, milestones, assignments         | Code operations, security scanning       |
| **Security Scanning Agent**  | Vulnerability alerts, code scanning, advisories | Issue comments, PR merges, releases      |
| **CI/CD Automation Agent**   | Workflow runs, job management, deployments      | Issue triage, code review, discussions   |
| **Triage Bot**               | Issue reading, labeling, assignment             | Code modification, PR merges, releases   |

Additionally, these platforms need **access control variants**:

- **Read-only**: Safe for analysis agents that should never modify state
- **Lockdown**: Enterprise security filtering (e.g., hide content from external contributors)
- **Write-limited**: Can comment but not merge or close

```json
{
  "availableVariants": [
    {
      "id": "code-review",
      "description": "Pull request and code review operations. Includes diff viewing, review comments, approval workflows, and merge controls. Excludes issue management and CI/CD tools.",
      "hints": { "domain": "code-review", "accessLevel": "read-write" }
    },
    {
      "id": "project-management",
      "description": "Issue and project tracking operations. Includes issue CRUD, labels, milestones, assignments, and project boards. Excludes code operations.",
      "hints": { "domain": "project-management", "accessLevel": "read-write" }
    },
    {
      "id": "security-readonly",
      "description": "Security scanning and vulnerability management. Read-only access to code scanning alerts, secret detection, and security advisories. No remediation capabilities.",
      "hints": { "domain": "security", "accessLevel": "readonly" }
    },
    {
      "id": "ci-automation",
      "description": "CI/CD workflow management. Trigger runs, monitor jobs, manage deployments. Designed for automation agents with minimal human oversight.",
      "hints": { "domain": "ci-cd", "accessLevel": "automation" }
    }
  ]
}
```

The GitHub MCP server already implements this pattern using ad-hoc mechanisms (URL paths, headers, flags). See [Prior Art: GitHub MCP Server](#github-mcp-server) for detailed analysis of how this SEP standardizes what GitHub is doing.

##### Financial Services: Trading Platform

A trading MCP server might expose variants based on operational mode and risk tolerance:

```json
{
  "availableVariants": [
    {
      "id": "interactive-trading",
      "description": "Human-supervised trading with confirmation prompts, position size limits, and detailed risk explanations. All trades require explicit approval. Includes paper trading tools for practice.",
      "hints": {
        "useCase": "interactive",
        "com.acme/riskLevel": "conservative"
      }
    },
    {
      "id": "autonomous-trading",
      "description": "Fully automated trading with pre-approved strategies. Executes within defined risk parameters without confirmation. Excludes high-risk instruments. Includes circuit breakers and position limits.",
      "hints": {
        "useCase": "autonomous-agent",
        "com.acme/riskLevel": "moderate"
      }
    },
    {
      "id": "analysis-only",
      "description": "Market analysis and research tools only. No trade execution capabilities. Safe for exploration and strategy development.",
      "hints": { "useCase": "planning", "com.acme/riskLevel": "none" }
    }
  ]
}
```

##### Research: Deep Analysis vs Quick Answers

A research assistant MCP server might adapt based on depth requirements:

```json
{
  "availableVariants": [
    {
      "id": "deep-research",
      "description": "Comprehensive research mode with multi-source verification, citation tracking, and detailed analysis. Prioritizes accuracy and thoroughness over speed.",
      "hints": {
        "useCase": "research",
        "com.acme/depth": "comprehensive",
        "contextSize": "verbose"
      }
    },
    {
      "id": "quick-lookup",
      "description": "Fast fact retrieval optimized for simple questions. Single-source answers with confidence signals. Minimal context usage.",
      "hints": {
        "useCase": "qa",
        "com.acme/depth": "shallow",
        "contextSize": "compact"
      }
    },
    {
      "id": "synthesis",
      "description": "Balanced mode for synthesizing information from multiple sources into coherent summaries. Good for reports and briefings.",
      "hints": {
        "useCase": "synthesis",
        "com.acme/depth": "moderate",
        "contextSize": "standard"
      }
    }
  ]
}
```

##### Healthcare: Clinical vs Administrative

A healthcare MCP server might separate clinical and administrative functions:

```json
{
  "availableVariants": [
    {
      "id": "clinical-decision-support",
      "description": "Clinical tools for diagnosis support, drug interaction checking, and treatment planning. Requires practitioner context. Includes comprehensive warnings and contraindications.",
      "hints": { "useCase": "clinical", "com.acme/audience": "practitioner" }
    },
    {
      "id": "patient-facing",
      "description": "Patient-appropriate tools with simplified explanations, appointment scheduling, and general health information. No diagnostic tools.",
      "hints": { "useCase": "patient-portal", "com.acme/audience": "patient" }
    },
    {
      "id": "administrative",
      "description": "Billing, scheduling, and records management tools. No clinical decision support.",
      "hints": { "useCase": "admin", "com.acme/audience": "staff" }
    }
  ]
}
```

##### API Versioning and Migration

While variants are not versions, they can model **parallel API generations** during migration periods. This allows servers to maintain backward compatibility while introducing breaking changes:

```json
{
  "availableVariants": [
    {
      "id": "v2-stable",
      "description": "Current stable API (v2). Recommended for production use. Uses structured responses with typed error codes and pagination support.",
      "hints": { "com.acme/apiGeneration": "v2", "contextSize": "standard" },
      "status": "stable"
    },
    {
      "id": "v3-preview",
      "description": "Next-generation API (v3 preview). Includes new streaming responses, batch operations, and enhanced filtering. Schema may change before GA.",
      "hints": { "com.acme/apiGeneration": "v3", "contextSize": "standard" },
      "status": "experimental"
    },
    {
      "id": "v1-legacy",
      "description": "Legacy API (v1). Maintained for backward compatibility only. Missing pagination, uses string error codes. Migrate to v2 before 2026-06-01.",
      "hints": { "com.acme/apiGeneration": "v1", "contextSize": "compact" },
      "status": "deprecated",
      "deprecationInfo": {
        "message": "v1 API will be removed on 2026-06-01. Please migrate to v2-stable.",
        "replacement": "v2-stable",
        "removalDate": "2026-06-01"
      }
    }
  ]
}
```

**Key distinction from protocol versioning**: These variants represent _server capability generations_, not MCP protocol versions. The `protocolVersion` in `initialize` governs MCP wire format; variants govern server-specific tool schemas and behaviors.

##### A/B Testing and Experimentation

Servers can use variants to run controlled experiments on tool descriptions, schemas, or behaviors:

```json
{
  "availableVariants": [
    {
      "id": "control",
      "description": "Standard tool descriptions (control group). Baseline for A/B testing.",
      "hints": {
        "com.acme/experiment": "tool-desc-2026-q1",
        "com.acme/cohort": "control"
      },
      "status": "stable"
    },
    {
      "id": "treatment-verbose",
      "description": "Experimental: More detailed tool descriptions with usage examples. Testing hypothesis that verbose descriptions improve task completion rates.",
      "hints": {
        "com.acme/experiment": "tool-desc-2026-q1",
        "com.acme/cohort": "treatment-a"
      },
      "status": "experimental"
    },
    {
      "id": "treatment-structured",
      "description": "Experimental: Structured tool descriptions using consistent format (Purpose/Inputs/Outputs/Examples). Testing hypothesis that structure improves model accuracy.",
      "hints": {
        "com.acme/experiment": "tool-desc-2026-q1",
        "com.acme/cohort": "treatment-b"
      },
      "status": "experimental"
    }
  ]
}
```

**A/B testing workflow:**

1. **Server assigns cohort**: Based on client identity, session, or random assignment, server can influence default ranking
2. **Client reports variant**: Telemetry includes which variant was used for each request
3. **Server analyzes outcomes**: Compare success rates, error rates, and user satisfaction across cohorts
4. **Promote winner**: After experiment concludes, winning variant becomes the new stable default

**Intelligent client participation**: Clients can opt into experiments via hints:

```json
{
  "variantHints": {
    "description": "Willing to participate in experiments for research purposes.",
    "hints": {
      "com.acme/experimentOptIn": "true",
      "com.acme/experimentExclude": "latency-sensitive"
    }
  }
}
```

#### Model-Specific Optimization

Different LLMs have different strengths and prompting patterns:

- **Claude** often benefits from detailed, structured tool descriptions and explicit guidance
- **GPT** often performs well with concise function signatures and JSON Schema-heavy definitions
- **Local models** often need simplified schemas and shorter descriptions due to context limits
- **Gemini** may benefit from different formatting conventions

A server can expose `claude-optimized`, `gpt-optimized`, and `local-friendly` variants simultaneously, each with tool descriptions tuned for that model family.

#### Context Budget Management

Different clients have different context constraints:

- **128k context window**: Can afford verbose, detailed descriptions
- **8k context window**: Needs compact descriptions to leave room for conversation
- **Embedded/edge deployments**: Extreme constraints require minimal overhead

Variants like `verbose`, `standard`, and `compact` allow servers to offer the same capabilities with different verbosity levels.

### Variant Capabilities: What Can Differ

Server variants can differ in multiple dimensions:

| Dimension                 | Example                                                |
| ------------------------- | ------------------------------------------------------ |
| **Tool set**              | Planning variant has 20 tools; execution variant has 8 |
| **Tool descriptions**     | Verbose vs. compact descriptions for the same tool     |
| **Input schemas**         | Simplified schemas vs. full validation schemas         |
| **Output schemas**        | Detailed structured output vs. minimal response        |
| **Resource availability** | Debug variant exposes logs; production doesn't         |
| **Prompt templates**      | Mode-specific prompt variations                        |
| **Default behaviors**     | Conservative defaults vs. aggressive defaults          |

### Alternatives Considered and Why They Fall Short

#### Alternative 1: Multiple Tool Names (`tool_v1`, `tool_v2`, `tool_claude`)

Instead of variants, servers could expose them as separate tools:

```
get_weather_claude
get_weather_gpt
get_weather_compact
```

**Why this fails:**

1. **Discovery pollution**: The LLM sees 3x the tools, wasting context and causing confusion about which to use
2. **No structured selection**: No metadata to help clients automatically pick the right variant
3. **Naming chaos**: No standard for naming; every server invents its own convention
4. **Combinatorial explosion**: With N tools and M variants, you get N×M tool names
5. **Breaking changes**: Adding a variant changes the tool list, potentially breaking existing integrations
6. **No coherence**: Client might accidentally mix incompatible variants

#### Alternative 2: Multiple Servers (`server-claude.example.com`, `server-gpt.example.com`)

Deploy separate server instances for each variant:

```
server-claude.example.com
server-gpt.example.com
server-compact.example.com
```

**Why this fails:**

1. **Configuration burden**: Clients must know about and configure multiple server endpoints
2. **No unified discovery**: Client can't discover all variants from a single endpoint
3. **Resource duplication**: Each server instance duplicates infrastructure, state, and operational overhead
4. **No dynamic switching**: Changing variants requires reconnecting to a different server
5. **Inconsistent state**: If servers share backend state, synchronization becomes complex
6. **Deployment complexity**: Server operators must deploy and maintain multiple instances
7. **No graceful degradation**: If the preferred server is unavailable, client has no fallback information

#### Alternative 3: Client-Side Adaptation

Let clients transform tool descriptions themselves:

**Why this fails:**

1. **Duplicated effort**: Every client reimplements the same adaptation logic
2. **Server knowledge required**: Only the server truly knows how to optimize its tools for different contexts
3. **Variant drift**: Client adaptations may become stale as server capabilities evolve
4. **No server hints**: Server can't guide clients toward optimal configurations
5. **Testing burden**: Server authors can't test and validate optimized variants

#### Alternative 4: Per-Tool Semantic Versioning

Another approach proposes versioning each tool independently with SemVer:

```typescript
tools: [
  { name: "get_weather", version: "2.1.0", ... },
  { name: "send_email", version: "1.4.2", ... }
]
```

**Why server-level variants are preferred:**

1. **Tool coupling**: Tools within a server are often tightly coupled and have dependencies on each other. Prompts may reference tools, and tools may interact in non-trivial ways. Server-level variants maintain coherence across these relationships.

2. **Management complexity**: Per-tool versioning becomes unwieldy to manage at scale. Tracking client upgrades and deprecating old versions across many individual tools is significantly more difficult than managing server-wide variants.

3. **Proven patterns**: API versioning is well-established. Defining capability sets at the API/service level rather than individual endpoints has worked effectively for decades.

4. **Discovery challenges**: If `tools/list` returns a single version per tool but the server has multiple variants available, client pre-validation cannot work effectively since it only knows about one configuration at a time.

5. **All primitives matter**: Variants should apply to all primitives, not just tools. Resources and prompts benefit from variants too. Server-level variants naturally encompass all capabilities.

#### Alternative 5: Ad-Hoc Server Conventions (Current Practice)

Production MCP servers have implemented ad-hoc solutions to expose different tool surfaces. The **GitHub MCP Server** uses URL paths (`/mcp/x/issues`), headers (`X-MCP-Toolsets`), flags (`--read-only`, `--lockdown-mode`), and config files for description overrides.

While these prove the demand is real, ad-hoc conventions lack discoverability, structured metadata for intelligent selection, and cross-server consistency. Each server invents its own mechanisms, forcing clients to read documentation and be pre-configured for each server's conventions.

See [Prior Art: GitHub MCP Server](#github-mcp-server) for detailed analysis of what GitHub has built and why standardization is needed.

### Why Server-Level Variants are the Right Solution

Server-level variants solve these problems with a single, discoverable endpoint that provides structured metadata for intelligent selection:

| Problem         | Solution                                                                   |
| --------------- | -------------------------------------------------------------------------- |
| **Discovery**   | Single endpoint; negotiated extension carries `availableVariants` in init  |
| **Selection**   | Client sends hints; server ranks variants; client picks or accepts default |
| **Coherence**   | All capabilities share variant context                                     |
| **Switching**   | Change variant per-request via `_meta`                                     |
| **Maintenance** | Server author maintains variants; clients get updates automatically        |
| **Fallback**    | Server provides ordered list; client can fall back to alternatives         |
| **Standards**   | Canonical `_meta` key and extension id reduce ecosystem fragmentation      |

### Additional Benefits

1. **Plug-and-play**: Clients don't need server-specific configuration. Send hints, get an ordered list.
2. **Future-proof**: New variant types (new models, new use cases) do not require protocol changes.
3. **Gradual adoption**: Servers can add variants incrementally; existing clients continue working.
4. **A/B testing**: Servers can experiment with tool descriptions and measure which variants perform better.
5. **Deprecation path**: When retiring old variants, servers provide migration guidance and replacement suggestions.

---

## Specification

### Extension Identifier

This SEP is defined as an MCP extension:

- **Extension id**: `io.modelcontextprotocol/server-variants`
- **Canonical per-request `_meta` key**: `io.modelcontextprotocol/server-variant`

Support is negotiated via `capabilities.extensions[io.modelcontextprotocol/server-variants]` in `initialize`.

### New Types

#### ServerVariant

A server variant represents a distinct configuration of all server capabilities.

```typescript
/**
 * Describes a server capability variant that clients can select.
 * Each variant represents a distinct configuration of all server capabilities
 * (tools, resources, prompts, subscriptions).
 *
 * @category `initialize`
 */
export interface ServerVariant {
  /**
   * Unique identifier for this variant. Freeform string that servers define.
   * Examples: "claude-optimized", "gpt-optimized", "compact", "agent-plan"
   *
   * Each variant's `id` MUST be unique within `availableVariants`.
   */
  id: string;

  /**
   * Human-readable description of this variant, suitable for display to users
   * or for LLM reasoning about variant selection.
   *
   * SHOULD include:
   * - Target use case or model family
   * - Key characteristics or optimizations
   * - Trade-offs compared to other variants
   */
  description: string;

  /**
   * Key-value hints providing structured metadata for intelligent variant selection.
   * Clients and LLMs can use these hints to programmatically filter and rank variants.
   *
   * Unknown hint keys MUST be ignored by clients and servers.
   */
  hints?: { [key: string]: string };

  /**
   * The stability status of this variant.
   * - "stable": Production-ready, recommended for general use
   * - "experimental": May change without notice, use for testing
   * - "deprecated": Will be removed in a future release
   *
   * @default "stable"
   */
  status?: "stable" | "experimental" | "deprecated";

  /**
   * If status is "deprecated", provides guidance for migration.
   */
  deprecationInfo?: {
    /**
     * Human-readable message explaining why this variant is deprecated
     * and how to migrate.
     */
    message: string;

    /**
     * Suggested replacement variant identifier.
     */
    replacement?: string;

    /**
     * Optional date when this variant is planned to be removed (ISO 8601 format).
     * If present, servers SHOULD continue to support the variant until that date.
     */
    removalDate?: string;
  };
}
```

#### Common Hint Vocabulary

The following hint keys and values are common patterns intended to improve interoperability. Implementations **MAY** use these keys, and **SHOULD** ignore unknown keys.

| Hint Key                | Description                   | Common Values (non-exhaustive)                                                       |
| ----------------------- | ----------------------------- | ------------------------------------------------------------------------------------ |
| `modelFamily`           | Target model family/provider  | `anthropic`, `openai`, `google`, `meta`, `local`, `any`                              |
| `useCase`               | Intended usage scenario       | `autonomous-agent`, `human-assistant`, `ide`, `api`, `chat`, `planning`, `execution` |
| `contextSize`           | Verbosity/token efficiency    | `compact`, `standard`, `verbose`                                                     |
| `renderingCapabilities` | Expected client rendering     | `rich`, `markdown`, `text-only`                                                      |
| `languageOptimization`  | Natural language optimization | `en`, `multilingual`, `code-focused`                                                 |

**Custom hint namespacing**: Servers MAY define additional hints using reverse domain notation to avoid collisions:

```json
{
  "hints": {
    "modelFamily": "anthropic",
    "com.acme/riskLevel": "conservative",
    "com.acme/auditMode": "enabled"
  }
}
```

#### VariantHints

Structured hints provided by the client to help servers rank available variants. This follows the pattern established by `ModelPreferences` in sampling: a freeform description for LLM reasoning plus structured hints for programmatic matching.

```typescript
/**
 * Hints provided by the client to help the server rank available variants.
 *
 * @category `initialize`
 */
export interface VariantHints {
  /**
   * Human-readable description of the client's context and requirements.
   */
  description?: string;

  /**
   * Key-value hints providing structured metadata for variant selection.
   * Values can be a single string or an array of strings (in order of preference).
   *
   * Unknown hint keys MUST be ignored by clients and servers.
   */
  hints?: { [key: string]: string | string[] };
}
```

**Design note:** Client hint values can be arrays (ordered by preference), while server hint values are single strings. This allows clients to express "prefer X but can work with Y" while servers declare "optimized for X".

**Relationship to ModelPreferences:** The `VariantHints` structure intentionally parallels `ModelPreferences` from sampling:

| ModelPreferences                                        | VariantHints            | Purpose                      |
| ------------------------------------------------------- | ----------------------- | ---------------------------- |
| `hints[].name` (array of name hints)                    | `hints` (key-value map) | Structured matching criteria |
| `costPriority`, `speedPriority`, `intelligencePriority` | N/A (server ranks)      | Selection priorities         |
| N/A                                                     | `description`           | LLM-friendly client context  |

---

### Schema Changes

#### InitializeRequestParams

This SEP does **not** add new top-level fields to `InitializeRequestParams`. Instead, it packages variant hints inside the negotiated extension payload under `capabilities.extensions`.

```typescript
export interface InitializeRequestParams extends RequestParams {
  protocolVersion: string;
  capabilities: ClientCapabilities;
  clientInfo: Implementation;
}
```

Clients that support this SEP SHOULD advertise the extension:

```json
{
  "capabilities": {
    "extensions": {
      "io.modelcontextprotocol/server-variants": {
        "variantHints": {
          "description": "Claude-powered autonomous coding agent. Prefers detailed planning views but can execute compactly.",
          "hints": {
            "modelFamily": ["anthropic", "openai"],
            "useCase": ["autonomous-agent", "planning", "execution"],
            "contextSize": ["standard", "compact"]
          }
        }
      }
    }
  }
}
```

#### InitializeResult

This SEP does **not** add new top-level fields to `InitializeResult`. The server returns `availableVariants` inside the extension payload under `capabilities.extensions`.

```typescript
export interface InitializeResult extends Result {
  protocolVersion: string;
  capabilities: ServerCapabilities;
  serverInfo: Implementation;
  instructions?: string;
}
```

Example server response:

```json
{
  "capabilities": {
    "tools": { "listChanged": true },
    "resources": { "subscribe": true, "listChanged": true },
    "prompts": { "listChanged": true },
    "extensions": {
      "io.modelcontextprotocol/server-variants": {
        "availableVariants": [
          {
            "id": "claude-optimized",
            "description": "Optimized for Anthropic-family models with detailed tool guidance and structured outputs.",
            "hints": { "modelFamily": "anthropic", "contextSize": "verbose" },
            "status": "stable"
          },
          {
            "id": "compact",
            "description": "Token-efficient capability set for execution and tight context budgets.",
            "hints": { "contextSize": "compact" },
            "status": "stable"
          }
        ],
        "moreVariantsAvailable": false
      }
    }
  }
}
```

**`availableVariants` presence rules:**

- If `capabilities.extensions["io.modelcontextprotocol/server-variants"]` is absent, the server does not support variants.
- If the extension payload is present and `availableVariants` is present and non-empty, the server supports variants.
- If the extension payload is present but `availableVariants` is absent or empty, clients SHOULD treat this as "no variants supported" for compatibility. Servers SHOULD omit the field rather than returning an empty array.

**Variant enumeration policy (noise-reduction):**

- Servers MAY return a subset of variants to reduce noise, but MUST include:
  - at least 1 `"stable"` variant as the default (first in the list)
  - at least 1 additional fallback variant when possible

- If the server returns a subset while more exist for the principal, it SHOULD set `moreVariantsAvailable: true`.
- Any variants returned MUST be visible to the authenticated principal.

**Invariants (when `availableVariants` is present and non-empty):**

- Each variant `id` MUST be unique within the array.
- The first element MUST have status `"stable"` unless the client explicitly requested experimental variants via `variantHints`.
- Servers SHOULD expose a small number of variants by default (guidance: 2–5) to limit discovery overhead.

**Session stability:**

- Servers MUST treat the returned `availableVariants` set as stable for the lifetime of a connection/session.
- If a server needs to change the variant set, it SHOULD require clients to re-initialize (or reconnect), rather than mutating the set mid-session.

---

### Per-Request Variant Selection

Clients select variants on a per-request basis using a canonical namespaced `_meta` key:

```typescript
// In any request's _meta field:
{
  "_meta": {
    "io.modelcontextprotocol/server-variant": "compact"
  }
}
```

This applies to all capability requests:

- `tools/list`, `tools/call`
- `resources/list`, `resources/read`, `resources/subscribe`
- `prompts/list`, `prompts/get`
- `completion/complete`

When a variant is specified in `_meta`, the server MUST:

1. Validate the variant exists in the `availableVariants` list returned to this principal for this session
2. Apply the capability configuration for that variant for this request

If the variant is invalid, the server MUST return a JSON-RPC error:

```json
{
  "code": -32602,
  "message": "Invalid server variant",
  "data": {
    "requestedVariant": "unknown-variant",
    "availableVariants": ["claude-optimized", "compact"]
  }
}
```

**Privacy rule:** `data.availableVariants` MUST include only variants visible to the authenticated principal. If the principal is not allowed to enumerate variants, the server SHOULD omit `availableVariants` from error data.

**Variants unsupported behavior (normative):**

- If a server does not support this extension and receives `_meta["io.modelcontextprotocol/server-variant"]`, it MUST return `-32602 Invalid params` with message `"Server variants not supported"`.

If no variant is specified in `_meta`, the server MUST use the first (default) variant from `availableVariants` (if supported). If variants are unsupported, the server uses its single implicit default behavior.

---

### Variant-Aware Capability Behavior

When a variant is selected via `_meta`, all server capabilities in that response reflect that variant's configuration:

| Capability      | Variant-Affected Aspects                                   |
| --------------- | ---------------------------------------------------------- |
| **Tools**       | Tool list, descriptions, input/output schemas, annotations |
| **Resources**   | Resource list, URIs, descriptions, MIME types              |
| **Prompts**     | Prompt list, descriptions, argument schemas                |
| **Completions** | Completion suggestions, reference resolution               |

Servers MAY:

- Return different sets of tools/resources/prompts per variant
- Return the same items with different descriptions/schemas per variant
- Combine both approaches

**Capability flag invariant (normative):**

- `initialize.capabilities` MUST be invariant across variants.
- Variants only change the contents returned by list/get endpoints and the behavior of call/read operations within those contents. Variants MUST NOT change top-level support flags (for example, whether tools are supported).

---

### Variant-Scoped Subscriptions and Notifications

Subscriptions and notifications are scoped to the variant that was active when the subscription was created.

#### Subscription Binding

When a client calls `resources/subscribe`, the subscription is implicitly bound to the variant specified in that request's `_meta` (or the default variant if none specified):

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "resources/subscribe",
  "params": {
    "uri": "file:///logs/app.log",
    "_meta": {
      "io.modelcontextprotocol/server-variant": "verbose"
    }
  }
}
```

The server MUST:

1. Record the active variant as part of the subscription state
2. Only send `notifications/resources/updated` for subscriptions where the resource exists in that variant at the time of update dispatch
3. If the resource URI doesn't exist in the requested variant at subscribe time, return error `-32602` with `activeVariant` in the error data

#### Resource Disappearance or Availability Changes

If a resource that was subscribed to later becomes unavailable in that variant (for example, removed from that variant’s namespace):

- Server SHOULD send `notifications/resources/list_changed` with the affected variant in `params._meta`.
- After list change, the server SHOULD stop sending updates for subscriptions that no longer resolve in that variant.
- Clients SHOULD handle `list_changed` by revalidating subscriptions (for example, re-listing resources for the active variant and re-subscribing if needed).
- Servers MUST continue to accept `resources/unsubscribe` for existing subscription ids even if the underlying resource is no longer available.

#### List-Changed Notifications

This SEP does not change notification parameter schemas. Instead, variant identity is carried in `params._meta`:

```json
{
  "method": "notifications/tools/list_changed",
  "params": {
    "_meta": {
      "io.modelcontextprotocol/server-variant": "compact"
    }
  }
}
```

This applies to:

- `notifications/tools/list_changed`
- `notifications/resources/list_changed`
- `notifications/prompts/list_changed`

If `params._meta["io.modelcontextprotocol/server-variant"]` is absent on `list_changed`, clients SHOULD assume all variants may be affected and refetch the active variant(s) they use.

#### Resubscription Across Variants

If a client wants notifications for the same resource URI in a different variant, it MUST:

1. Unsubscribe from the current subscription
2. Create a new subscription with the desired variant in `_meta`

Subscriptions do not automatically transfer between variants.

---

### Cursor and Pagination Scoping

Pagination cursors are scoped to the variant that generated them.

**Rules:**

1. Cursors MUST be treated as opaque and variant-scoped
2. Server MUST mint cursors that are cryptographically or structurally bound to the active variant (opaque encoding is fine)
3. Server MUST reject a cursor used with a different variant than the one that minted it
4. Clients MUST NOT reuse cursors across variants

If a client provides a cursor from a different variant, the server MUST return:

```json
{
  "code": -32602,
  "message": "Cursor invalid for requested variant",
  "data": {
    "cursorVariant": "claude-optimized",
    "requestedVariant": "compact"
  }
}
```

---

### Identifier Namespace Scoping

Tool names, prompt names, and resource URIs are resolved within the active variant's namespace.

**Rules:**

1. When `_meta["io.modelcontextprotocol/server-variant"]` is present, all identifiers in that request are resolved in that variant's namespace
2. A tool/prompt/resource that exists in one variant may not exist in another
3. The same identifier in different variants may refer to different configurations (different schemas, descriptions, etc.)

**Error handling:**

When an identifier is not found, the server SHOULD include `activeVariant` in the error data to aid debugging:

```json
{
  "code": -32602,
  "message": "Unknown tool: debug_logs",
  "data": {
    "activeVariant": "compact",
    "hint": "This tool may be available in other variants"
  }
}
```

---

### Interaction Flow

```
Client                                               Server
  |                                                    |
  |-- Initialize ------------------------------------->|
  |     protocolVersion: "2025-11-25"                  |
  |     clientInfo: { name: "MyAgent", ... }           |
  |     capabilities.extensions[".../server-variants"]|
  |       variantHints: { hints: { modelFamily: ... } }|
  |                                                    |
  |<-- InitializeResult -------------------------------|
  |     capabilities.extensions[".../server-variants"]|
  |       availableVariants: [ ... ranked ... ]        |
  |                                                    |
  |-- tools/list ------------------------------------->|
  |     (no _meta = uses default variant)              |
  |                                                    |
  |<-- Tools for default variant ----------------------|
  |                                                    |
  |-- tools/list ------------------------------------->|
  |     _meta: { "io.modelcontextprotocol/server-variant": "compact" } |
  |                                                    |
  |<-- Tools for "compact" ----------------------------|
  |                                                    |
  |-- resources/subscribe ---------------------------->|
  |     uri: "file:///data/metrics.json"               |
  |     _meta: { "io.modelcontextprotocol/server-variant": "verbose" } |
  |                                                    |
  |<-- OK (subscription bound to "verbose") -----------|
  |                                                    |
  |<-- notifications/resources/updated ----------------|
  |     (only for "verbose" variant resources)         |
```

---

### Variant Selection and Usage

Variant selection is a two-phase process: servers rank variants based on client-provided hints during initialization, then clients can further refine or override this selection on a per-request basis. This cooperative approach enables intelligent matching while preserving client autonomy.

### Overview

The selection lifecycle involves:

1. **Client provides hints**: During `initialize`, the client sends `variantHints` describing its context (model, use case, capabilities)
2. **Server ranks variants**: The server uses these hints to return `availableVariants` in recommended order
3. **Client refines selection**: The client can accept the server's recommendation or apply additional logic to select a different variant
4. **Per-request usage**: The client specifies the selected variant in `_meta` for each request

```
Client                                               Server
  |                                                    |
  |-- Initialize with variantHints ------------------->|
  |     { modelFamily: "anthropic", useCase: "agent" } |
  |                                                    |
  |                    Server ranks variants based on  |
  |                    client hints (rule-based or     |
  |                    intelligent matching)           |
  |                                                    |
  |<-- availableVariants (ranked, first = default) ----|
  |                                                    |
  |  Client refines selection (rule-based or LLM)      |
  |                                                    |
  |-- tools/list with selected variant --------------->|
  |     _meta: { "...server-variant": "agent-plan" }   |
```

### Server-Side Variant Ranking

Servers are responsible for returning `availableVariants` in a useful order based on the client's `variantHints`. The first variant in the list serves as the recommended default.

#### Rule-Based Server Ranking

Simple servers can use deterministic rules to rank variants:

```python
def rank_variants(all_variants, client_hints):
    """Rank variants based on client hints using weighted scoring."""

    def score_variant(variant):
        score = 0
        v_hints = variant.get("hints", {})
        c_hints = client_hints.get("hints", {})

        # Exact match on modelFamily: +100
        if v_hints.get("modelFamily") == c_hints.get("modelFamily"):
            score += 100
        elif v_hints.get("modelFamily") == "any":
            score += 50

        # Match on useCase: +80
        client_use_cases = c_hints.get("useCase", [])
        if isinstance(client_use_cases, str):
            client_use_cases = [client_use_cases]
        if v_hints.get("useCase") in client_use_cases:
            # Higher score for earlier preferences
            idx = client_use_cases.index(v_hints.get("useCase"))
            score += 80 - (idx * 10)

        # Match on contextSize: +40
        client_sizes = c_hints.get("contextSize", [])
        if isinstance(client_sizes, str):
            client_sizes = [client_sizes]
        if v_hints.get("contextSize") in client_sizes:
            idx = client_sizes.index(v_hints.get("contextSize"))
            score += 40 - (idx * 5)

        # Prefer stable variants: +20
        if variant.get("status", "stable") == "stable":
            score += 20

        # Penalize deprecated: -100
        if variant.get("status") == "deprecated":
            score -= 100

        return score

    # Sort by score descending, stable variants first for ties
    ranked = sorted(
        all_variants,
        key=lambda v: (score_variant(v), v.get("status") == "stable"),
        reverse=True
    )

    return ranked
```

**Example**: Given client hints `{ modelFamily: "anthropic", useCase: ["planning", "execution"] }`:

| Variant          | Hints                                    | Score               | Rank |
| ---------------- | ---------------------------------------- | ------------------- | ---- |
| `claude-plan`    | modelFamily=anthropic, useCase=planning  | 100 + 80 + 20 = 200 | 1st  |
| `claude-execute` | modelFamily=anthropic, useCase=execution | 100 + 70 + 20 = 190 | 2nd  |
| `generic-plan`   | modelFamily=any, useCase=planning        | 50 + 80 + 20 = 150  | 3rd  |
| `compact`        | contextSize=compact                      | 0 + 0 + 20 = 20     | 4th  |

#### Intelligent Server Ranking (LLM-Assisted)

Sophisticated servers can use LLM reasoning to rank variants based on the client's freeform description:

```python
async def intelligent_rank_variants(all_variants, client_hints):
    """Use LLM to rank variants based on client context."""

    # First, apply rule-based filtering for efficiency
    candidates = [v for v in all_variants
                  if v.get("status") != "deprecated"]

    # If client provided a description, use LLM for nuanced ranking
    if client_hints.get("description"):
        prompt = f"""
You are ranking server variants for a client.

**Client Context:**
{client_hints.get("description")}

**Client Hints:**
{json.dumps(client_hints.get("hints", {}), indent=2)}

**Available Variants:**
{format_variants_for_llm(candidates)}

Rank these variants from most to least appropriate for this client.
Return a JSON array of variant IDs in order of preference.
Consider:
- How well each variant's purpose matches the client's stated needs
- Model family compatibility
- Context efficiency requirements
- Use case alignment
"""

        ranking = await llm.complete(prompt, response_format="json")

        # Reorder candidates based on LLM ranking
        id_to_variant = {v["id"]: v for v in candidates}
        ranked = [id_to_variant[id] for id in ranking if id in id_to_variant]

        # Append any variants the LLM missed
        ranked_ids = set(v["id"] for v in ranked)
        for v in candidates:
            if v["id"] not in ranked_ids:
                ranked.append(v)

        return ranked

    # Fall back to rule-based for clients without descriptions
    return rule_based_rank(candidates, client_hints)
```

#### Server Ranking Best Practices

1. **Always return at least one stable variant first** (unless client explicitly requests experimental)
2. **Respect client preference ordering**: If `useCase: ["planning", "execution"]`, prioritize planning-focused variants
3. **Consider authorization**: Only include variants the authenticated principal can access
4. **Limit noise**: Return 2-5 variants; set `moreVariantsAvailable: true` if more exist
5. **Cache rankings**: For the same client hints, return consistent rankings within a session

### Client-Side Variant Selection

After receiving the server's ranked `availableVariants`, clients can accept the default (first) variant or apply additional selection logic.

#### Accepting Server Default

The simplest approach—suitable for most clients—is to use the server's recommended default:

```python
# Server already ranked variants; just use the first one
default_variant = available_variants[0]["id"]

# Make requests without specifying variant (uses default)
tools = await client.list_tools()

# Or explicitly specify for clarity
tools = await client.list_tools(variant=default_variant)
```

#### Rule-Based Client Refinement

Clients with specific requirements can apply additional filtering:

```python
def select_variant(available_variants, client_context):
    """Client-side variant selection with business rules."""

    # Start with server's ranking
    candidates = available_variants

    # Apply client-specific filters

    # 1. Context budget constraint
    if client_context.get("remaining_tokens", float("inf")) < 10000:
        # Strongly prefer compact variants when context is tight
        compact = [v for v in candidates
                   if v.get("hints", {}).get("contextSize") == "compact"]
        if compact:
            return compact[0]["id"]

    # 2. Mode-specific override
    current_mode = client_context.get("mode")
    if current_mode == "debugging":
        debug = [v for v in candidates
                 if v.get("hints", {}).get("useCase") == "debugging"]
        if debug:
            return debug[0]["id"]

    # 3. User preference override
    if user_preferred := client_context.get("user_preferred_variant"):
        if user_preferred in [v["id"] for v in candidates]:
            return user_preferred

    # 4. Accept server's recommendation
    return candidates[0]["id"]
```

#### LLM-Assisted Client Selection

Intelligent clients can leverage their LLM to reason about variant selection based on the current task:

```python
async def llm_select_variant(available_variants, task_context):
    """Use LLM to select the best variant for the current task."""

    prompt = f"""
You are helping select the best server variant for the current task.

**Current Task Context:**
- Task: {task_context.get("description")}
- Phase: {task_context.get("phase", "unknown")}
- Context budget: ~{task_context.get("remaining_tokens", "unknown")} tokens remaining
- Model: {task_context.get("model", "unknown")}

**Available Variants (in server-recommended order):**
{format_variants_for_selection(available_variants)}

Select the most appropriate variant for this specific task.
Return JSON: {{"selected": "<variant_id>", "reasoning": "<brief explanation>"}}

Consider:
- The server's recommendation (first variant) unless task context suggests otherwise
- Match between task phase and variant use case
- Context budget constraints
- Whether verbose or compact descriptions are more valuable right now
"""

    result = await llm.complete(prompt, response_format="json")

    # Validate LLM output
    selected_id = result.get("selected")
    if selected_id not in [v["id"] for v in available_variants]:
        # Fall back to server default if LLM hallucinates
        return available_variants[0]["id"]

    return selected_id
```

**Example LLM Response:**

```json
{
  "selected": "agent-plan",
  "reasoning": "The task involves planning a multi-step workflow, which aligns
    directly with agent-plan's purpose. While the server recommended claude-optimized,
    agent-plan's focus on 'detailed parameter documentation and usage examples'
    is more valuable for the planning phase. The 50k context budget can accommodate
    verbose descriptions."
}
```

### Dynamic Variant Switching

Clients can change variants between requests as context evolves:

| Context Change                        | Potential Switch                      |
| ------------------------------------- | ------------------------------------- |
| Transition from planning to execution | `agent-plan` → `agent-execute`        |
| Context budget running low            | `verbose` variant → `compact` variant |
| Encountering errors                   | Current variant → `debug` variant     |
| User requests more detail             | `compact` → `verbose`                 |

**Example workflow with dynamic switching:**

```python
async def execute_workflow(client, task):
    variants = client.available_variants

    # Phase 1: Planning - use verbose variant for understanding
    plan_variant = select_variant(variants, {"phase": "planning", "budget": "high"})
    tools = await client.list_tools(variant=plan_variant)
    plan = await create_plan(tools)

    # Phase 2: Execution - switch to compact for efficiency
    exec_variant = select_variant(variants, {"phase": "execution", "budget": "low"})

    for step in plan.steps:
        result = await client.call_tool(step.tool, step.args, variant=exec_variant)

        # Phase 2b: Error handling - temporarily switch to debug
        if result.is_error:
            debug_variant = select_variant(variants, {"phase": "debugging"})
            diagnostics = await client.call_tool(
                "get_diagnostics", {}, variant=debug_variant
            )
            # Resume with execution variant
```

### Combining Server and Client Intelligence

The most effective selection strategy leverages both server-side ranking and client-side refinement:

```
┌─────────────────────────────────────────────────────────────────┐
│                     Variant Selection Flow                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CLIENT                           SERVER                        │
│  ──────                           ──────                        │
│                                                                 │
│  1. Provide variantHints ────────►                              │
│     - modelFamily                 2. Score all variants         │
│     - useCase preferences         3. Apply authorization        │
│     - contextSize needs           4. Rank by relevance          │
│     - freeform description        5. (Optional) LLM refinement  │
│                                                                 │
│                         ◄──────── 6. Return ranked list         │
│                                      (first = recommended)      │
│                                                                 │
│  7. Receive ranked variants                                     │
│  8. Apply client rules:                                         │
│     - Context budget checks                                     │
│     - Mode-specific overrides                                   │
│     - User preferences                                          │
│  9. (Optional) LLM selection                                    │
│                                                                 │
│  10. Use selected variant ───────► 11. Serve capability         │
│      in _meta                          for that variant         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Caching and Efficiency

Both servers and clients SHOULD cache selection-related computations:

**Server-side caching:**

```python
class VariantRankingCache:
    def __init__(self, ttl_seconds=300):
        self.cache = {}
        self.ttl = ttl_seconds

    def get_ranking(self, client_hints_hash, principal_id):
        key = (client_hints_hash, principal_id)
        if key in self.cache:
            ranking, timestamp = self.cache[key]
            if time.time() - timestamp < self.ttl:
                return ranking
        return None

    def set_ranking(self, client_hints_hash, principal_id, ranking):
        key = (client_hints_hash, principal_id)
        self.cache[key] = (ranking, time.time())
```

**Client-side caching:**

```python
class VariantSelector:
    def __init__(self):
        self.cache = {}

    def select(self, variants, context):
        cache_key = self._context_hash(context)
        if cache_key in self.cache:
            cached = self.cache[cache_key]
            if cached in [v["id"] for v in variants]:
                return cached

        # Only invoke LLM for complex decisions
        if self._is_obvious_choice(variants, context):
            selected = self._apply_simple_rules(variants, context)
        else:
            selected = self._llm_select(variants, context)

        self.cache[cache_key] = selected
        return selected
```

### Security Considerations

1. **Server-side**: Only include variants in the ranking that the authenticated principal is authorized to access
2. **Server-side**: Do not leak variant existence through ranking behavior (unauthorized variants should be invisible)
3. **Client-side**: Validate that any variant selected (by rules or LLM) exists in `availableVariants`
4. **Client-side**: Do not expose sensitive variant names or descriptions to untrusted LLMs
5. **Both sides**: Rate-limit variant-related operations to prevent DoS
6. **Both sides**: Audit variant selection decisions for debugging and security review

---

### Stateless Mode Compatibility

This SEP is designed with a stateless-first approach. Variant selection is per-request via `_meta`, requiring no session state.

#### Per-Request Example

Every capability request can include a variant selection in `_meta`:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {
    "_meta": {
      "io.modelcontextprotocol/server-variant": "claude-optimized"
    }
  }
}
```

This works identically in both stateful and stateless modes:

- **Stateful**: Client discovers variants via `initialize`, then selects per-request
- **Stateless**: Client discovers variants via `initialize` or out-of-band, then selects per-request

#### HTTP Header Support

For HTTP transport, variant selection MAY also be specified via a header as non-normative guidance:

```
MCP-Server-Variant: claude-optimized
```

The `_meta` field is the normative mechanism and takes precedence over the header if both are present and conflict.

#### Future: Stateless Discovery

> **Note**: This section describes potential future compatibility with stateless discovery patterns (e.g., a `server/discover` method). This is contingent on future MCP specification changes and is not part of the current proposal.

If MCP adopts a stateless discovery mechanism, `availableVariants` could be included in the discovery response, allowing clients to discover variants without initialization.

---

## Rationale

### Why Ranked List vs. Negotiation?

We chose a model where servers return a ranked list (based on client hints) rather than pure negotiation because:

1. **Transparency**: Clients can see available options (subject to authorization and server policy) rather than only the server's choice
2. **Client autonomy**: Intelligent clients (or their LLMs) can make informed selections
3. **Flexibility**: Clients can experiment with different variants
4. **Debugging**: Clear visibility into what variants exist and why one was recommended
5. **Graceful degradation**: If the recommended variant doesn't work, clients can try a fallback variant without reconnecting

### Why Freeform Variant Identifiers?

Unlike protocol versions (date-based) or semantic versions, capability variant identifiers are freeform strings because:

1. **Parallel variants**: Variants like `claude-optimized` and `gpt-optimized` are alternatives, not ordered upgrades
2. **Mixed purposes**: Some variants may be model-specific, others use-case-specific
3. **Server freedom**: Servers should name variants meaningfully for their context
4. **Avoid false ordering**: Version-like identifiers imply ordering. Servers SHOULD prefer descriptive names over version-shaped identifiers to reduce confusion.

### Why Server-Level vs. Per-Tool Variants?

Server-level variants were chosen over per-tool variants for several critical reasons:

1. **Coherence**: Tools, prompts, and resources are designed to work together. Mixing capabilities across variants creates unpredictable behavior.
2. **Simplicity**: One variant selection yields consistent behavior across all capabilities.
3. **Alignment with use cases**: Model optimization, agent modes, and context budgets are server-wide concerns.
4. **Single source of truth**: Server author defines which capabilities work together in each variant.

### Why Key-Value Hints Instead of Name-Only Hints?

MCP's `ModelPreferences` uses name-only model hints. This SEP uses key-value hints because:

1. **Richer metadata**: Variant selection spans multiple dimensions beyond model choice.
2. **Consistent matching**: Key-value pairs allow straightforward matching between client preferences and server metadata.
3. **Extensibility**: New hint keys can be introduced without changing the protocol. Unknown keys are ignored.
4. **Preference ordering**: Clients can express fallback preferences via ordered arrays.

### Why Include Description in VariantHints?

We include a freeform description because:

1. **LLM reasoning**: LLM-based clients can reason about variant selection using natural language.
2. **Context beyond hints**: Some client context is not cleanly expressed as key-value pairs.
3. **Symmetry**: Both sides can provide human- and model-readable guidance.

### Why Available Variants Can Vary Per Client?

The `availableVariants` list MAY vary based on:

1. **Authentication/authorization**: Enterprises may expose additional variants only to permitted principals.
2. **Client identity**: A server may tailor or restrict variants for specific client implementations.
3. **Noise reduction**: Servers may return a subset with `moreVariantsAvailable: true`.

In all cases, servers MUST NOT expose variant metadata a principal is not allowed to see.

### Why Not Multiple Tool Names or Multiple Servers?

As detailed in Motivation, alternatives like multiple tool names or separate servers:

- Pollute discovery and waste context
- Lack structured selection and coherent switching
- Increase operational burden and client configuration complexity

Server-level variants provide a unified, structured mechanism with coherent switching and predictable scoping.

### Prior Art

#### GitHub MCP Server

The GitHub MCP server is the most comprehensive prior art, demonstrating real-world demand for exposing different tool surfaces to different agents. It has implemented multiple ad-hoc mechanisms that this SEP aims to standardize:

**Toolsets**: GitHub exposes 18+ toolsets via URL paths (e.g., `/mcp/x/issues`, `/mcp/x/pull_requests`, `/mcp/x/code_security`), allowing agents to connect to purpose-specific tool surfaces. This directly validates the core thesis: tools need different surface areas for reusability across different agent types.

**Access Control Variants**: Read-only mode (`--read-only`) exposes only read operations; lockdown mode (`--lockdown-mode`) filters content based on author permissions. These map to variant hints like `{ "accessLevel": "readonly" }`.

**Dynamic Tool Discovery**: The `--dynamic-toolsets` flag allows runtime toolset selection. Server variants provide the standardized protocol for this.

**Description Overrides**: Environment variables allow customizing tool descriptions for localization. Server variants unify this with toolset selection.

GitHub has built five separate mechanisms to solve facets of the same problem. This fragmentation has costs: no protocol-level enumeration, no cross-server consistency, startup-time-only configuration. Server variants address all of these.

#### MCP Sampling: ModelPreferences

The `ModelPreferences` interface in MCP sampling provides the closest prior art within the protocol itself. This SEP extends that pattern:

- **Hints**: Expanded from name-only to key-value pairs for richer metadata
- **Description**: Added for LLM reasoning
- **Server-side ranking**: Servers rank variants rather than clients computing priorities

#### Related Issues

- [Issue #469](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/469): Model-Aware Content Adaptation
- [Issue #476](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/476): Versioning schemes for non-breaking changes
- [Issue #1039](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1039): Tool versioning documentation and standardization requests
- [Issue #1281](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1281): Enterprise challenges with spec negotiation and multi-server clients
- [Issue #1575](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1575): Community discussion on tool versioning approaches

### Acknowledgments

- Contributors to the model hints discussion in sampling specification
- Community members who provided feedback on per-tool vs. server-level variant trade-offs

---

## Backward Compatibility

This proposal is **fully backward compatible**:

1. **No core schema expansion**: All new data is carried in `capabilities.extensions` under a negotiated extension id
2. **Absent extension = default behavior**: Servers without the extension work exactly as before
3. **Clients can ignore extension payloads**: Existing clients ignore `capabilities.extensions`
4. **No breaking changes**: All existing requests and responses remain valid

### Migration Path

1. **Servers**: Advertise the extension and include `availableVariants` when ready
2. **Clients**: Optionally send `variantHints` and handle `availableVariants`
3. **Gradual adoption**: No coordination required between clients and servers

---

## Security Implications

### Variant Enumeration

Servers expose available variants to clients. If variant names reveal sensitive information, this can be a privacy concern.

**Mitigation**: Use generic variant names. Sensitive customizations should rely on authentication/authorization, not revealing names.

### Variant-Based Authorization (Anti-Pattern)

**Variant selection is not an authorization mechanism.** While variants MAY expose different capability sets (e.g., `analysis-only` vs `autonomous-trading`), this is for workflow optimization, not security.

**Requirements:**

1. Servers MUST enforce authorization independently of variant selection
2. A client selecting a variant MUST NOT gain access to tools/resources the principal is not authorized to use
3. Variants that appear to restrict capabilities (e.g., "read-only") MUST still have backend authorization checks

### Denial of Service

Clients could request many different variants rapidly, potentially increasing server load.

**Mitigation**: Servers SHOULD cache capability lists per variant and MAY rate-limit rapid variant switching per principal/session.

---

## Reference Implementation

_To be added before Final status._

---

## Open Questions

1. **Variant change notifications**: This SEP requires the variant set returned at initialization to be stable for the lifetime of a connection/session. A future extension could add a `notifications/.../list_changed` for variants themselves if the ecosystem needs mid-session updates.

2. **Variant inheritance in sampling**: When a server requests sampling from the client, should the server's active variant context be communicated?

3. **Variant in error responses**: Should error responses include which variant was active when the error occurred? (Current proposal: yes, via `activeVariant` in error data where applicable)

---

## Implementation Notes

> **Note**: This section is non-normative but intended to make the proposal shippable without guesswork.

### Response Caching

- Servers SHOULD precompute and cache `tools/list`, `resources/list`, and `prompts/list` responses per variant per principal (or per auth scope) to avoid recomputing on every request.
- Clients SHOULD cache list results per variant and refresh on `list_changed` notifications scoped to that variant.

### Rate Limiting and DoS Hardening

- Servers MAY rate-limit variant switching by principal/session (for example, token bucket on requests that change `_meta["io.modelcontextprotocol/server-variant"]`).
- If rate-limiting triggers, servers SHOULD return a standard JSON-RPC error appropriate to the transport and include `activeVariant` in error data when helpful.

### Debugging Consistency

- Servers SHOULD include `activeVariant` in error `data` for variant-scoped resolution failures (unknown tool/prompt/resource, invalid cursor, invalid subscription context).
- Clients SHOULD, on `Invalid server variant` errors, retry once without specifying a variant (fall back to default), then surface a clear error if it still fails.

### Cursor Binding

- Cursor binding can be implemented via opaque tokens that embed or MAC the variant id (or a stable variant hash) to allow fast validation without server-side cursor state.
- Servers SHOULD reject mismatched cursors with `-32602` and include `cursorVariant` and `requestedVariant` as shown above.
