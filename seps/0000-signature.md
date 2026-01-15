# SEP-0000: Server Capability Signature

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-01-15
- **Author(s)**: Sam Sheridan (@SamMorrowDrums)
- **Sponsor**: None (seeking sponsor)
- **PR**: https://github.com/modelcontextprotocol/specification/pull/{NUMBER}

## Abstract

This SEP proposes a new `signature` method that enables MCP servers to declare their complete set of possible capabilities upfront, including all tools, prompts, resources, and resource templates that the server *could* offer. This allows clients to establish trust boundaries based on the full scope of server behavior while preserving the flexibility for servers to dynamically adjust what is currently available via existing list endpoints.

## Motivation

Several MCP client implementations have adopted "schema freezing" approaches, where they capture the initial results of `tools/list`, `prompts/list`, and similar endpoints during server startup and treat any subsequent changes as policy violations. This approach is motivated by legitimate security concerns:

1. **Trust Boundaries**: Clients need to establish what a server is allowed to do before granting permissions
2. **Predictability**: AI systems benefit from knowing the complete action space upfront
3. **Safety**: Preventing unexpected capabilities from appearing after trust decisions have been made

However, schema freezing as currently implemented creates friction with legitimate server capabilities:

1. **User-Specific Capabilities**: Some users may not have access to certain tools (e.g., GitHub Copilot agent tools are hidden when users cannot access them). Freezing would still expose tools destined to fail.

2. **Contextual Availability**: Tools may become available or unavailable based on runtime context, state changes, or session progression. The `tools/list_changed` notification exists precisely for this purpose.

3. **Context Efficiency**: Requiring servers to always advertise every possible tool wastes context window budget when many tools are irrelevant to the current user or situation.

The fundamental issue is that schema freezing conflates security (constraining what is possible) with availability (what is currently offered). A client's security decision should be based on the universe of possible behaviors, not a snapshot of current visibility.

This SEP proposes that if clients want to constrain server behavior to a known set, they should do so based on a complete declaration of *possibilities*, while still allowing servers to dynamically filter what is *currently available* within those bounds.

### Relationship to Other SEPs

This proposal complements several related SEPs:

- [SEP-1881: Scope-Filtered Tool Discovery](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1881) formalizes the pattern where servers return only tools authorized for the current user. This SEP provides the mechanism for clients to know what tools *could* exist even when filtered.
- [SEP-1862: Tool Resolution](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1862) proposes a `tools/resolve` method for argument-specific metadata. Combined with signatures, hosts can know all possible tool behaviors upfront (see "Signature and Tool Resolution" below).
- [SEP-1821: Dynamic Tool Discovery](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1821) proposes search/filtering for tools. Signature provides the trust boundary within which such filtering operates.
- [SEP-1442: Make MCP Stateless](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1442) discusses stateless operation. Signature can be cached and revalidated across stateless requests.

## Specification

### New Method: `signature`

A new request method `signature` is introduced:

```typescript
/**
 * Sent from the client to request the complete signature of all
 * capabilities the server could possibly offer.
 *
 * @category `signature`
 */
export interface SignatureRequest extends JSONRPCRequest {
  method: "signature";
  params?: RequestParams;
}
```

### Signature Result

The result contains the complete set of possible capabilities:

```typescript
/**
 * The result returned by the server for a signature request.
 *
 * All arrays represent the complete universe of items that MAY appear
 * in subsequent list responses. Actual list responses may return any
 * subset of these items.
 *
 * @category `signature`
 */
export interface SignatureResult extends Result {
  /**
   * All tools that may be offered by this server.
   */
  tools?: Tool[];

  /**
   * All prompts that may be offered by this server.
   */
  prompts?: Prompt[];

  /**
   * All resources that may be offered by this server.
   */
  resources?: Resource[];

  /**
   * All resource templates that may be offered by this server.
   */
  resourceTemplates?: ResourceTemplate[];
}
```

### Capability Declaration

Servers advertise signature support in their capabilities:

```typescript
export interface ServerCapabilities {
  // ... existing capabilities ...

  /**
   * Present if the server supports the signature method.
   */
  signature?: object;
}
```

### Behavioral Requirements

1. **Completeness**: The signature MUST include every tool, prompt, resource, and resource template that the server could *possibly* return from the corresponding list endpoints during the session. Items not included in the signature MUST NOT appear in subsequent list responses.

2. **Stability**: Once returned, the signature is immutable for the duration of the session. Servers MUST NOT add new items to subsequent list responses that were not declared in the initial signature.

3. **Subsets Permitted**: The actual `tools/list`, `prompts/list`, `resources/list`, and `resources/templates/list` responses may return any subset of the items declared in the signature, including an empty subset.

4. **list_changed Compatibility**: Servers may still emit `notifications/tools/list_changed` and similar notifications. The updated list MUST remain a subset of the declared signature.

5. **Metadata Consistency**: Items returned in list endpoints SHOULD have consistent `name` values matching those in the signature. Other metadata (descriptions, schemas, annotations) MAY differ between signature and list responses.

### Client Behavior

Clients that receive signature support SHOULD:

1. Call `signature` during initialization, after the `initialize` handshake completes
2. Use the signature result for trust and policy decisions
3. Validate that subsequent list responses contain only items declared in the signature
4. Accept that list responses may be subsets of the signature

### Fallback Behavior

When a server does not advertise the `signature` capability:

1. Clients MAY fall back to schema freezing using initial list results
2. Clients MAY choose to reject servers that do not support signatures
3. Clients MAY proceed without schema constraints (existing behavior)

## Rationale

### Why Not Extend Existing List Methods?

Adding a "complete" flag to list methods was considered but rejected because:

1. It would change existing method semantics
2. List methods are paginated; a "complete" mode would need different pagination handling
3. Separation of concerns: signature is about trust boundaries; list is about current availability

### Why Not Use Initialize Response?

Embedding the signature in `InitializeResult` was considered but rejected because:

1. It would significantly increase initialize payload size for servers with many capabilities
2. Initialization should complete quickly; signature retrieval can be deferred
3. Not all clients need signature information; making it opt-in reduces overhead

### Why Allow Subset Behavior?

Permitting list responses to be subsets of the signature enables important use cases:

1. **User Permissions**: Hide tools a user cannot access without exposing errors
2. **Progressive Disclosure**: Reveal advanced tools only when prerequisites are met
3. **Context Optimization**: Return only relevant tools to reduce LLM context usage
4. **A/B Testing**: Experiment with different capability sets for different sessions

### Comparison to Schema Freezing

| Aspect | Schema Freezing | Signature Method |
|--------|-----------------|------------------|
| Security scope | Current snapshot | Complete possibilities |
| Dynamic lists | Prohibited | Allowed (within signature) |
| Hidden capabilities | Causes failures | Transparently absent |
| Context efficiency | Poor | Good |
| User-specific tools | Leaks inaccessible tools | Can hide appropriately |
| list_changed support | Conflicts | Compatible |

### Why Immutable Signatures?

The signature is immutable after initial retrieval because:

1. Trust decisions are made once; changing the trust boundary mid-session undermines the security model
2. Clients can cache and reuse signature verification logic
3. If capabilities truly change (e.g., plugin installed), reconnection establishes a new session with a new signature

### Registry Fingerprinting

Signatures enable registries and discovery services to fingerprint MCP servers:

1. **Server Identification**: Registries can hash signatures to uniquely identify server capability sets
2. **Change Detection**: By comparing signature hashes across versions, registries can track when servers add or remove capabilities
3. **Compatibility Matching**: Clients can query registries for servers matching specific capability signatures
4. **Audit Trails**: Organizations can maintain records of what capabilities servers declared at specific points in time

This is particularly valuable for enterprise deployments where capability governance is required.

### Signature and Tool Resolution

When combined with [SEP-1862 (Tool Resolution)](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1862), signatures can be extended to declare all possible tool behaviors upfront. A tool like `manage_files` might have different annotations depending on its arguments:

```typescript
interface ExtendedToolSignature extends Tool {
  /**
   * All possible resolved states this tool may return.
   * Each entry represents a distinct behavior profile.
   */
  resolvedVariants?: ToolResolvedVariant[];
}

interface ToolResolvedVariant {
  /**
   * Conditions under which this variant applies.
   */
  when: {
    argumentPatterns?: Record<string, unknown>;
  };
  /**
   * The annotations that apply when conditions are met.
   */
  annotations?: ToolAnnotations;
  /**
   * OAuth scopes required for this variant.
   */
  requiredScopes?: string[];
}
```

This enables hosts to:

1. **Pre-compute permission sets**: Know all possible scope requirements before any tool invocation
2. **Match predefined behaviors**: Map organizational policies to concrete tool actions based on arguments
3. **Optimize authorization flows**: Request all potentially needed scopes upfront rather than incrementally
4. **Provide accurate UI**: Show users exactly what permissions each action requires before they attempt it

The signature declares the universe of possibilities; `tools/resolve` confirms which variant applies for a specific invocation. This keeps `tools/list` as the worst-case fallback while enabling sophisticated trust management for hosts that need it.

## Backward Compatibility

This proposal is fully backward compatible:

1. **New Capability**: The `signature` capability is opt-in; existing servers continue to work unchanged
2. **Client Choice**: Clients can choose whether to use signature, freeze schemas, or neither
3. **Graceful Degradation**: Clients can fall back to current behavior when signature is unavailable
4. **List Methods Unchanged**: Existing list methods retain their semantics; responses are simply validated against the signature if present

## Security Implications

### Security Benefits

1. **Complete Trust Boundary**: Clients can make informed trust decisions based on complete capability declarations rather than potentially incomplete snapshots
2. **Explicit Contract**: The signature creates an explicit contract that servers cannot exceed
3. **Validation Possible**: Clients can detect and reject list responses that violate the signature contract

### Security Considerations

1. **Signature Accuracy**: Malicious servers could under-declare their signature, then attempt to surface additional capabilities. However, this is no worse than the current situation where initial list results can be manipulated.

2. **Signature Size**: Large signatures could be used for denial-of-service. Clients SHOULD implement reasonable limits on signature size.

3. **Trust Still Required**: The signature method does not eliminate the need for trust; it provides a mechanism for establishing clearer trust boundaries.

## Reference Implementation

A reference implementation will be provided in the TypeScript SDK demonstrating:

1. Server-side signature generation from registered capabilities
2. Server-side validation that list responses respect the signature
3. Client-side signature caching and validation
4. Integration with list_changed notifications

Example server-side registration pattern:

```typescript
// Register a tool in the signature even if not currently available
server.registerPossibleTool({
  name: "admin_dashboard",
  description: "Access admin dashboard",
  inputSchema: { type: "object" }
}, {
  availabilityCheck: (context) => context.user.isAdmin
});

// The signature includes admin_dashboard for all users
// tools/list only returns it when availabilityCheck passes
```

## Open Questions

1. **Should signatures support hashing/versioning?** Clients could efficiently check if a signature has changed across sessions without re-fetching the full content. This would be particularly valuable for registry fingerprinting.

2. **Should there be a way to update signatures without reconnection?** For long-lived sessions, capability changes might be legitimate (e.g., plugin installation). A `signature/update` notification could address this, but adds complexity.

3. **Should incomplete signatures be permitted with a flag?** Some servers might not be able to enumerate all possible resources. A `complete: false` indicator could signal this, though it weakens the security guarantees.

4. **Should resolved variants be part of the core signature spec?** The `resolvedVariants` extension described in "Signature and Tool Resolution" could be standardized as part of this SEP or left as an optional extension pattern. Including it would provide a complete picture of tool behaviors but increases signature complexity.

## Acknowledgments

This proposal was inspired by discussions with Robert Reichel (OpenAI) and others in the MCP community around schema freezing approaches and their interaction with dynamic server capabilities.

---

*This SEP was drafted with AI assistance (Claude) and reviewed by the author.*
