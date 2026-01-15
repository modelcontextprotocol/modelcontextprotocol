# SEP-2091: Server Capability Signatures

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-01-15
- **Author(s)**: Sam Morrow (@SamMorrowDrums)
- **Sponsor**: None (seeking sponsor)
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2091

## Abstract

This SEP proposes extending [SEP-1649 (Server Cards)](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1649) and/or `InitializeResult` to support **capability signatures**: a complete declaration of everything a server _could_ offer, including all possible tools, prompts, resources, and their behavioral variants.

Where Server Cards currently allow servers to list their primitives, this SEP formalizes the contract that this list represents the complete universe of possibilities. The key extension is simple: **where primitives accept single values for behavioral metadata (like `annotations`), signatures allow arrays of all possible values**. This enables clients to establish trust boundaries based on the full scope of server behavior while preserving flexibility for servers to dynamically filter what is currently available.

## Motivation

Several MCP client implementations have adopted "schema freezing" approaches, where they capture the initial results of `tools/list`, `prompts/list`, and similar endpoints during server startup and treat any subsequent changes as policy violations. This approach is motivated by legitimate security concerns:

1. **Trust Boundaries**: Clients need to establish what a server is allowed to do before granting permissions
2. **Predictability**: AI systems benefit from knowing the complete action space upfront
3. **Safety**: Preventing unexpected capabilities from appearing after trust decisions have been made

However, schema freezing as currently implemented creates friction with legitimate server capabilities:

1. **User-Specific Capabilities**: Some users may not have access to certain tools (e.g., GitHub Copilot agent tools are hidden when users cannot access them). Freezing would still expose tools destined to fail or fail to provide them for everyone. Neither is a good option.

2. **Contextual Availability**: Tools may become available or unavailable based on runtime context, state changes, or session progression. The `tools/list_changed` notification exists precisely for this purpose.

3. **Context Efficiency**: Requiring servers to always advertise every possible tool wastes context window budget when many tools are irrelevant to the current user or situation.

The fundamental issue is that schema freezing conflates security (constraining what is possible) with availability (what is currently offered). A client's security decision should be based on the universe of possible behaviors, not a snapshot of current visibility.

This SEP proposes that if clients want to constrain server behavior to a known set, they should do so based on a complete declaration of _possibilities_, while still allowing servers to dynamically filter what is _currently available_ within those bounds.

### Beyond Simple Lists

SEP-1649 (Server Cards) already proposes that servers can declare their tools, prompts, and resources. However, for trust and security purposes, knowing the _names_ of possible tools is insufficient. Clients need to know:

1. **All possible annotations**: A tool might have `destructiveHint: false` in some contexts but `destructiveHint: true` in others. The signature declares all possibilities as an array.

2. **All possible behavioral states**: A `manage_files` tool might behave differently based on arguments (read vs. write operations). Each state may have different trust implications.

3. **All possible OAuth scopes**: Different tool invocations may require different scopes. The complete set should be declared upfront.

4. **All possible resources**: Including dynamically-generated resource URIs that follow declared templates.

This SEP extends Server Cards to provide this complete picture using a simple pattern: arrays of possibilities where single values exist today. This is analogous to how [SEP-1862 (Tool Resolution)](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1862) provides runtime argument-specific metadata, but declared upfront for the entire possibility space.

### Relationship to Other SEPs

This proposal extends and complements Server Cards (SEP-1649), solving the same core problems while adding behavioral completeness:

- [SEP-1649: MCP Server Cards](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1649) proposes server discovery via `.well-known/mcp.json` or bundled metadata files. **This SEP extends Server Cards** with richer signature data. Server Cards answer "what does this server offer?" while signatures add "what could it ever offer, and in what behavioral states?"
- [SEP-1881: Scope-Filtered Tool Discovery](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1881) formalizes the pattern where servers return only tools authorized for the current user. Signatures provide the mechanism for clients to know what tools _could_ exist even when filtered.
- [SEP-1913: Trust and Sensitivity Annotations](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1913) proposes trust annotations for enforcing trust boundaries. Signatures declare all possible annotation values upfront.

### Comparison to Schema Freezing

| Aspect               | Schema Freezing          | Capability Signatures       |
| -------------------- | ------------------------ | --------------------------- |
| Security scope       | Current snapshot         | Complete possibilities      |
| Dynamic lists        | Prohibited               | Allowed (within signature)  |
| Hidden capabilities  | Causes failures          | Transparently absent        |
| Context efficiency   | Poor                     | Good                        |
| User-specific tools  | Leaks inaccessible tools | Can hide appropriately      |
| list_changed support | Conflicts                | Compatible                  |
| Annotation awareness | No                       | Yes (all possible values)   |
| Schema complexity    | N/A                      | Minimal (arrays, not types) |

## Specification

### Design Principle: Arrays for Possibilities

Rather than introducing new types, this SEP proposes a simple extension pattern: **where a primitive currently accepts a single value for behavioral metadata (like `annotations`), signatures allow an array of all possible values**.

This pattern is intentionally minimal and extensible. As MCP adds new primitives for describing server behavior, the same pattern applies: single values become arrays of possibilities in signature context.

### Extending Server Cards

This SEP proposes extending the Server Card schema from SEP-1649 to include a signature.

**Caching (Optional Optimization)**: HTTP-served Server Cards (e.g., `.well-known/mcp.json`) SHOULD include standard HTTP caching headers (`ETag`, `Cache-Control`). Clients MAY use `If-None-Match` for efficient polling. This is an optimization, not a requirement.

```typescript
/**
 * Extended Server Card with capability signatures.
 */
export interface ServerCard {
  // ... existing SEP-1649 fields ...

  /**
   * Complete signature of all possible capabilities.
   * When present, this declares the universe of what the server MAY offer.
   */
  signature?: ServerSignature;
}

/**
 * Complete declaration of all possible server capabilities and their variants.
 */
export interface ServerSignature {
  /**
   * All tools that may be offered by this server.
   * Uses existing Tool type, but annotations may be an array of possibilities.
   */
  tools?: SignatureTool[];

  /**
   * All prompts that may be offered by this server.
   */
  prompts?: Prompt[];

  /**
   * All resources that may be offered by this server.
   * Note: Resources may not be fully enumerable statically.
   * See "Future Extensions" for SignatureResource concept.
   */
  resources?: Resource[];

  /**
   * All resource templates that may be offered by this server.
   * Templates can represent dynamic resource patterns.
   */
  resourceTemplates?: ResourceTemplate[];
}
```

### Tool Signatures with Annotation Arrays

Tools in the signature use the existing `Tool` type, with one key difference: `annotations` may be an array representing all possible annotation combinations:

```typescript
/**
 * A tool in a signature context.
 * Identical to Tool, but annotations can be an array of possibilities.
 */
export interface SignatureTool extends Omit<Tool, "annotations"> {
  /**
   * All possible annotation combinations this tool may have.
   * When an array, each entry represents a distinct behavioral profile.
   * When a single object, the tool has one fixed behavior.
   */
  annotations?: ToolAnnotations | ToolAnnotations[];
}
```

This approach:

1. **Reuses existing types** - No new complex hierarchies
2. **Is immediately understandable** - Single value = one behavior; array = multiple possibilities
3. **Extends naturally** - As MCP adds new behavioral primitives, they follow the same pattern

### Extending InitializeResult

As an alternative to Server Cards, signatures can be included directly in `InitializeResult`. This is useful when:

- The client doesn't have access to the Server Card before connection
- The server wants to provide signatures in a single round-trip
- The signature varies per-session (e.g., based on authenticated user)

```typescript
export interface InitializeResult extends Result {
  protocolVersion: string;
  capabilities: ServerCapabilities;
  serverInfo: Implementation;
  instructions?: string;

  /**
   * Complete signature of all possible capabilities.
   * When present, this declares the universe of what the server MAY offer.
   */
  signature?: ServerSignature;
}
```

### Capability Declaration

Servers advertise where signatures are available:

```typescript
export interface ServerCapabilities {
  // ... existing capabilities ...

  /**
   * Present if the server provides capability signatures.
   */
  signature?: {
    /**
     * Signature is provided in InitializeResult.
     */
    inInitialize?: boolean;

    /**
     * Signature is provided via Server Card.
     */
    inServerCard?: boolean;
  };
}
```

Servers MAY provide signatures in both locations. When both are present, they MUST be identical.

### Behavioral Requirements

1. **Completeness**: The signature MUST include every tool, prompt, resource, and resource template that the server could _possibly_ return from the corresponding list endpoints during the session. Items not included in the signature MUST NOT appear in subsequent list responses.

2. **Annotation Completeness**: For each tool, the signature SHOULD declare all possible annotation values. When `annotations` is an array, it represents all possible combinations. Any annotation value returned at runtime MUST match one of the declared possibilities.

3. **Stability**: Once returned, the signature is immutable for the duration of the session. Servers MUST NOT add new items or annotation combinations to subsequent responses that were not declared in the signature.

4. **Subsets Permitted**: The actual `tools/list`, `prompts/list`, `resources/list`, and `resources/templates/list` responses may return any subset of the items declared in the signature, including an empty subset.

5. **list_changed Compatibility**: Servers may still emit `notifications/tools/list_changed` and similar notifications. The updated list MUST remain a subset of the declared signature.

### Tools Not Initially Available

A key use case is declaring tools that may not be immediately available at runtime:

**Example Flow:**
1. Server signature declares tools: `read_file`, `write_file`, `admin_delete`
2. Initial `tools/list` returns only: `read_file`, `write_file` (user lacks admin permissions)
3. User is granted admin permissions mid-session
4. Server emits `notifications/tools/list_changed`
5. New `tools/list` response includes: `read_file`, `write_file`, `admin_delete`

This is fully compliant because:
- All three tools were declared in the signature upfront
- The client established trust boundaries based on the complete signature
- The actual availability changed, but within pre-approved bounds

This pattern supports:
- **Progressive disclosure**: Tools appear as users unlock capabilities
- **Conditional access**: Tools based on OAuth scope acquisition, feature flags, or state transitions
- **Context-sensitive filtering**: Hiding irrelevant tools without sacrificing trust transparency
- **Plugin registration**: Tools that could be enabled via plugin installation, configuration changes, or user opt-in during a session

Initial `tools/list` responses MAY return any subset of the signature—including none at all. Tools may appear, disappear, and reappear throughout the session, provided they were declared in the signature.

**Suggesting Possible Tools**: Servers MAY use the signature to advertise tools that are not yet active but could be enabled. Clients can present these to users as "available if enabled" or similar, allowing users to understand the full potential of a server before activating specific capabilities. This enables scenarios like marketplace integrations, optional features, or tiered service levels where users choose which tools to activate.

### Dynamic Metadata Considerations

Certain metadata may legitimately vary between the signature and runtime behavior:

1. **Server Instructions**: Instructions provided via `instructions` in `InitializeResult` may be configuration-dependent and could reference capabilities not present in a filtered `tools/list` response, or omit capabilities that are present.

2. **Tool Descriptions**: Descriptions may be dynamically generated or context-specific. The signature provides a baseline, but runtime descriptions may vary.

3. **Annotations Within Bounds**: Tool annotations may change at runtime, but MUST match one of the annotation objects declared in the signature's array.

Consumers of signatures should use discretion about enforcement strictness.

### Enforcement Modes

Clients MAY implement different enforcement policies:

1. **Strict**: Any tool not in signature causes session termination. Any annotation outside declared possibilities is rejected.
2. **Permissive**: Signature is used for capability discovery and trust UI, but runtime deviations are logged rather than fatal.
3. **Advisory**: Signature informs user-facing capability displays but does not constrain runtime behavior.

Servers should document their expected enforcement mode. Clients requiring strict enforcement SHOULD clearly communicate this requirement.

### Client Behavior

Clients that use signatures SHOULD:

1. Retrieve the signature from Server Card (pre-connection) or `InitializeResult` (post-connection)
2. Use the signature for trust and policy decisions
3. Validate that subsequent list responses contain only items declared in the signature
4. Validate that runtime annotations match one of the declared annotation objects
5. Accept that list responses may be subsets of the signature

### Fallback Behavior

When a server does not provide a signature:

1. Clients MAY fall back to schema freezing using initial list results
2. Clients MAY choose to reject servers that do not provide signatures
3. Clients MAY proceed without schema constraints (existing behavior)

## Rationale

### Why Extend Existing Mechanisms?

This SEP extends Server Cards and `InitializeResult` rather than introducing a new method because:

1. **Server Cards already solve discovery** - Adding signatures to Server Cards enables pre-connection trust decisions
2. **InitializeResult enables single round-trip** - No additional request needed for clients that connect first
3. **Avoids protocol fragmentation** - Leverages ongoing work in SEP-1649

### Why Immutable Signatures?

The signature is immutable after initial retrieval because:

1. Trust decisions are made once; changing the trust boundary mid-session undermines the security model
2. Clients can cache and reuse signature verification logic
3. If capabilities truly change (e.g., plugin installed), reconnection establishes a new session with a new signature

## Alternatives Considered

### Dedicated `signature` Method

A dedicated RPC method was considered but rejected because Server Cards already provide the same data model, it adds an extra round-trip, and fragments capability discovery.

### Client-Side Filtering Only

An approach where servers expose all tools and clients filter based on annotations was considered. This was rejected because servers cannot adapt availability based on user context, and users may invoke tools they cannot access, leading to failures.

## Backward Compatibility

This proposal is fully backward compatible:

1. **Optional Extension**: Signatures are opt-in; existing servers and Server Cards continue to work unchanged
2. **Client Choice**: Clients can choose whether to use signatures, freeze schemas, or neither
3. **Graceful Degradation**: Clients can fall back to current behavior when signatures are unavailable
4. **List Methods Unchanged**: Existing list methods retain their semantics

## Security Implications

### Security Benefits

1. **Complete Trust Boundary**: Clients can make informed trust decisions based on complete capability declarations
2. **Explicit Contract**: The signature creates an explicit contract that servers cannot exceed
3. **Annotation Awareness**: Clients know all possible annotation values (e.g., worst-case destructiveness)
4. **Validation Possible**: Clients can detect and reject responses that violate the signature contract

### Security Considerations

1. **Signature Accuracy**: Malicious servers could under-declare their signature. This is no worse than current list manipulation.

2. **Signature Size**: Large signatures could be used for denial-of-service. Clients SHOULD implement reasonable limits.

3. **Trust Still Required**: Signatures do not eliminate the need for trust; they provide clearer trust boundaries.

## Reference Implementation

A reference implementation will be provided demonstrating:

1. Server-side signature generation from registered capabilities
2. Server-side validation that list responses respect the signature
3. Client-side signature caching and validation
4. Integration with Server Cards and InitializeResult

Example signature in a Server Card:

```json
{
  "name": "File Manager",
  "description": "Manage files with read/write/delete operations",
  "signature": {
    "tools": [
      {
        "name": "manage_files",
        "description": "Read or write files",
        "inputSchema": {
          "type": "object",
          "properties": {
            "operation": { "enum": ["read", "write", "delete"] },
            "path": { "type": "string" }
          }
        },
        "annotations": [
          { "destructiveHint": false, "readOnlyHint": true },
          { "destructiveHint": true, "readOnlyHint": false }
        ]
      }
    ]
  }
}
```

At runtime, `tools/list` returns the same tool with a single annotation object representing the **worst case** (most permissive) combination:

```json
{
  "tools": [
    {
      "name": "manage_files",
      "description": "Read or write files",
      "inputSchema": { "...": "..." },
      "annotations": { "destructiveHint": true, "readOnlyHint": false }
    }
  ]
}
```

The worst-case reduction ensures backward-compatible clients see the most conservative trust profile.

## Future Extensions

This SEP focuses on the core pattern (arrays of possibilities) and defers several related concerns:

### SignatureResource

Resources present unique challenges: they may not be statically enumerable. A future `SignatureResource` type could unify `resources` and `resourceTemplates` with a `type` field indicating whether the entry is a `resource` (static, individually enumerable) or `template` (pattern-based). A template in the signature (e.g., `file:///{path}`) would expand to individual `Resource` items at runtime in `resources/list` (e.g., `file:///foo.txt`, `file:///bar.txt`). This clarifies how signature declarations map to runtime enumerations. Additional metadata fields could be added as needed for trust decisions.

### Argument-Dependent Annotations

An extension could allow annotations to reference input schema enums, mapping specific argument values to specific Annotations. This would formalize the relationship between arguments and behavior, where it can be statically declared.

## Open Questions

1. **Mid-session updates**: Should there be a notification mechanism for legitimate capability changes during long-lived sessions?

2. **SignatureResource scope**: Should unified resource representation be part of this SEP or a follow-up?

## Acknowledgments

This proposal was inspired by discussions with Robert Reichel (OpenAI), John Baldo (Asana), Peder H P (Saxo Bank), Tadas Antanavicius (PulseMCP), and others in the MCP community around schema freezing approaches and their interaction with dynamic server capabilities.

---

_This SEP was drafted with AI assistance (Claude) and reviewed by the author._
