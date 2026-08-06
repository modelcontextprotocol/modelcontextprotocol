# SEP-2564: Server-Side Filtering for List Methods

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2025-04-13
- **Author(s)**: Anagh Agrawal <anagh.agrawal96@gmail.com> (@anagh96)
- **Sponsor**: @LucaButBoring
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2564

## Abstract

This SEP introduces optional server-side filtering for MCP `*/list` methods. Clients MAY include a `filter` object in `tools/list`, `resources/list`, `prompts/list`, and `resources/templates/list` requests to receive only capabilities matching specified criteria. This SEP defines `namePatterns` (glob-based name matching) as the universal filter field, plus `uriPatterns` for resource-specific filtering. Multiple filter fields combine with logical AND; multiple values within a field combine with logical OR. Servers advertise supported filter fields via a `filtering` object in their capability declarations during `initialize`. Clients that omit the filter parameter receive the full unfiltered list, preserving backward compatibility. The response schema is unchanged. No new methods, notifications, or lifecycle events are introduced. Vendor-specific filter fields use the existing `_meta` reverse-domain convention. This proposal complements hierarchical tool management proposals ([Discussion #532](https://github.com/orgs/modelcontextprotocol/discussions/532)) and aligns with the MCP roadmap priorities for stateless operation, Server Cards, and enterprise gateway patterns.

## Motivation

Server-side filtering addresses three concrete problems evidenced by community discussions.

### Server-Controlled Filtering Semantics ([Discussion #497](https://github.com/orgs/modelcontextprotocol/discussions/497))

Community discussion ([#497](https://github.com/orgs/modelcontextprotocol/discussions/497)) has demonstrated interest in server-controlled filtering semantics. This SEP formalizes that principle: the server is authoritative over which capabilities to return, including handling cross-tool dependencies. Server-side filtering reduces data transfer and serialization cost before the client receives the payload — a fundamentally different optimization than client-side model-controlled tool selection during inference.

### Gateway Aggregation ([Discussion #532](https://github.com/orgs/modelcontextprotocol/discussions/532))

Enterprise deployments use MCP gateways that aggregate capabilities from multiple upstream servers. A single `tools/list` call to a gateway can return hundreds of tools. Without server-side filtering, the client must download the entire catalog to find the 5-10 tools relevant to the current task. This is especially wasteful in stateless transport scenarios (MCP roadmap priority #1) where every request is independent.

### Context Window and Bandwidth Optimization ([Discussion #590](https://github.com/orgs/modelcontextprotocol/discussions/590))

As MCP server ecosystems grow, tool catalog sizes become a concrete scaling problem. For example, the AWS open-source MCP ecosystem includes [66+ specialized servers](https://github.com/awslabs/mcp), each exposing multiple tools — and these can be aggregated through a single proxy server, compounding the catalog size. Every `tools/list` response serializes full tool definitions (name, description, inputSchema, outputSchema, annotations) into the client's context window. Server-side filtering reduces the payload before it reaches the client, saving serialization cost, network bandwidth, and context window tokens.

The impact of this scaling problem is already visible in production. Amazon's internal MCP server for developer tooling (46+ tools) was forced to build an elaborate client-side tool personalization system — including usage-tracking databases, time-decayed scoring algorithms, ROI-based tool promotion, and a progressive disclosure mechanism — to manage context window bloat. This represents significant bespoke engineering effort that each MCP server or gateway would need to replicate independently. Protocol-level server-side filtering would address this problem at the right layer, eliminating the need for each implementation to reinvent tool catalog management.

### Real-World Patterns

The need for protocol-level filtering is evidenced by recurring patterns across MCP gateway and aggregator deployments:

**Fragmented tool access management.** Amazon customers managing hundreds of tools across multiple MCP servers currently stitch together custom intermediary code — interceptors, mapping databases, and policy layers — to control which tools are visible to which callers. When upstream servers rename or update tools, these custom layers silently go out of sync. A standardized, protocol-native filtering mechanism eliminates this fragile custom code by co-locating filtering logic with the server that owns the tools.

**Pre-filtering before semantic discovery.** Amazon customers with large tool catalogs need to narrow tool sets by attributes (domain, team, category) before any semantic or model-driven selection occurs. Without protocol-level filtering, each client implementation builds its own pre-filtering layer, leading to fragmented and inconsistent approaches across the ecosystem.

**Infrastructure overhead for routing-based filtering.** MCP gateway operators currently rely on external infrastructure (reverse proxies, load balancers, path-based routing) to inject filtering logic into requests. For example, enterprise customers deploying thousands of MCP tools through unified gateways like [Amazon Bedrock AgentCore Gateway](https://aws.amazon.com/blogs/machine-learning/transform-your-mcp-architecture-unite-mcp-servers-through-agentcore-gateway/) must build [custom interceptor layers](https://aws.amazon.com/blogs/machine-learning/apply-fine-grained-access-control-with-bedrock-agentcore-gateway-interceptors/) for tool filtering based on agent identity, user context, and execution environment. This adds architectural complexity that could be eliminated if the protocol itself supported filtering natively. A standardized filter parameter on `*/list` methods lets gateways handle filtering as a first-class protocol operation rather than an infrastructure workaround.

These patterns demonstrate why client-side solutions alone are insufficient. While client-side tool search and semantic filtering effectively address the model's context window problem, they cannot address the server-side costs that motivate this SEP:

- **Server serialization cost:** A server with 500 tools serializes all 500 definitions on every `*/list` call regardless of what the client does with the response. Server-side filtering lets the server skip serialization entirely for non-matching tools.
- **Gateway fan-out avoidance:** When a gateway aggregates tools from multiple upstream MCP servers, an unfiltered `tools/list` requires the gateway to fan out to every upstream server. With server-side filtering, the gateway can skip upstream servers whose tools don't match the filter — saving network round-trips.
- **Tool dependency awareness:** The server understands cross-tool dependencies (e.g., `git_commit` depends on `git_stage`). Client-side filtering cannot account for these dependencies because the client doesn't know about them. Server-side filtering lets the server include dependency tools even when they don't match the filter pattern.
- **Standardization across implementations:** Without protocol-level filtering, every gateway, proxy, and aggregator invents its own filtering mechanism — leading to fragmented, incompatible approaches. A standardized filter parameter reduces implementation burden on both server developers and their consumers.

## Specification

### Filter Control Model

Filtering is application-controlled, not model-controlled. The host application constructs the `filter` parameter and passes it in `*/list` requests as a pre-discovery step — before the model sees any tools. This is distinct from MCP's model-controlled tool invocation, where the LLM decides which tools to call. The application decides what subset of capabilities to request; the model then selects from that subset during inference.

How the application determines which filter to send is implementation-specific and not prescribed by this specification. Common patterns include: static configuration (e.g., an agent framework config file specifying tool name patterns per workspace or project), task-scoped filtering (e.g., an orchestrator requesting different tool subsets for each step in a multi-step workflow), and context-based detection (e.g., an IDE inspecting the current project type and requesting only relevant tools).

### Capability Negotiation

Servers that support filtering MUST advertise a `filtering` object within the relevant capability namespace in the `initialize` response:

```json
{
  "capabilities": {
    "tools": {
      "listChanged": true,
      "filtering": {
        "supported": ["namePatterns"]
      }
    },
    "resources": {
      "subscribe": true,
      "listChanged": true,
      "filtering": {
        "supported": ["namePatterns", "uriPatterns"]
      }
    },
    "prompts": {
      "listChanged": true,
      "filtering": {
        "supported": ["namePatterns"]
      }
    }
  }
}
```

The `filtering` object schema:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `supported` | `string[]` | Yes | Filter field names the server implements for this list method. |

A server indicates support for filtering on a list method by advertising a `filtering` capability for that method. Clients MUST NOT send a `filter` parameter on methods that do not advertise this capability.

### Filter Parameter

The `filter` object is added as an optional property in the `params` of each `*/list` request, alongside the existing `cursor` parameter. Multiple filter fields combine with logical AND (a capability must match all fields); multiple values within a single field combine with logical OR (a capability must match at least one value).

#### Standard Filter Fields

**All `*/list` methods:**

| Field | Type | Description |
|-------|------|-------------|
| `namePatterns` | `string[]` | Glob patterns matched against the capability's `name` field (`tool.name`, `resource.name`, `prompt.name`, `resourceTemplate.name`). OR semantics across array elements. |

**`resources/list` and `resources/templates/list` additional fields:**

| Field | Type | Description |
|-------|------|-------------|
| `uriPatterns` | `string[]` | Glob patterns matched against `resource.uri` for `resources/list` or `resourceTemplate.uriTemplate` for `resources/templates/list`. OR semantics. |

#### Vendor Extension Fields

Any additional key in the `filter` object using the `_meta` reverse-domain convention (e.g., `com.example/targetIds`) is treated as a vendor extension. Vendor extensions:

- MUST be advertised in `filtering.supported` alongside standard fields
- MUST follow the same AND semantics with other filter fields
- MUST be silently ignored by servers that do not recognize them

### Filter Semantics

| Dimension | Semantics |
|-----------|-----------|
| Multiple fields in one filter | AND (intersection) — capability MUST match ALL fields |
| Multiple values in one field | OR (union) — capability MUST match at least ONE value |
| Empty array for a field | Treated as if the field was not specified |
| Missing `filter` param | Server MUST return all capabilities (backward compatible) |
| Empty `filter` object `{}` | Server MUST return all capabilities (identity) |
| Unsupported filter fields | Server MUST silently ignore; apply only supported fields |

### Pattern Matching

Pattern fields (`namePatterns`, `uriPatterns`) accept glob-style strings. Servers MUST support at minimum:

| Pattern | Matches |
|---------|---------|
| `*` | Zero or more characters |
| `?` | Exactly one character |
| All other characters | Literal match (case-sensitive) |

The minimum required syntax follows the [POSIX glob specification](https://pubs.opengroup.org/onlinepubs/9699919799/utilities/V3_chap02.html#tag_18_13). Servers can support additional glob syntax beyond the minimum (e.g., `**` for path segments, character classes `[abc]`, negation `[!abc]`). In addition to the specified glob operators, servers MAY interpret filter arguments at their discretion, including returning results beyond those strictly matched by the filter (for example, to include dependency tools when tool `A` depends on tool `B` but only `A` matches the filter). The client MUST NOT treat the presence of additional results as a filter violation. The specification does not define a formal dependency graph schema; servers that need dependency tracking implement it internally and can document dependencies in tool `description` or `annotations` fields. If a server receives a pattern using syntax it cannot process, it can return a JSON-RPC error with code `-32602` describing the issue.

Name patterns (`namePatterns`) operate on flat strings (tool/resource/prompt names). URI patterns (`uriPatterns`) operate on URI strings where path separators can be significant depending on the server's glob implementation.

### Request Examples

**Filtered `tools/list`:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {
    "filter": {
      "namePatterns": ["git_*", "search_*"]
    },
    "cursor": "optional-cursor-value"
  }
}
```

**Filtered `resources/list` with multiple fields (AND):**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "resources/list",
  "params": {
    "filter": {
      "namePatterns": ["config_*"],
      "uriPatterns": ["file:///src/production/**"]
    }
  }
}
```

**Filtered `tools/list` with vendor extension:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/list",
  "params": {
    "filter": {
      "namePatterns": ["git_*"],
      "com.example/targetIds": ["tgt-backend-001"]
    }
  }
}
```

### Response Format

No changes. All `*/list` responses retain their existing schema. A filtered response is structurally identical to an unfiltered response — it simply contains fewer items.

### Interaction with Pagination

- The `filter` and `cursor` parameters coexist in `params`.
- A cursor obtained from a filtered request encodes the filter context. The server MUST reject (with `-32602`) any subsequent request that uses the same cursor but changes the filter.
- Servers can encode the filter hash in the cursor to detect changes, or can store filter state server-side keyed by cursor.
- The total number of results in a filtered response can differ from an unfiltered response.

### Error Handling

| Condition | Error Code | Error Message Pattern |
|-----------|-----------|----------------------|
| Invalid glob pattern | `-32602` | `"Invalid pattern in <field>: '<pattern>' — <detail>"` |
| Unsupported glob syntax | `-32602` | `"Unsupported pattern syntax in <field>: '<pattern>' — <detail>"` |
| Filter changed between paginated requests | `-32602` | `"Filter parameters must not change between paginated requests"` |
| Pattern count exceeds server limit | `-32602` | `"Too many patterns: <count> exceeds maximum of <limit>"` |

Unsupported filter fields are NOT errors — they MUST be silently ignored.

### Filter Processing Order

Servers SHOULD process filters in this order:

1. Validate pattern syntax. Return `-32602` on first invalid pattern.
2. Check pattern count limits. Return `-32602` if exceeded.
3. If a cursor is present, verify filter consistency. Return `-32602` on mismatch.
4. Discard unsupported/unrecognized filter fields (no error).
5. Proceed with matching and pagination.

### Filtering Constraints

- Filtering is NOT access control. Filtered-out capabilities remain accessible via direct invocation methods (`tools/call`, etc.). Filtering is a convenience optimization, not a security boundary. Access control MUST be implemented separately.
- Servers MUST enforce a maximum number of patterns per filter field per request (recommended: 100). Servers MUST enforce a maximum pattern length (recommended: 256 characters).

### Schema Additions

#### `FilterBase`
```json
{
  "FilterBase": {
    "type": "object",
    "properties": {
      "namePatterns": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Glob patterns to match against capability name. OR across patterns."
      }
    },
    "additionalProperties": true
  }
}
```

#### `ToolsFilter`
```json
{
  "ToolsFilter": {
    "allOf": [{ "$ref": "#/definitions/FilterBase" }],
    "description": "Filter criteria for tools/list."
  }
}
```

#### `ResourcesFilter`
```json
{
  "ResourcesFilter": {
    "allOf": [{ "$ref": "#/definitions/FilterBase" }],
    "properties": {
      "uriPatterns": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Glob patterns to match against resource URI. OR across patterns."
      }
    },
    "description": "Filter criteria for resources/list."
  }
}
```

#### `PromptsFilter`
```json
{
  "PromptsFilter": {
    "allOf": [{ "$ref": "#/definitions/FilterBase" }],
    "description": "Filter criteria for prompts/list."
  }
}
```

#### `ResourceTemplatesFilter`
```json
{
  "ResourceTemplatesFilter": {
    "allOf": [{ "$ref": "#/definitions/FilterBase" }],
    "properties": {
      "uriPatterns": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Glob patterns to match against resource template uriTemplate. OR across patterns."
      }
    },
    "description": "Filter criteria for resources/templates/list."
  }
}
```

#### `FilteringCapability`
```json
{
  "FilteringCapability": {
    "type": "object",
    "required": ["supported"],
    "properties": {
      "supported": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Filter field names the server supports for this list method."
      }
    }
  }
}
```

### Future Extensions

| Scope | Filter Fields | Status |
|-------|--------------|--------|
| This SEP | `namePatterns` (all methods), `uriPatterns` (resources, resource templates) | Proposed |
| Future SEP | `mimeTypes` (resources), `tags` — categorization-based filtering | Future |
| Future SEP | `$and`, `$or`, `$not` — composable boolean filter expressions | Future |

Future extensions build on this SEP's `filter` object without requiring changes to the schemas defined here. The `filtering.supported` array naturally extends to advertise new fields.

## Rationale

### Alternative 1: New `*/filter` Methods

Rejected. Adding `tools/filter`, `resources/filter`, etc. would double the number of list-related methods, violate MCP's minimal philosophy, and create ambiguity about which method to use. Using the existing `*/list` methods with an optional parameter is simpler and backward compatible.

### Alternative 2: Query String / SQL-like Filter Language

Rejected. A string-based query language (e.g., `"name LIKE 'git_*' AND mimeType = 'application/json'"`) introduces parsing complexity, injection risks, and a learning curve. Structured JSON filter objects are type-safe, self-documenting, and align with MCP's JSON-RPC foundation.

### Alternative 3: Client-Side Only Filtering

Rejected as insufficient. Client-side filtering remains appropriate for model-controlled tool selection during inference, but it cannot address the server-side costs that motivate this SEP. See [Real-World Patterns](#real-world-patterns) for the detailed analysis. Community discussion ([#497](https://github.com/orgs/modelcontextprotocol/discussions/497)) has demonstrated interest in server-controlled filtering as a first-class protocol feature.

### Alternative 4: Hierarchical Categories ([Discussion #532](https://github.com/orgs/modelcontextprotocol/discussions/532))

Deferred, not rejected. [Discussion #532](https://github.com/orgs/modelcontextprotocol/discussions/532) proposes `tools/categories`, `tools/discover`, and lazy loading — a comprehensive hierarchical tool management system. This SEP addresses the immediate filtering problem with a minimal extension that doesn't require categories, groups, or new methods. If #532's methods are adopted in the future, the `filter` parameter mechanism defined here can apply to those methods as well. This SEP does not define any category, group, or hierarchy concepts.

### Why AND Semantics Across Fields

This SEP uses AND semantics across filter fields because they constrain different attributes of the same item — narrowing results by intersecting criteria. For example, filtering `resources/list` with `namePatterns: ["config_*"]` AND `uriPatterns: ["file:///src/production/**"]` returns only config resources located under the production directory. OR across fields would widen results, which is the opposite of filtering.

OR within the same field (e.g., multiple `namePatterns`) already provides union semantics where it makes sense. See [Future Extensibility](#future-extensibility-filter-logic-evolution) for the plan to introduce cross-field OR in a future extension.

### Future Extensibility: Filter Logic Evolution

This SEP intentionally uses AND semantics across filter fields and OR within fields. This is the natural narrowing behavior for filtering — each additional field constrains the result set further. However, we recognize that some use cases can benefit from cross-field OR logic (e.g., "give me tools matching name `git_*` OR tools from a specific vendor extension category"). Rather than prematurely introducing complex boolean logic, a future extension reserves `$and`, `$or`, and `$not` operators for composable filter expressions. This phased approach lets the community validate the simple model first and introduce complexity only when concrete use cases justify it — avoiding the trap of over-engineering filter syntax before real-world usage patterns emerge.

## Backward Compatibility

This SEP is fully backward compatible. No existing behavior is changed.

| Scenario | Behavior |
|----------|----------|
| Old client → new server | Client never sends `filter`. Server returns full list. No change. |
| New client → old server | Client checks `capabilities.tools.filtering`. Not present → client sends `*/list` without filter. No error. |
| New client → new server (no filter) | Server returns full list. Identical to current behavior. |
| New client → new server (with filter) | Server returns filtered list. Response schema unchanged. |
| `filter: {}` (empty object) | Equivalent to no filter. Returns full list. |
| `filter: { unknownField: [...] }` | Server ignores unknown field. Returns full list. |

No changes to:

- `initialize` request schema (filtering is advertised only in the server's response)
- `*/list` response schema
- JSON-RPC method names
- Notification methods
- Lifecycle events

## Security Implications

The primary security consideration is denial-of-service through pattern complexity. The specification mitigates this by requiring servers to enforce maximum pattern counts and lengths (see [Filtering Constraints](#filtering-constraints)). Server implementations are highly discouraged from using `filter` to perform non-glob filtering.

## Reference Implementation

A reference implementation is TBD in both the TypeScript and Python MCP SDKs.
