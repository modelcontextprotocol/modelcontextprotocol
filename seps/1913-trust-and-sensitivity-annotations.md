# SEP-1913: Trust and Sensitivity Annotations

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2025-06-11
- **Author(s)**: Sam Morrow (@SamMorrowDrums), Rob Reichel (@rreichel3)
- **Sponsor**: @dend
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1913

> **Related Issue**: [#711](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/711)

## Abstract

This SEP proposes a unified security metadata model for MCP that combines **trust annotations** (data-in-transit) with **action security metadata** (tool behavior, including sensitivity categories). Together, these primitives allow clients and servers to track, propagate, and enforce trust boundaries on data as it flows through tool invocations, while also declaring what tools are allowed to do with that data.

The proposal introduces:

1. **Extended tool annotations** with declarable annotation sets for pre-execution metadata via Tool Resolution
2. **Action security metadata** describing input destinations, output sources, and real-world outcomes
3. **Result annotations** for marking data characteristics in tool responses
4. **Request annotations** for propagating trust context to servers
5. **Propagation rules** ensuring trust markers persist across session boundaries
6. **Malicious activity signaling** for security alerting and compliance

This pattern enables:

- **Deterministic enforcement** through declarative contracts for tool behavior
- **Data exfiltration prevention** by tracking when sensitive data flows to open-world destinations
- **Prompt injection defense** by marking untrusted data sources
- **Compliance workflows** via human-in-the-loop escalation for risky operations
- **Attribution tracking** for audit trails and provenance
- **Pre-execution assessment** via integration with Tool Resolution ([#1862](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1862)) for argument-derived annotations

> **Note**: This SEP provides primitives, not a complete security solution. It enables host applications and registries to define situation-specific policies while avoiding over-specification of universal rules.

This draft incorporates the Action Security Metadata proposal (SEP-2061) by adding `inputMetadata` and `returnMetadata` to `ToolAnnotations`.

## Motivation

### The Problem with Untracked Data Flow

As MCP adoption grows, data flows across tool boundaries without standardized trust metadata:

**1. Indirect Prompt Injection**

Data from untrusted sources (web pages, emails, user-generated content) enters the context without markers indicating its origin. An attacker can embed instructions in this data that the model may execute.

Recent research demonstrates the severity: Trail of Bits showed how [hidden content in GitHub issues](https://blog.trailofbits.com/2025/08/06/prompt-injection-engineering-for-attackers-exploiting-github-copilot/) can inject invisible prompt attacks that cause agents to insert backdoors in pull requests. The IBM/Google/Microsoft "Design Patterns for Securing LLM Agents" paper ([arXiv:2506.08837](https://arxiv.org/abs/2506.08837)) states:

> "Once an LLM agent has ingested untrusted input, it must be constrained so that it is impossible for that input to trigger any consequential actions."

**2. Data Exfiltration**

Sensitive information (credentials, PII, proprietary data) can be passed to tools that write to external destinations. Without declared data classifications and action metadata, clients cannot enforce policies like "don't email private repo content to external addresses."

**3. Cross-Organization Boundaries**

In multi-organization scenarios, what's "internal" in one context may be "external" in another. Current MCP has no way to express or propagate these distinctions.

**4. Compliance Requirements**

Regulated industries (healthcare, finance) need audit trails and sensitivity classifications. Without standardized annotations, each implementation reinvents this wheel.

### The Problem with Undeclared Tool Actions

MCP today treats all tool calls as equivalent at the protocol level. A tool that reads drafts and a tool that sends emails are indistinguishable (other than the most basic static Annotations), even though their security and privacy implications are radically different. Implementations fall back to heuristics or model inference to decide when to request user consent or block operations.

This creates concrete risks:

- **Prompt injection** can trigger destructive or irreversible actions using untrusted input.
- **Data exfiltration** can occur when sensitive data is passed to tools that transmit externally.
- **User consent** cannot be meaningfully enforced without knowing a tool's real-world impact.
- **Distrust by default** leads to confirmation fatigue and bad user experience.

Action security metadata provides a declarative contract that describes where inputs go, where outputs originate, and what outcomes the tool can cause. This complements trust annotations, which track data characteristics in transit.

### Enabling Security Architecture Patterns

Recent research proposes several design patterns for secure LLM agents. Trust annotations provide the **primitives** these patterns need at protocol boundaries:

| Pattern               | Trust Annotation Role                                                                            |
| :-------------------- | :----------------------------------------------------------------------------------------------- |
| **Plan-Then-Execute** | Planning phase uses `openWorldHint` and action metadata to determine allowed tool sequences      |
| **Map-Reduce**        | Isolated agents return results with annotations; aggregation enforces sensitivity policies       |
| **Dual LLM**          | Privileged LLM receives annotations on quarantined results to make display decisions             |
| **ShardGuard**        | Coordination service uses annotations to select sanitization functions and opaque value policies |
| **FIDES (IFC)**       | Annotations serve as data labels for deterministic information flow control                      |

Without protocol-level annotations, each security architecture must reinvent data classification.

### Critical: Malicious Activity Detection

MCP servers are increasingly implementing detection for:

- Prompt injection attempts
- Secret/credential leakage
- Anomalous request patterns

Without standardized signaling, these security findings are lost between tool boundaries. The `maliciousActivityHint` annotation is essential for:

- User/admin alerting in compliance scenarios
- Human-in-the-loop review and escalation
- Audit logging of suspicious activity

### Example: Email MCP Scenario

Consider a user asking an AI to: "Take the salary spreadsheet and email it to my accountant"

With annotations:

1. File MCP resolves `returnMetadata` to indicate internal origin (and `sensitivity: "financial"` for this path)
2. Email MCP declares `inputMetadata.destination: "public"` and `outcomes: "irreversible"`
3. Policy triggers: block, escalate, or require user confirmation

Without trust annotations: The email goes through with no checks.

## Specification

### Terminology

**Agent session** (or simply "session" in this SEP): A client-side concept representing a sequence of user interactions where subsequent requests share the same agent context window. This is the conversation or task boundary as perceived by the user—for example, a chat thread in an AI assistant or a task execution in an agentic workflow.

This is distinct from **MCP session**, which refers to the protocol-level connection between a client and server (as defined in the MCP specification). Trust annotations propagate across an _agent session_, which may span multiple MCP sessions or interact with multiple MCP servers.

### Annotation Types

#### Extended Tool Annotations

This SEP extends the existing `ToolAnnotations` interface with trust-related fields. This unified approach means:

- **Static declarations**: Tools declare the set of annotations they might return in `tools/list`
- **Resolved declarations**: `tools/resolve` selects concrete annotations for specific arguments
- **Response declarations**: `CallToolResult` includes annotations describing actual returned data

In `tools/list`, annotation fields express **possible** values. For boolean hints, `true` means the hint may be set; `false` or omission means it will never be set. For enum-like fields (for example `inputMetadata.outcomes`), tools MAY declare a set of possible values using an array; `tools/resolve` and responses SHOULD return a single resolved value.

```typescript
/**
 * Extended ToolAnnotations with trust and security metadata fields.
 * These fields follow a possible-set → resolved-value pattern:
 * tools/list declares potential annotations, tools/resolve resolves them.
 */
interface ToolAnnotations {
  // Existing hints (unchanged)
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;

  // NEW: Trust extensions

  /**
   * Indicates detected or suspected malicious activity in the request
   * or response content. Clients SHOULD surface this to users and
   * MAY invoke elicitation for user review.
   */
  maliciousActivityHint?: boolean;

  /**
   * Attribution for data provenance. Lists sources contributing to
   * this response for audit and compliance purposes.
   *
   * Attribution strings SHOULD use URIs that meaningfully identify the source:
   * - MCP server origins: "mcp://server-name.domain/path/to/resource"
   * - HTTPS sources: "https://api.example.com/endpoint"
   * - Known local files with domain context: "local://WORKSTATION.corp.acme.com/path/file"
   * - Anonymous local files (unknown origin): "local:anonymous/path/file"
   * - Organization resources: "urn:org:acme:hr:salaries"
   *
   * Avoid opaque file:// URIs that don't convey meaningful provenance.
   */
  attribution?: string[];

  /**
   * Declarative contract for how the tool handles input data.
   */
  inputMetadata?: InputMetadata;

  /**
   * Declarative contract for the origin and sensitivity of outputs.
   */
  returnMetadata?: ReturnMetadata;
}
```

**Note on `openWorldHint`**: This existing field gains additional meaning in the trust context:

- **Tool-level (static)**: "This tool may access external systems"
- **Resolved (via `tools/resolve`)**: "This specific operation will access external/untrusted sources"
- **Response-level**: "This response contains data from untrusted sources"

Examples of untrusted sources requiring `openWorldHint: true`:

- Web page content (potential invisible prompt injection)
- Email bodies (user-controlled content)
- GitHub issues, PR descriptions, comments (attacker-controlled)
- User-generated content from any platform
- Search results from Bing, Google, or other web searches
- Database query results with user-supplied data

#### Action Security Metadata

Action security metadata declares a tool's **behavioral contract**: where inputs may be stored or transmitted, where outputs originate, and what outcomes the tool can cause. These fields live on `ToolAnnotations` and follow the same **possible-set → resolved-value** pattern as other tool annotations:

- **Static declarations** in `tools/list` describe the set of possible behaviors
- **Resolved declarations** in `tools/resolve` select concrete values based on specific arguments

Unlike trust annotations (which describe actual data in transit), action metadata is **declarative** and describes what the tool is allowed to do with data.

```typescript
interface InputMetadata {
  /**
   * Where input data may be stored or transmitted.
   */
  destination:
    | "ephemeral"
    | "system"
    | "user"
    | "internal"
    | "public"
    | Array<"ephemeral" | "system" | "user" | "internal" | "public">;

  /**
   * Sensitivity class(es) the tool may accept.
   */
  sensitivity: DataClass | DataClass[];

  /**
   * Real-world impact of invoking the tool.
   */
  outcomes:
    | "benign"
    | "consequential"
    | "irreversible"
    | Array<"benign" | "consequential" | "irreversible">;
}

interface ReturnMetadata {
  /**
   * Origin of returned data.
   */
  source:
    | "untrustedPublic"
    | "trustedPublic"
    | "internal"
    | "user"
    | "system"
    | Array<
        "untrustedPublic" | "trustedPublic" | "internal" | "user" | "system"
      >;

  /**
   * Sensitivity class(es) the tool may return.
   */
  sensitivity: DataClass | DataClass[];
}

type DataClass =
  | "none"
  | "user"
  | "pii"
  | "financial"
  | "credentials"
  | { regulated: { scopes: RegulatoryScope[] } };

type RegulatoryScope = string;
```

`DataClass` keeps sensitivity simple for common cases while allowing regulated data to be scoped. The `regulated` form declares applicable regimes; it does not assert compliance.

`RegulatoryScope` accepts arbitrary strings. The following are suggested examples for common regimes: GDPR, CCPA, HIPAA, GLBA, PCI-DSS, FERPA, COPPA, SOX.

For action metadata, enum-valued fields MAY be arrays in `tools/list` to indicate possible values; `tools/resolve` SHOULD return a single resolved value.

##### Destination

Specifies where input data may be stored or transmitted.

- **ephemeral** — Data received will not be stored in any way.
- **system** — Data is stored by the platform and not accessible to users or developers.
- **user** — Data is stored and visible only to the end user.
- **internal** — Data is stored and visible to a restricted internal audience.
- **public** — Data may be transmitted to or stored in publicly accessible systems.

##### Outcomes

Describes the real-world impact of invoking the tool.

- **benign** — No persistent state change outside the tool's execution context, or changes limited to private drafts that are not transmitted or shared.
- **consequential** — Creates, updates, or deletes persistent state that is visible outside the tool's private context and can be programmatically reversed.
- **irreversible** — Produces effects that cannot be undone through the same API or that trigger external side effects (e.g., sending messages, deleting data, publishing content).

##### Source

Indicates the origin of returned data.

- **untrustedPublic** — Public but unverified sources.
- **trustedPublic** — Public but curated or verified sources.
- **internal** — Internal systems or datasets.
- **user** — User-provided or user-owned data.
- **system** — Generated or derived by the platform itself.

#### Result Annotations

Tools **MAY** include annotations in their results to describe data characteristics:

Clients **MAY** include annotations in requests to communicate trust context:

```typescript
interface RequestAnnotations {
  /**
   * Whether prior context includes open-world (untrusted) data.
   */
  openWorldHint?: boolean;

  /**
   * Aggregated attribution from prior context.
   */
  attribution?: string[];
}
```

### Protocol Changes

#### Tool Call Request Extension

The `CallToolRequest` params **MAY** include trust annotations:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "send_email",
    "arguments": {
      "to": "external@example.com",
      "subject": "Report",
      "body": "..."
    },
    "_meta": {
      "annotations": {
        "attribution": ["mcp://file-server.acme.local/hr/salaries.xlsx"]
      }
    }
  }
}
```

#### Tool Call Result Extension

The `CallToolResult` **MAY** include trust annotations at the response level:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "File contents..."
      }
    ],
    "_meta": {
      "annotations": {
        "attribution": ["mcp://file-server.acme.local/hr/salaries.xlsx"]
      }
    }
  }
}
```

#### Response Annotations Scope

Response annotations describe the **entire response** as a unit. Servers **MUST** aggregate annotations across all content:

- **openWorldHint**: If any content is open-world, the response has that hint
- **maliciousActivityHint**: If any content is flagged, the response has that hint
- **attribution**: Union of all sources contributing to the response

> **Note**: Per-item annotations (marking individual content items differently) are explicitly **out of scope** for this SEP. This simplifies implementation and avoids complexity around item-level tracking. If needed, per-item annotations can be proposed in a future SEP.

### Schema Definitions

#### ToolAnnotations Extension

The following fields are added to the existing `ToolAnnotations` interface:

```typescript
/**
 * Extended ToolAnnotations with trust and security metadata fields.
 */
export interface ToolAnnotations {
  // ... existing fields ...

  // Trust extensions
  maliciousActivityHint?: boolean;
  attribution?: string[];

  // Action security metadata
  inputMetadata?: InputMetadata;
  returnMetadata?: ReturnMetadata;
}
```

Array forms indicate **possible** values and are intended for `tools/list` (and `tools/resolve` when it cannot fully resolve). Responses should return single concrete values.

#### JSON Schema Additions

Add to the existing `ToolAnnotations` definition in `schema.json`, and introduce new `$defs` for action metadata:

```json
{
  "ToolAnnotations": {
    "properties": {
      "maliciousActivityHint": {
        "description": "Indicates detected or suspected malicious activity.",
        "type": "boolean"
      },
      "attribution": {
        "description": "Sources contributing to this data for audit purposes.",
        "type": "array",
        "items": { "type": "string" }
      },
      "inputMetadata": { "$ref": "#/$defs/InputMetadata" },
      "returnMetadata": { "$ref": "#/$defs/ReturnMetadata" }
    }
  },
  "InputMetadata": {
    "type": "object",
    "properties": {
      "destination": {
        "oneOf": [
          {
            "type": "string",
            "enum": ["ephemeral", "system", "user", "internal", "public"]
          },
          {
            "type": "array",
            "items": {
              "type": "string",
              "enum": ["ephemeral", "system", "user", "internal", "public"]
            }
          }
        ]
      },
      "sensitivity": { "$ref": "#/$defs/DataClassOrArray" },
      "outcomes": {
        "oneOf": [
          {
            "type": "string",
            "enum": ["benign", "consequential", "irreversible"]
          },
          {
            "type": "array",
            "items": {
              "type": "string",
              "enum": ["benign", "consequential", "irreversible"]
            }
          }
        ]
      }
    },
    "required": ["destination", "sensitivity", "outcomes"],
    "additionalProperties": false
  },
  "ReturnMetadata": {
    "type": "object",
    "properties": {
      "source": {
        "oneOf": [
          {
            "type": "string",
            "enum": [
              "untrustedPublic",
              "trustedPublic",
              "internal",
              "user",
              "system"
            ]
          },
          {
            "type": "array",
            "items": {
              "type": "string",
              "enum": [
                "untrustedPublic",
                "trustedPublic",
                "internal",
                "user",
                "system"
              ]
            }
          }
        ]
      },
      "sensitivity": { "$ref": "#/$defs/DataClassOrArray" }
    },
    "required": ["source", "sensitivity"],
    "additionalProperties": false
  },
  "DataClassOrArray": {
    "oneOf": [
      { "$ref": "#/$defs/DataClass" },
      { "type": "array", "items": { "$ref": "#/$defs/DataClass" } }
    ]
  },
  "DataClass": {
    "oneOf": [
      {
        "type": "string",
        "enum": ["none", "user", "pii", "financial", "credentials"]
      },
      {
        "type": "object",
        "properties": {
          "regulated": {
            "type": "object",
            "properties": {
              "scopes": {
                "type": "array",
                "items": { "$ref": "#/$defs/RegulatoryScope" }
              }
            },
            "required": ["scopes"],
            "additionalProperties": false
          }
        },
        "required": ["regulated"],
        "additionalProperties": false
      }
    ]
  },
  "RegulatoryScope": {
    "type": "string",
    "examples": [
      "GDPR",
      "CCPA",
      "HIPAA",
      "GLBA",
      "PCI-DSS",
      "FERPA",
      "COPPA",
      "SOX"
    ]
  }
}
```

### Integration with Tool Resolution

When used with the Tool Resolution mechanism ([SEP #1862](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1862)), trust annotations can be **derived from arguments before tool execution**. The same applies to action security metadata: servers MAY refine `inputMetadata` and `returnMetadata` based on the specific arguments. This enables clients to make policy decisions without invoking the tool.

#### Pre-execution Annotation Refinement

Servers supporting `tools/resolve` **MAY** return trust annotations in the resolved tool's `annotations` field. This follows the same pattern as other tool annotations: the tool declares the **set of possible annotations** in `tools/list`, and `tools/resolve` selects concrete values for the given arguments.

```json
// Request: What annotations will apply if I read this file?
{
  "method": "tools/resolve",
  "params": {
    "name": "read_file",
    "arguments": { "path": "/internal/salaries.xlsx" }
  }
}

// Response: Server knows this path is internal and classified as financial
{
  "tool": {
    "name": "read_file",
    "annotations": {
      "readOnlyHint": true,
      "openWorldHint": false,
      "attribution": ["mcp://file-server.acme.local/hr/salaries.xlsx"],
      "returnMetadata": {
        "source": "internal",
        "sensitivity": "financial"
      }
    }
  }
}
```

This allows clients to:

1. **Apply policies before execution** (block, escalate, require confirmation)
2. **Avoid unnecessary tool calls** when policy would reject the result anyway
3. **Inform users upfront** about action metadata implications (destination, source, outcomes)

#### Limitations for Dynamic Content

Pre-execution annotations work best when metadata can be determined from arguments alone (e.g., file paths, database names). For tools that search or aggregate content:

- **Search tools**: Results may contain mixed sources—annotations cannot be fully determined until results are parsed
- **List operations**: Individual items may have different sensitivity levels
- **Aggregation tools**: Combined results inherit the maximum sensitivity of all inputs

In these cases, servers **SHOULD** return the narrowest possible set at resolve time, and MAY fall back to conservative single values if they cannot determine a precise resolution. Actual results should still include concrete annotations.

#### Action Metadata Examples

##### Read Email Drafts Action

```jsonc
{
  "name": "read_drafts",
  "description": "Read the user's email drafts.",
  "inputSchema": {
    "type": "object",
    "additionalProperties": false,
  },
  "annotations": {
    "inputMetadata": {
      "destination": "ephemeral",
      "sensitivity": "none",
      "outcomes": "benign",
    },
    "returnMetadata": {
      "source": "user",
      "sensitivity": "pii",
    },
  },
}
```

##### List Email Inbox Action

```jsonc
{
  "name": "list_inbox",
  "description": "List recent emails in the user's inbox.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "limit": { "type": "number" },
    },
    "required": [],
    "additionalProperties": false,
  },
  "annotations": {
    "inputMetadata": {
      "destination": "ephemeral",
      "sensitivity": "none",
      "outcomes": "benign",
    },
    "returnMetadata": {
      "source": "untrustedPublic",
      "sensitivity": ["pii", "user"],
    },
  },
}
```

##### Send Email Action

```jsonc
{
  "name": "send_email",
  "description": "Send an email on behalf of the user.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "to": { "type": "string", "format": "email" },
      "subject": { "type": "string" },
      "body": { "type": "string" },
    },
    "required": ["to", "subject", "body"],
    "additionalProperties": false,
  },
  "annotations": {
    "inputMetadata": {
      "destination": "public",
      "sensitivity": ["pii", "user"],
      "outcomes": "irreversible",
    },
    "returnMetadata": {
      "source": "system",
      "sensitivity": "none",
    },
  },
}
```

### Behavior Requirements

#### Propagation Rules

1. **Boolean union**: If `openWorldHint` is ever true, it **MUST** persist for the session
2. **Attribution accumulation**: `attribution` lists **SHOULD** be merged (union) across context boundaries

#### Server Responsibilities

1. Servers **MAY** emit trust annotations in responses when they have knowledge of data characteristics
2. Servers **MUST** respect trust annotations in requests when making policy decisions
3. Servers **MAY** refuse operations when trust annotations indicate policy violations
4. Servers **SHOULD** include `maliciousActivityHint` when detecting suspicious patterns
5. Servers **SHOULD** return early or invoke [elicitation](https://modelcontextprotocol.io/specification/draft/client/elicitation) if potentially malicious activity is detected mid-way through exection of a task.
6. Servers **SHOULD** declare possible `inputMetadata`/`returnMetadata` sets in `tools/list`, and **MAY** refine these via `tools/resolve` to concrete values when arguments are known.

#### Client Responsibilities

1. Clients **MUST** propagate annotations according to propagation rules
2. Clients **MAY** enforce basic policies (block, escalate, require confirmation)
3. Clients **SHOULD** surface `maliciousActivityHint` to users
4. Clients **MAY** present attribution data as part of confirmation dialogs
5. Clients **SHOULD** consider action security metadata for policy and consent decisions, and **MUST** treat all annotations as untrusted hints unless the server is trusted.

### Enforcement Examples

#### Example 1: Email with Open-World Data

```mermaid
sequenceDiagram
    participant User
    participant Client
    participant Web MCP
    participant Email MCP

    User->>Client: "Summarize this webpage and email it to accountant@external.com"
    Client->>Web MCP: tools/call (fetch URL)
    Web MCP-->>Client: Result (openWorldHint: true, attribution: [url])

    Note over Client: Propagate annotations
    Client->>Email MCP: tools/call (send email)<br/>annotations: {openWorldHint: true}

    alt Policy: Block external + open-world
        Email MCP-->>Client: Error: Cannot send untrusted content externally
    else Policy: Escalate
        Email MCP-->>Client: Requires confirmation
        Client->>User: "Send open-world content to external address?"
        User->>Client: Confirm
        Client->>Email MCP: tools/call (with user confirmation)
    end
```

#### Example 2: Malicious Content Detection

```mermaid
sequenceDiagram
    participant User
    participant Client
    participant Web MCP
    participant LLM

    User->>Client: "Summarize this webpage"
    Client->>Web MCP: tools/call (fetch URL)

    Note over Web MCP: Detects prompt injection<br/>in page content
    Web MCP-->>Client: Result (maliciousActivityHint: true,<br/>openWorldHint: true)

    Client->>User: ⚠️ Warning: Potential malicious content detected
    Client->>Client: Apply additional filtering
    Client->>LLM: Context with warnings attached
```

### Policy Layer (Non-Normative)

This SEP intentionally does not specify policies. Example policies that hosts/registries might implement:

```typescript
// Example policy rules (not part of spec)
const examplePolicies = {
  rules: [
    {
      name: "block-open-world-to-external",
      effect: "block",
      conditions: {
        and: [
          { fact: "request.annotations.openWorldHint", equals: true },
          {
            fact: "tool.annotations.inputMetadata.destination",
            equals: "public",
          },
        ],
      },
    },
    {
      name: "escalate-malicious",
      effect: "escalate",
      conditions: {
        fact: "response.annotations.maliciousActivityHint",
        equals: true,
      },
    },
    {
      name: "confirm-irreversible-actions",
      effect: "escalate",
      conditions: {
        fact: "tool.annotations.inputMetadata.outcomes",
        equals: "irreversible",
      },
    },
  ],
};
```

## Rationale

### Design Decisions

#### Why Defense-in-Depth, Not Binary Trust?

A common objection is: "Nothing external is truly safe—why bother with annotations?" This misunderstands the goal.

Trust annotations implement **defense-in-depth**, not binary security:

1. **LLMs should validate any input** — absolutely correct
2. **MCP clients provide additional context** — they know which servers are trusted, which outputs came from open-world tools, and can apply incremental validation
3. **Layered validation is more accurate** — because the client has full context (session history, user permissions, organizational policies), it can make more precise decisions than the LLM alone

Even trusted MCP servers can return unpredictable data. Outputs from tools like web search or cloud storage queries may contain content the server cannot fully vet. Annotations enable servers to signal when results come from "signed" (known-safe) versus "unsigned" (untrusted) sources.

The point isn't to guarantee safety—it's to provide the primitives for layered defense.

#### Why Hints, Not Absolute Classifications?

Following the existing MCP annotation pattern (e.g., `readOnlyHint`, `destructiveHint`), we use "hint" suffix because:

1. **Servers may not have complete knowledge** of data sensitivity
2. **Classifications vary by context** (what's sensitive to one org may not be to another)
3. **Encourages layered defense** rather than relying solely on annotations

Action security metadata uses `DataClass` for **categorical** declarations (PII, financial, regulated scopes). Implementations can map these categories to internal sensitivity levels if desired, but the protocol does not mandate a specific scale.

#### Why Not Information Flow Control (IFC) Labels?

@JustinCappos [suggested](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/711#issuecomment-2967516811) IFC-style categorical labels instead of linear sensitivity. This is a valid approach with tradeoffs:

| Approach                     | Pros                                   | Cons                                |
| :--------------------------- | :------------------------------------- | :---------------------------------- |
| Categorical (`DataClass`)    | Simple, familiar, easy to implement    | Less expressive for complex flows   |
| Full IFC labels (namespaced) | More precise data compartmentalization | Requires label namespace management |

Microsoft's FIDES system demonstrates enterprise IFC for LLM workflows—Mark Russinovich noted that "the goal is to get data labels added to those protocols." Meanwhile, research into architectural approaches like ShardGuard suggests that compartmentalization (planning LLM + isolated execution) can achieve IFC-like properties without explicit labeling.

**Key insight:** These approaches are complementary, not competing. Architectural patterns (compartmentalization, isolation) work _within_ a system, while protocol annotations enable security _across_ system boundaries. A ShardGuard coordination service benefits from knowing incoming data is labeled `financial` or `pii`; a FIDES policy engine needs standardized labels to evaluate.

This SEP starts with a simple categorical approach. Future SEPs could add namespaced labels as an extension, potentially using reverse-DNS notation for organization-specific labels (e.g., `com.mycorp.project.classified`).

#### Why Separate openWorldHint for Data vs. Tools?

The existing Tool `openWorldHint` indicates the tool has unbounded access. The data `openWorldHint` indicates the data itself originates from or may be exposed to untrusted sources. These are distinct:

- A tool accessing a public API has `openWorldHint: true` on the tool
- Data fetched from that API has `openWorldHint: true` on the result
- An internal tool might return data that was originally from external sources

#### Why Include maliciousActivityHint?

This is the most critical annotation. From the original proposal:

> "If no other part of this RFC is adopted, the inclusion of `maliciousActivityHint` is essential."

Without this, security signals are lost between tool boundaries. Servers implementing threat detection have no standardized way to communicate findings.

### Alternatives Considered

#### Alternative 1: Separate TrustAnnotations Type

Define a separate `TrustAnnotations` interface distinct from `ToolAnnotations`, placed in `_meta.annotations` on tools and responses.

**Why rejected:**

- Creates unnecessary nesting (`tool._meta.annotations` vs `tool.annotations`)
- The paradigm already fits: existing `ToolAnnotations` use a possible-set → resolved-value pattern
- `openWorldHint` already exists in `ToolAnnotations` and naturally extends to trust context
- Tool Resolution ([SEP #1862](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1862)) refines annotations based on arguments—trust fields benefit from this same pattern
- Simpler implementation: one annotations field to check, not two

#### Alternative 2: Full IFC System

Implement complete Information Flow Control with declassifiers, label lattices, and taint tracking.

**Why rejected (for now):**

- Significantly more complex to implement
- Requires solving namespace management
- May require certification for declassifiers
- Can be added in future SEP if simpler approach proves insufficient

#### Alternative 3: Organization-Specific Schemas

Let each organization define their own annotation vocabularies (HIPAA, PCI, etc.).

**Why rejected (for now):**

- No interoperability between organizations
- Each MCP server must understand multiple schemas
- Can be added as extension mechanism in future

#### Alternative 4: No Specification

Leave trust handling to individual implementations.

**Why rejected:**

- Security signals lost at tool boundaries
- No common language for policy enforcement
- Every implementation reinvents the wheel
- Compliance workflows impossible to standardize

## Backward Compatibility

This proposal is **fully backward compatible**:

### For Existing Servers

- No changes required
- Servers without annotation support continue working
- Annotations are optional metadata in `_meta`

### For Existing Clients

- No changes required
- Clients can ignore annotations they don't understand
- Operations proceed normally without annotation support

### Graceful Degradation

- Missing annotations treated as unknown (not as "safe")
- Clients should apply appropriate defaults for unlabeled data
- No enforcement happens without annotation support

## Security Implications

### Trust Model

Trust annotations are metadata provided by servers and clients. They do not replace security controls:

1. **Malicious servers** could omit or misrepresent annotations
   - Mitigation: Apply same trust evaluation as other server outputs
   - Defense in depth: Additional scanning at client/host level

2. **Annotation stripping** if intermediaries don't propagate
   - Mitigation: Propagation rules are MUST requirements
   - Monitoring: Hosts can detect missing expected annotations

3. **False positives** for `maliciousActivityHint`
   - Mitigation: Present as warning, not automatic block
   - User agency: Human-in-the-loop for final decisions

4. **Incorrect or malicious action metadata**
   - Risk: Tools may understate destinations, sources, or outcomes
   - Mitigation: Treat metadata as hints, prefer conservative policies, and audit high-risk tools

### Not a Complete Solution

This SEP explicitly acknowledges limitations:

- Cannot prevent all data exfiltration (side channels exist)
- Cannot ensure perfect classification (servers have limited knowledge)
- Cannot replace proper access controls
- Cannot prevent malicious servers from lying

The goal is **reducing attack surface**, not perfect security.

### Privacy Considerations

Annotation propagation may reveal information:

- Attribution lists show data sources
- Sensitivity levels indicate data classification

Implementations should consider:

- Whether to share annotations across MCP servers
- Minimizing attribution detail where appropriate
- User consent for annotation tracking

## Reference Implementation

### Server Implementation (TypeScript)

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

const server = new Server(
  { name: "file-server", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args, _meta } = request.params;

  // Check incoming annotations for policy decisions
  const incomingAnnotations = _meta?.annotations ?? {};

  if (name === "write_file") {
    const targetPath = args.path as string;

    // Example policy: Don't write open-world data to public locations
    if (incomingAnnotations.openWorldHint && isPublicPath(targetPath)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        "Cannot write open-world data to public location",
      );
    }
  }

  if (name === "read_file") {
    const filePath = args.path as string;
    const content = await readFile(filePath);

    // Classify the file and return with annotations
    const annotations = classifyFile(filePath, content);

    return {
      content: [{ type: "text", text: content }],
      _meta: { annotations },
    };
  }
});

function classifyFile(path: string, content: string): TrustAnnotations {
  const annotations: TrustAnnotations = {
    attribution: [`file://${path}`],
  };

  // Example classification logic
  if (containsSecrets(content)) {
    annotations.maliciousActivityHint = true; // Secret in unexpected place
  }

  return annotations;
}
```

### Client Implementation (TypeScript)

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

class TrustTrackingClient {
  private sessionAnnotations: TrustAnnotations = {};

  async callTool(
    client: Client,
    name: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    // Include accumulated session annotations in request
    const result = await client.callTool({
      name,
      arguments: args,
      _meta: { annotations: this.sessionAnnotations },
    });

    // Propagate annotations from result
    const resultAnnotations = result._meta?.annotations ?? {};
    this.propagateAnnotations(resultAnnotations);

    // Handle malicious activity detection
    if (resultAnnotations.maliciousActivityHint) {
      await this.alertUser(
        "⚠️ Potential malicious content detected",
        resultAnnotations,
      );
    }

    return result;
  }

  private propagateAnnotations(newAnnotations: TrustAnnotations): void {
    // Boolean union for hints
    if (newAnnotations.openWorldHint) {
      this.sessionAnnotations.openWorldHint = true;
    }

    // Merge attribution
    if (newAnnotations.attribution) {
      this.sessionAnnotations.attribution = [
        ...new Set([
          ...(this.sessionAnnotations.attribution ?? []),
          ...newAnnotations.attribution,
        ]),
      ];
    }
  }

  private async alertUser(
    message: string,
    annotations: TrustAnnotations,
  ): Promise<void> {
    // Implementation depends on host UI
    console.warn(message, annotations);
  }
}
```

## Related Work

### MCP Ecosystem

#### Complementary SEPs

- **SEP Tool Resolution** ([#1862](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1862)): Provides argument-specific metadata refinement. Trust annotations can be returned via `tools/resolve` to enable pre-execution policy decisions (see "Integration with Tool Resolution" section).
- **SEP-2061 Action Security Metadata**: Merged into this SEP as the `inputMetadata` and `returnMetadata` contract for tool behavior.
- **SEP Tool Requirements** ([#1385](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1385)): Proposes a `requires` field for pre-execution capability/permission validation. Trust annotations complement this by describing what the result _contains_, while `requires` describes what's _needed to call_ the tool.
- **SEP Security Schemes** ([#1488](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1488)): OpenAI's proposal for per-tool OAuth scope declarations. Operates at the authentication layer; trust annotations operate at the data layer.

#### Related Tool Annotation Proposals

Several SEPs propose **tool-level** annotations that complement this SEP's **data-level** annotations:

| SEP                                                                                                  | Scope      | Description                                                | Relationship                                                           |
| :--------------------------------------------------------------------------------------------------- | :--------- | :--------------------------------------------------------- | :--------------------------------------------------------------------- |
| [#1487](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1487) `trustedHint`      | Tool-level | Marks whether a tool itself is trusted                     | A trusted tool can still return untrusted data                         |
| [#1560](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1560) `secretHint`       | Tool-level | Marks tools whose outputs may contain sensitive data       | Static declaration; this SEP provides dynamic per-response granularity |
| [#1561](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1561) `unsafeOutputHint` | Tool-level | Marks tool outputs potentially unsafe for prompt injection | Similar to `openWorldHint` but at tool vs. data level                  |

**Key distinction**: Tool-level hints say "this tool _may_ return open-world or risky data" while data-level annotations say "_this specific response_ contains open-world data or flagged content." Both are needed:

- Tool hints enable static policy prechecks based on declared possible values
- Data annotations enable precise dynamic enforcement
- A single tool (e.g., `read_file`) can return both open-world and internal results depending on which file is read

#### Existing Primitives

- **Tool Annotations**: Existing `ToolAnnotations` (`readOnlyHint`, `destructiveHint`, etc.) describe tool behavior. Trust annotations describe data characteristics.
- **Elicitation** ([spec](https://modelcontextprotocol.io/specification/draft/client/elicitation)): Provides mechanism for user confirmation that can be triggered by trust annotations.
- **mcp-context-protector** ([Trail of Bits](https://github.com/trailofbits/mcp-context-protector)): Wrapper server implementing trust-on-first-use and guardrails. Trust annotations would enhance its policy decisions.

### Academic Research

- **Design Patterns for Securing LLM Agents** ([arXiv:2506.08837](https://arxiv.org/abs/2506.08837)): Six patterns (Action-Selector, Plan-Then-Execute, Map-Reduce, Dual LLM, Code-Then-Execute, Context-Minimization) that benefit from data classification primitives.
- **CaMeL** (Google DeepMind): Code-Then-Execute pattern with DSL for taint tracking. Trust annotations provide simpler protocol-level equivalent.
- **Information Flow Control**: Academic IFC literature (decentralized label model, taint tracking) provides theoretical foundation. This SEP takes a pragmatic subset suitable for protocol adoption.

### Industry Approaches

- **FIDES** (Microsoft): Deterministic IFC for enterprise LLM workflows. Trust annotations align with their goal of protocol-level data labels.
- **ShardGuard**: Compartmentalized execution architecture using planning LLM, opaque values, and coordination service. Demonstrates IFC-like properties achievable through architecture, complementing protocol-level annotations.

## Open Questions

1. **Label namespaces**: Should we support organization-specific labels? If so, what namespace format (reverse-DNS, URIs)? @olaservo suggested organizations could publish standardized schemas (e.g., HIPAA classifications, PCI compliance levels).

2. **Declassification**: Who can remove sensitivity markers? Should there be a certification process for declassifiers? @JustinCappos raised the complexity of IFC declassification—perhaps compartmentalized execution (separate programs pre/post declassification) is simpler than in-program taint tracking.

3. **Taint persistence**: If sensitive data is written to storage and read back, should labels persist? How? This is a known challenge in IFC systems and becomes messier with models that may retrain on labeled input.

4. **Model retraining**: If a model retrains on labeled data, does the label apply to future outputs?

5. **Cross-server trust**: Should annotations be shared between MCP servers, or kept client-side only? There are privacy implications to sharing sensitivity metadata across servers.

6. **Confidence levels**: Should servers express confidence in their classifications?

7. **Granularity**: ~~Should annotations apply per-result-item rather than per-response?~~ _Resolved_: Response annotations reflect the entire response (aggregated across content). Per-item annotations are out of scope for this SEP.

8. **Tool Resolution integration**: Should `tools/resolve` be required to return the narrowest possible set for tools with dynamic content, or is this just guidance?

## Acknowledgments

Thanks to the community discussion on [#711](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/711), particularly:

- @JustinCappos for IFC insights and label namespace discussion
- @olaservo for organization-specific vocabulary suggestions
- @Mossaka for the provenance/classification split proposal
- @localden for shepherding the issue
