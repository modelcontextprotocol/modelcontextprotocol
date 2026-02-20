# SEP-2202: Allow Non-File URI Schemes for Roots

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2025-09-29
- **Author(s)**: Tapan Chugh (@chughtapan), Ola (@olaservo); original proposal by @noctonic in #507
- **Sponsor**: Ola (@olaservo)
- **PR**: #2202
- **Original Issue**: #1573 (transferred to new PR-based SEP workflow per SEP-1850)

## Abstract

This SEP proposes removing the restriction that root URIs must begin with `file://`, allowing servers to work with remote resources through any URI scheme. Reference implementations in `python-sdk`, `typescript-sdk`, client (`fast-agent`) a helper for enforcement are provided.

## Motivation

Consider the following scenarios where scoping access to specific resources using roots is highly desirable:

1. **Cloud Storage**: Restricting access to specific S3 buckets or prefixes using `s3://bucket-name/prefix/` roots allows operating only within designated storage areas while preventing access to other buckets or sensitive data paths.

2. **Version Control Repository**: Limiting operations to specific repositories using `https://github.com/owner/repo/` roots limits actions within the current project context without inadvertently affecting other repositories.

3. **Databases**: Restricting databases to `postgres://host/database/table/` roots enables fine-grained control over which schemas, tables, or collections a server can query or modify. No more accidentally deleting the production database.

## Specification

This change was originally proposed in #507 but not followed through. This was due to other time commitments from the original contributor, as well as a lack of a formal SEP governance process at the time, which made it more challenging to move proposals forward.

### Schema Changes

Update the `Root` interface in all schema versions to remove the file:// restriction:

```typescript
export interface Root {
  /**
   * The URI identifying the root. This can be any valid URI scheme.
   * Common schemes include file://, https://, github://, s3://, etc.
   * Servers should document which URI schemes they support.
   *
   * @format uri
   */
  uri: string;

  /**
   * An optional human-readable name for this root.
   */
  name?: string;

  /**
   * Optional metadata for this root.
   */
  _meta?: { [key: string]: unknown };
}
```

The specification should include guidance that

1. Servers must document their supported URI schemes and validate them. Clients may provide roots with any URI scheme, and servers must gracefully handle unsupported schemes by returning clear error messages rather than failing silently.
2. Clients SHOULD provide a way to display which Roots are active

## Rationale

The URI field restriction in the current specification is purely a documentation constraint rather than a technical limitation. Resources in MCP already support any URI scheme, and maintaining consistency between resources and roots simplifies the mental model for developers for roots as client-specified resources which the server can access.

### Alternatives Considered

Creating separate mechanisms for local and remote servers does not provide any clear benefits and fragments the ecosystem. The simple approach of allowing any URI maintains complete backward compatibility. Existing clients continue sending file:// roots unchanged, existing servers continue accepting them, and the ecosystem can gradually adopt support for additional schemes as needed

### Future Work

We discussed proposing programmatic discovery mechanisms for which schemes a server supports, but decided to keep this change simple by removing the file restriction. The lack of programmatic discovery follows MCP's existing patterns and shouldn't limit practical usefulness because:

1. Servers will naturally document what they support, clients will implement common patterns, and the ecosystem will converge on standards, just like with resource URIs.
2. When a client provides an unsupported root, the server returns a clear error. In this case clients can gracefully degrade or prompt users to adjust roots.
3. If this becomes a pain point, a future SEP can add discovery without breaking existing implementations.

## Backward Compatibility

This change is fully backward compatible with existing implementations.

## Reference Implementation

**Python SDK:** https://github.com/modelcontextprotocol/python-sdk/pull/1390/files
**Typescript SDK:** https://github.com/modelcontextprotocol/typescript-sdk/pull/997/files
**Client Changes (fast-agent):** https://github.com/chughtapan/fast-agent/pull/3/files

Although current SDKs don't provide support for roots enforcement, an example has been implemented in [github.com/chughtapan/wags](https://github.com/chughtapan/wags/blob/main/src/wags/middleware/roots.py): a helpful decorator is provided for tools to declare which roots are required:

```python
@mcp.tool
@requires_root("https://github.com/{owner}/{repo}")
async def create_issue(self, owner: str, repo: str, title: str, body: str):
    # Proceed with edit operation
```

and the `call_tool` tool handlers check that provides a root which satisfies this requirement before proceeding.

## Security Considerations

The documentation should clearly highlight that roots are not enforced at the protocol layer, but advisory for the servers. Malicious or buggy servers might violate user expectations of security.

Clients SHOULD provide a way to display which Roots are active
