# SEP-1984: Comprehensive Tool Annotations for Enhanced Governance and UX

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2025-12-15
- **Author(s)**: Sambhav Kothari (@sambhav)
- **Sponsor**: None (seeking sponsor)
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1984

## Abstract

This SEP proposes the addition of six new tool annotations to the MCP specification that provide rich metadata for tool management while maintaining backward compatibility. The new annotations—`aiProcessingHint`, `slowExecutionHint`, `resourceIntensiveHint`, `sensitiveDataHint`, `privilegedAccessHint`, and `reversibleHint`—enable better governance policies, security controls, resource management, and user experience enhancements for MCP implementations at organizational scale.

## Motivation

Organizations implementing MCP need better metadata about tools to support governance policies, security controls, and user experience enhancements. The current tool annotations are limited to basic operation semantics (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`, `title`) and do not provide sufficient information for:

- **Governance & Compliance**: Identifying AI-enabled tools that may require special policies or compliance tracking
- **Security**: Distinguishing tools that access sensitive data or require privileged permissions
- **Resource Management**: Managing system resources for intensive or long-running operations
- **User Experience**: Providing appropriate warnings, progress indicators, and tool categorization

This proposal addresses real implementation challenges from MCP adopters and provides concrete solutions for tool management at organizational scale. Without these annotations, clients must either:

1. Infer tool characteristics from names/descriptions (unreliable)
2. Maintain separate out-of-band metadata (fragmented)
3. Apply uniform policies regardless of tool nature (suboptimal)

## Specification

### New Tool Annotations

This SEP introduces six new boolean annotations to the `ToolAnnotations` interface:

#### AI and Processing Annotations

**`aiProcessingHint`** (boolean | undefined, default: `undefined`)

Indicates whether the tool involves AI or LLM processing. This includes any tool that uses machine learning models, language models, or AI services for processing data or generating responses. When `undefined`, clients should make no assumptions about AI processing.

```typescript
aiProcessingHint?: boolean;
```

Examples:

- `true`: `generate_text`, `analyze_sentiment`, `create_embedding`
- `false`: `database_query`, `file_upload`, `send_email`

**`slowExecutionHint`** (boolean | undefined, default: `undefined`)

Indicates whether the tool typically takes a long time to execute. This helps clients decide whether to show progress indicators, set appropriate timeouts, or warn users about expected delays. When `undefined`, clients should make no assumptions about execution time.

```typescript
slowExecutionHint?: boolean;
```

Examples:

- `true`: `large_file_processing`, `model_training`, `video_encoding`
- `false`: `simple_calculation`, `cache_lookup`, `status_check`

**`resourceIntensiveHint`** (boolean | undefined, default: `undefined`)

Indicates whether the tool is resource-intensive (CPU, memory, or disk). This helps clients manage system resources and potentially limit concurrent executions of resource-heavy tools. When `undefined`, clients should make no assumptions about resource usage.

```typescript
resourceIntensiveHint?: boolean;
```

Examples:

- `true`: `image_processing`, `data_compression`, `crypto_mining`
- `false`: `text_formatting`, `simple_math`, `configuration_read`

#### Security and Access Annotations

**`sensitiveDataHint`** (boolean | undefined, default: `undefined`)

Indicates whether the tool processes or has access to sensitive data. This includes personally identifiable information (PII), credentials, financial data, or any confidential information that requires special handling or governance. When `undefined`, clients should make no assumptions about data sensitivity and may apply conservative policies.

```typescript
sensitiveDataHint?: boolean;
```

Examples:

- `true`: `access_user_passwords`, `read_financial_records`, `process_medical_data`
- `false`: `get_weather`, `public_api_lookup`, `system_time`

**`privilegedAccessHint`** (boolean | undefined, default: `undefined`)

Indicates whether the tool requires elevated system privileges to execute. This indicates that the tool needs administrative, root, or special permissions that go beyond normal user-level access. When `undefined`, clients should make no assumptions about privilege requirements.

```typescript
privilegedAccessHint?: boolean;
```

Examples:

- `true`: `install_software`, `modify_system_config`, `restart_service`
- `false`: `read_user_file`, `send_http_request`, `calculate_hash`

**`reversibleHint`** (boolean | undefined, default: `undefined`)

Indicates whether the tool's operations can be undone or reversed. This annotation is only meaningful when `readOnlyHint` is false. Reversible operations provide some mechanism to undo their effects. When `undefined`, clients should make no assumptions about reversibility.

```typescript
reversibleHint?: boolean;
```

Examples:

- `true`: `create_backup` (can be deleted), `rename_file` (can rename back)
- `false`: `send_email` (cannot unsend), `delete_permanently`

### Guidance for Tool Authors

Tool authors _should_ set annotations accurately to help clients provide appropriate UX and governance:

**`aiProcessingHint: true`** when:

- The tool calls external AI/ML APIs (OpenAI, Anthropic, etc.)
- The tool runs local ML models for inference
- The tool generates embeddings, performs sentiment analysis, or uses NLP

**`slowExecutionHint: true`** when:

- The tool typically takes more than a few seconds to complete
- The tool involves network calls to slow external services
- The tool processes large files or datasets

**`resourceIntensiveHint: true`** when:

- The tool performs CPU-intensive computations (video encoding, compression)
- The tool allocates significant memory (image processing, data analysis)
- The tool performs heavy disk I/O (database operations, file transfers)

**`sensitiveDataHint: true`** when:

- The tool accesses PII (names, emails, addresses, SSNs)
- The tool handles credentials, API keys, or secrets
- The tool processes financial, medical, or legal data
- The tool accesses data subject to regulatory compliance (GDPR, HIPAA)

**`privilegedAccessHint: true`** when:

- The tool requires root/admin privileges
- The tool modifies system configuration
- The tool accesses protected system resources
- The tool can affect other users or processes on the system

**`reversibleHint: true`** when:

- The tool's effects can be undone programmatically
- The tool creates resources that can be deleted
- The tool has a corresponding "undo" operation

Tool authors _may_ leave hints unset (defaulting to `false`) when:

- The tool's behavior does not match the hint's criteria
- The tool author is uncertain about the classification

### Guidance for Clients

Clients _may_ use these annotations to enhance user experience and implement governance policies:

**Using `aiProcessingHint`:**

- Display AI/ML indicators in tool listings
- Apply organizational AI governance policies
- Track AI tool usage for compliance reporting
- Warn users about potential AI-related costs or latency

**Using `slowExecutionHint`:**

- Show progress indicators or spinners during execution
- Set appropriate HTTP/connection timeouts
- Warn users about expected delays before invocation
- Consider async execution patterns with status polling

**Using `resourceIntensiveHint`:**

- Limit concurrent executions of resource-heavy tools
- Schedule resource-intensive tools during off-peak hours
- Warn users about potential system impact
- Monitor system resources during tool execution

**Using `sensitiveDataHint`:**

- Apply additional confirmation flows before invocation
- Enable enhanced audit logging for compliance
- Display security warnings in the UI
- Consider data handling policies (e.g., no caching of results)

**Using `privilegedAccessHint`:**

- Require explicit user confirmation before invocation
- Apply stricter human-in-the-loop controls
- Log privileged operations for security audit
- Consider sandboxing or additional authorization checks

**Using `reversibleHint`:**

- Inform users whether operations can be undone
- Provide "undo" affordances in the UI when `reversibleHint: true`
- Apply less restrictive confirmation flows for reversible operations
- Consider batch operations more favorably for reversible tools

**Combining hints for risk assessment:**

- `sensitiveDataHint: true` + `privilegedAccessHint: true` → High risk, require strong confirmation
- `slowExecutionHint: true` + `resourceIntensiveHint: true` → Show detailed progress, manage resources
- `aiProcessingHint: true` + `sensitiveDataHint: true` → AI governance + data protection policies
- `reversibleHint: true` + `destructiveHint: false` → Lower risk, lighter confirmation flow

Clients _must not_:

- Make security-critical decisions based solely on these annotations
- Assume that a missing hint implies anything other than "no explicit claim"
- Trust annotations from untrusted servers without independent verification

In the absence of these hints, clients should fall back to their default behaviors and treat tools conservatively.

### Updated ToolAnnotations Interface

```typescript
export interface ToolAnnotations {
  /** A human-readable title for the tool. */
  title?: string;

  /** If true, the tool does not modify its environment. Default: false */
  readOnlyHint?: boolean;

  /** If true, the tool may perform destructive updates. Default: true */
  destructiveHint?: boolean;

  /** If true, repeated calls have no additional effect. Default: false */
  idempotentHint?: boolean;

  /** If true, tool may interact with external entities. Default: true */
  openWorldHint?: boolean;

  // New annotations proposed by this SEP:

  /** If true, tool involves AI or LLM processing. Default: undefined (no assumption) */
  aiProcessingHint?: boolean;

  /** If true, tool typically takes a long time to execute. Default: undefined (no assumption) */
  slowExecutionHint?: boolean;

  /** If true, tool is resource-intensive (CPU, memory, disk). Default: undefined (no assumption) */
  resourceIntensiveHint?: boolean;

  /** If true, tool processes or accesses sensitive data. Default: undefined (no assumption) */
  sensitiveDataHint?: boolean;

  /** If true, tool requires elevated system privileges. Default: undefined (no assumption) */
  privilegedAccessHint?: boolean;

  /** If true, tool's operations can be undone or reversed. Default: undefined (no assumption) */
  reversibleHint?: boolean;
}
```

### JSON Schema Changes

The following properties are added to the `ToolAnnotations` definition in the JSON schema:

```json
{
  "ToolAnnotations": {
    "properties": {
      "aiProcessingHint": {
        "description": "If true, this tool involves AI or LLM processing...",
        "type": "boolean"
      },
      "slowExecutionHint": {
        "description": "If true, this tool typically takes a long time to execute...",
        "type": "boolean"
      },
      "resourceIntensiveHint": {
        "description": "If true, this tool is resource-intensive (CPU, memory, or disk)...",
        "type": "boolean"
      },
      "sensitiveDataHint": {
        "description": "If true, this tool processes or has access to sensitive data...",
        "type": "boolean"
      },
      "privilegedAccessHint": {
        "description": "If true, this tool requires elevated system privileges...",
        "type": "boolean"
      },
      "reversibleHint": {
        "description": "If true, this tool's operations can be undone or reversed...",
        "type": "boolean"
      }
    }
  }
}
```

### Example Usage

**AI-Powered Tool:**

```json
{
  "name": "ai_code_analyzer",
  "description": "Analyze code quality and security using AI",
  "inputSchema": {
    "type": "object",
    "properties": {
      "code": { "type": "string" },
      "language": { "type": "string" }
    },
    "required": ["code"]
  },
  "annotations": {
    "title": "AI Code Analyzer",
    "readOnlyHint": true,
    "openWorldHint": true,
    "aiProcessingHint": true,
    "slowExecutionHint": true,
    "sensitiveDataHint": true
  }
}
```

**System Administration Tool:**

```json
{
  "name": "restart_service",
  "description": "Restart a system service",
  "inputSchema": {
    "type": "object",
    "properties": {
      "service_name": { "type": "string" }
    },
    "required": ["service_name"]
  },
  "annotations": {
    "title": "Restart Service",
    "readOnlyHint": false,
    "destructiveHint": false,
    "idempotentHint": true,
    "openWorldHint": false,
    "privilegedAccessHint": true,
    "reversibleHint": true
  }
}
```

**Database Backup Tool:**

```json
{
  "name": "backup_database",
  "description": "Create a backup of the database",
  "inputSchema": {
    "type": "object",
    "properties": {
      "database_name": { "type": "string" },
      "backup_path": { "type": "string" }
    },
    "required": ["database_name"]
  },
  "annotations": {
    "title": "Database Backup",
    "readOnlyHint": false,
    "destructiveHint": false,
    "idempotentHint": true,
    "openWorldHint": false,
    "slowExecutionHint": true,
    "resourceIntensiveHint": true,
    "sensitiveDataHint": true,
    "privilegedAccessHint": true,
    "reversibleHint": true
  }
}
```

## Rationale

### Design Decisions

1. **Boolean hints over enums or numeric values**: Following the existing pattern of tool annotations, all new properties are boolean hints. This provides simplicity and clear semantics while avoiding the complexity of defining thresholds or categories.

2. **All annotations are optional with undefined defaults**: New annotations default to `undefined` (not `false`), meaning "no claim made". This is an important distinction:
   - `undefined`: The tool author makes no assertion about this characteristic
   - `false`: The tool author explicitly asserts the characteristic does not apply
   - `true`: The tool author explicitly asserts the characteristic applies

   This three-state design allows clients to distinguish between "unknown" and "explicitly not applicable".

3. **Hints, not guarantees**: Consistent with existing annotations, these are advisory hints that cannot be relied upon for security decisions. The specification explicitly states that clients should never make security-critical decisions based solely on annotations.

### Alternatives Considered

1. **Generalized `cost` annotation**: A reviewer suggested that `slowExecutionHint` and `resourceIntensiveHint` might generalize to a sense of "cost". While a unified cost model could be valuable, it introduces complexity in defining units and comparability. The discrete boolean hints are more actionable for specific use cases (e.g., showing progress bars vs. limiting concurrent executions).

2. **Response-level annotations instead of tool-level**: A reviewer noted that whether a tool accesses sensitive data may depend on the specific call parameters, suggesting annotations on tool responses rather than tool definitions. While response-level annotations could provide more precise information about what actually occurred, tool-level annotations were chosen for several reasons:
   - **UX timing**: Most client UX decisions (showing progress indicators, displaying security warnings, requesting confirmation) must be made _before_ the tool is invoked, not after. Response-level annotations arrive too late to inform these decisions.
   - **Governance policies**: Organizational policies about which tools require approval or enhanced logging need to be evaluated before invocation, based on the tool's capabilities rather than a specific call's outcome.
   - **Simplicity**: Tool-level annotations are simpler to implement—servers declare hints once per tool rather than computing them dynamically per request.
   - **Complementary, not exclusive**: Response-level annotations could be valuable for indicating what _actually_ happened (e.g., "this specific call did access sensitive data"), but that's complementary to tool-level hints about what _could_ happen. This SEP focuses on the pre-invocation use case; response annotations are being addressed separately in [SEP-1913: Trust and Sensitivity Annotations](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1913).

3. **Using `Tool._meta` for custom annotations**: A reviewer suggested these annotations could be implemented as unofficial fields in `Tool._meta` rather than standardized annotations. While `_meta` provides flexibility for implementation-specific metadata, standardized annotations were chosen because:
   - **Interoperability**: Standardized annotations enable consistent behavior across different client implementations without prior coordination.
   - **Discoverability**: Documented annotations in the spec are discoverable by tool authors and client developers.
   - **Ecosystem consistency**: Standard annotations encourage a common vocabulary for tool characteristics across the MCP ecosystem.

   However, organizations with highly specialized needs may still use `Tool._meta` for custom annotations beyond this standard set.

4. **Using labels/namespacing features**: A reviewer suggested these hints could be covered by upcoming `labels` or `namespacing` features. While labels provide flexibility for arbitrary categorization, dedicated boolean hints were chosen because:
   - **Semantic clarity**: Named hints with documented semantics are clearer than arbitrary labels that require interpretation.
   - **Client implementation**: Clients can implement standard behavior for known hints without parsing label conventions.
   - **Complementary**: Labels could provide additional categorization alongside these hints for organization-specific needs.

5. **Resource annotations**: The `sensitiveDataHint` annotation may apply to Resources as well as Tools. This SEP focuses on tool annotations; extending to resources could be addressed separately.

### Related Work

- The existing tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) establish the pattern this SEP follows
- Enterprise API management systems commonly include similar metadata for governance
- OpenAPI/Swagger extensions often include security and operational hints
- [Issue #630](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/630) discusses security terminology and user awareness—these annotations help address some concerns by making tool characteristics more explicit
- [Issue #711](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/711) proposes trust and sensitivity annotations for requests/responses, which is complementary to this SEP's tool-level hints

### Prior Art

- [PR #616: Add comprehensive tool annotations](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/616) - The original implementation PR that this SEP formalizes
- [PR #1938: Add `agencyHint` tool annotation](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1938) - A related SEP proposing an `agencyHint` annotation for agentic tools, which follows a similar pattern of advisory boolean hints
- [PR #1913: Trust and Sensitivity Annotations](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1913) - A complementary SEP for request/response-level annotations that track data sensitivity and provenance as it flows through tool invocations

## Backward Compatibility

This proposal is fully backward compatible:

- All new annotations are optional
- Default values are `undefined` (no assumption), preserving existing behavior
- Existing implementations that don't recognize the new annotations will simply ignore them
- No changes to existing annotations or their semantics

Clients that don't understand the new annotations can safely ignore them. Servers that don't provide the new annotations will have their tools treated conservatively, as the `undefined` default indicates no claim is made about the tool's characteristics.

## Security Implications

**Important**: All annotations in this proposal are **hints only** and MUST NOT be relied upon for security decisions.

- `sensitiveDataHint` and `privilegedAccessHint` can inform UI warnings and audit logging but MUST NOT replace proper authorization checks
- Malicious servers could provide false annotations; clients must implement security controls independently
- The annotations can assist in developing defense-in-depth strategies but are not security controls themselves

The specification will include clear warnings that:

1. Annotations from untrusted servers should be treated as untrusted
2. Security-critical decisions must not be based solely on annotations
3. These hints are for UX and governance assistance, not access control

## Reference Implementation

The reference implementation is provided in PR #616, which includes:

- Updated TypeScript schema (`schema/draft/schema.ts`) with full JSDoc documentation
- Updated JSON schema (`schema/draft/schema.json`) with descriptions
- Documentation updates (`docs/docs/concepts/tools.mdx`, `docs/specification/draft/server/tools.mdx`)
- Multiple example tools demonstrating annotation usage

Validation:

- Schema validation passes with `npm run validate:schema`
- JSON schema generation successful with `npm run generate:json`
- Documentation builds correctly
- All examples validated against schema

---

## Open Questions

1. **Taxonomy of hints**: Should there be a more formal taxonomy or categorization system for tool hints? The current grouping is informal.

2. **Resource annotations**: Should `sensitiveDataHint` and similar annotations be extended to the Resource primitive as well?

3. **Response annotations**: Should there be a complementary proposal for annotations on tool call responses to indicate actual (vs. potential) behavior?

4. **Cost generalization**: Would a future SEP benefit from a more generalized "cost" model that could subsume `slowExecutionHint` and `resourceIntensiveHint`?
