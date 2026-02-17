# SEP-2093: Resource Contents Metadata and Resource Capabilities

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-01-15
- **Author(s)**: Peter Alexander (@pja-ant)
- **Sponsor**: None (seeking sponsor)
- **PR**: https://github.com/modelcontextprotocol/specification/pull/2093

## Abstract

This SEP proposes six related changes to improve the consistency and usability of MCP resources:

1. **Extend resource contents with full metadata**: Change `TextResourceContents` and `BlobResourceContents` to extend `Resource` instead of `ResourceContents`, making all resource metadata (name, title, description, icons, annotations, size) available in `resources/read` responses.

2. **New `resources/metadata` endpoint**: Introduce a method to fetch resource metadata without retrieving content, enabling efficient conditional loading and metadata refresh.

3. **Introduce per-resource `capabilities`**: Add a `capabilities` object to `Resource` with `list` (the resource supports `resources/list` to enumerate children) and `subscribe` (the resource supports `resources/subscribe` for change notifications).

4. **Extend `resources/list` with optional URI scoping**: Add an optional `uri` parameter to `resources/list` so clients can list children of a specific listable resource.

5. **Define multi-content semantics**: Specify clear rules for `ReadResourceResult.contents[]` based on the resource's capabilities, resolving the current ambiguity around multi-URI returns.

6. **Remove `EmbeddedResource.annotations`**: Since resource contents now include annotations, remove the redundant top-level annotations field from `EmbeddedResource`.

These changes resolve longstanding semantic ambiguities in the resource APIs.

## Motivation

The current resource specification has several issues that create confusion and limit functionality:

### 1. Metadata Lost on Read

`resources/list` returns rich `Resource` objects with metadata (name, title, description, icons, annotations, size), but `resources/read` returns stripped-down `ResourceContents` with only uri, mimeType, and content. This creates:

- **Staleness**: Clients caching listings have no way to verify if metadata has changed without re-listing all resources
- **Inefficient validation**: Checking a single resource's metadata requires paginating through `resources/list`
- **Inconsistency**: The same logical entity has different representations depending on the operation

### 2. No Metadata-Only Access

There's no way to refresh metadata for a specific resource without fetching potentially large content. This is problematic for:

- Checking if a resource has been modified (via `lastModified` annotation)
- Updating UI elements (title, icons) without fetching content
- Estimating context window usage via `size` before loading

### 3. Undefined Multi-Content Semantics

`ReadResourceResult.contents` is typed as an array, but the purpose is not specified. Removing the array would break backwards compatibility, but without defined semantics, implementations have diverged with at least four different interpretations:

- Same resource in multiple formats
- Child resources in a collection
- Dependent resources like images for a webpage
- Chunked content

This SEP defines the array's semantics to ensure interoperability.

### 4. No Per-Resource Capability Discovery

Many servers expose hierarchical resources (filesystems, databases with tables, etc.) but there's no standard way to indicate which operations a specific resource supports. Clients cannot know whether a resource is listable (has children) or subscribable without attempting the operation. Additionally, `subscribe` is currently a server-level capability—either all resources are subscribable or none are—but in practice, servers may only support subscriptions for certain resources.

### 5. No Way to List Children of a Resource

`resources/list` currently returns a server-determined set of resources with no way to scope the listing. For hierarchical resources (filesystems, databases, etc.), there is no standard mechanism to list only the children of a specific resource. Clients have no reliable way to discover or traverse resource hierarchies.

### 6. mimeType Ambiguity

When `Resource.mimeType` (from listing) differs from `ResourceContents.mimeType` (from reading), the relationship is undefined. Additionally, if a resource supports multiple formats, it's unclear what `Resource.mimeType` should represent.

### 7. Redundant Annotations on EmbeddedResource

`EmbeddedResource` has an `annotations` field, but the embedded `resource` (once it extends `Resource`) would also have annotations. This creates confusion about which annotations apply and what happens when they conflict.

## Specification

### 1. Resource Contents Extend Resource

Change the type hierarchy so that `TextResourceContents` and `BlobResourceContents` extend `Resource` instead of `ResourceContents`. This brings all resource metadata (name, title, description, icons, annotations, size) into read responses:

```typescript
/**
 * Text content of a resource.
 */
export interface TextResourceContents extends Resource {
  /**
   * The text of the item. This must only be set if the item
   * can actually be represented as text (not binary data).
   */
  text: string;
}

/**
 * Binary content of a resource.
 */
export interface BlobResourceContents extends Resource {
  /**
   * A base64-encoded string representing the binary data of the item.
   *
   * @format byte
   */
  blob: string;
}
```

### 2. Add Per-Resource `capabilities`

Add a `capabilities` object to `Resource` indicating which operations the resource supports:

```typescript
/**
 * Capabilities indicating which operations are supported for a specific resource.
 */
export interface ResourceCapabilities {
  /**
   * If true, this resource supports `resources/list` with its URI to enumerate
   * child resources. This indicates the resource is a container (e.g., a directory,
   * database, or other hierarchical grouping).
   */
  list?: boolean;

  /**
   * If true, this resource supports `resources/subscribe` for change notifications.
   * This provides per-resource granularity beyond the server-level `subscribe`
   * capability.
   */
  subscribe?: boolean;
}

export interface Resource extends BaseMetadata, Icons {
  /**
   * The URI of this resource.
   * @format uri
   */
  uri: string;

  /**
   * The MIME type of this resource, if known.
   */
  mimeType?: string;

  /**
   * The size of the raw resource content, in bytes (i.e., before base64 encoding
   * or any tokenization), if known.
   *
   * This can be used by Hosts to display file sizes and estimate context window usage.
   */
  size?: number;

  /**
   * Capabilities indicating which operations are supported for this resource.
   *
   * - `list`: This resource supports `resources/list` to enumerate children.
   *   When reading a listable resource, the `contents` array MAY include child
   *   resources with different URIs. For complete access, clients SHOULD use
   *   `resources/list` with this URI.
   * - `subscribe`: This resource supports `resources/subscribe` for change
   *   notifications.
   *
   * When absent, clients SHOULD NOT assume the resource supports listing or
   * subscription.
   */
  capabilities?: ResourceCapabilities;

  /**
   * Optional annotations for the client.
   */
  annotations?: Annotations;
}
```

### 3. New `resources/metadata` Method

Introduce a new request/response pair for fetching metadata without content:

```typescript
/**
 * Sent from the client to request metadata for a specific resource URI.
 */
export interface ReadResourceMetadataRequest extends JSONRPCRequest {
  method: "resources/metadata";
  params: ReadResourceMetadataRequestParams;
}

export interface ReadResourceMetadataRequestParams extends RequestParams {
  /**
   * The URI of the resource to read metadata for.
   *
   * @format uri
   */
  uri: string;
}

/**
 * The server's response to a resources/metadata request.
 */
export interface ReadResourceMetadataResult extends Result {
  /**
   * Metadata for the requested resource.
   */
  resource: Resource;
}
```

Servers advertising the `resources` capability MUST support this method.

### 4. Extend `resources/list` with URI Scoping

Add an optional `uri` parameter to `ListResourcesRequest` so clients can list the children of a specific listable resource:

```typescript
export interface ListResourcesRequestParams extends PaginatedRequestParams {
  /**
   * If specified, the server MUST return only resources that are direct children
   * of the resource identified by this URI. The target resource MUST have
   * `capabilities.list` set to `true`.
   *
   * If omitted, the server returns its default resource list (existing behavior).
   *
   * @format uri
   */
  uri?: string;
}

export interface ListResourcesRequest extends PaginatedRequest {
  method: "resources/list";
  params?: ListResourcesRequestParams;
}
```

When `uri` is provided:

1. The server MUST return only direct children of the specified resource
2. The response uses the existing `ListResourcesResult` format (with pagination support)
3. If the target resource does not exist or does not have `capabilities.list`, the server SHOULD return an error

This enables efficient traversal of hierarchical resources without requiring the client to infer hierarchy from the default resource list.

> **Note to client implementors**: The resource graph is not guaranteed to be finite or acyclic. A listable resource's children may themselves be listable, and the resulting hierarchy may contain cycles (e.g., symlinks) or be unbounded (e.g., dynamically generated resources). Clients MUST NOT assume that recursively listing all resources will terminate, and SHOULD implement safeguards such as depth limits or visited-URI tracking when traversing resource hierarchies.

### 5. Multi-Content Semantics

The `contents` array in `ReadResourceResult` has different semantics based on the resource's capabilities:

#### For Listable Resources (`capabilities.list: true`)

When reading a listable resource:

1. The `contents` array MAY contain child resources with **different URIs**
2. Each child resource SHOULD include its own metadata (name, mimeType, etc.)
3. The array is NOT guaranteed to be complete—large collections may return a subset
4. For complete and paginated access to children, clients SHOULD use `resources/list` with the resource URI

Example listable resource read response:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "contents": [
      {
        "uri": "file:///projects/src/main.ts",
        "name": "main.ts",
        "mimeType": "text/typescript",
        "text": "import { app } from './app';\n..."
      },
      {
        "uri": "file:///projects/src/app.ts",
        "name": "app.ts",
        "mimeType": "text/typescript",
        "text": "export const app = ..."
      }
    ]
  }
}
```

#### For Non-Listable Resources

When reading a resource without `capabilities.list`:

1. The `contents` array MUST contain **at least one element**
2. All elements MUST have the **same URI** (the one requested)
3. Multiple elements represent format alternatives (same content, different mimeType)
4. Metadata fields (name, title, description, annotations) SHOULD be consistent across elements
5. The `size` field, if present, SHOULD reflect the size of that specific representation

Example read response with format alternatives:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "contents": [
      {
        "uri": "file:///docs/report.pdf",
        "name": "Quarterly Report",
        "mimeType": "application/pdf",
        "size": 102400,
        "blob": "JVBERi0xLjQK..."
      },
      {
        "uri": "file:///docs/report.pdf",
        "name": "Quarterly Report",
        "mimeType": "text/plain",
        "size": 8192,
        "text": "Extracted text content of the PDF..."
      }
    ]
  }
}
```

#### When `capabilities` is Absent (Backwards Compatibility)

For resources where `capabilities` is not specified:

1. Servers MAY return multiple URIs in the `contents` array
2. This behavior is **DEPRECATED** for non-listable resources
3. New implementations SHOULD always specify `capabilities`
4. Clients SHOULD handle multiple URIs gracefully but MAY treat the first element as primary

### 6. Resource.mimeType Semantics

When a resource supports multiple formats:

- `Resource.mimeType` in `resources/list` represents the **primary or preferred** format
- Clients can discover all available formats via `resources/read` or `resources/metadata`
- If no primary format exists, `mimeType` MAY be omitted
- For listable resources, `mimeType` MAY indicate the container type (e.g., `inode/directory`) or be omitted

### 7. Remove EmbeddedResource.annotations

Since `TextResourceContents` and `BlobResourceContents` now extend `Resource`, they inherit the `annotations` field. To avoid redundancy and confusion, the `annotations` field is removed from `EmbeddedResource`:

```typescript
export interface EmbeddedResource {
  type: "resource";
  resource: TextResourceContents | BlobResourceContents;
  // annotations field removed - use resource.annotations instead
  _meta?: MetaObject;
}
```

Annotations for embedded resources are now accessed via `embeddedResource.resource.annotations`.

## Rationale

### Why Extend Resource Instead of Adding Fields?

We considered adding metadata fields directly to `ResourceContents`, but extending `Resource` provides:

- Automatic consistency: any future fields added to `Resource` are inherited
- Cleaner type hierarchy: eliminates a redundant intermediate type
- No duplication: metadata definition exists in one place

### Why a Separate `resources/metadata` Method?

We considered adding a `metadataOnly` flag to `resources/read`, but a separate method:

- Keeps schemas clean (no conditional fields based on flags)
- Makes capability discovery explicit
- Follows REST-like principles (different operations = different methods)

### Why Per-Resource Capabilities?

Analysis of multi-content usage across MCP server implementations revealed the following patterns:

| Pattern             | Example                                                                      | %   |
| ------------------- | ---------------------------------------------------------------------------- | --- |
| Collection/List     | GitHub directory contents, Jasper styles, K8s contexts, calendar events      | 65% |
| Test/Example        | SDK tests returning text+blob, FastMCP multi-item tests                      | 20% |
| Batch Fetch         | `drive-multi:?ids=a,b,c`, screenshot with array                              | 8%  |
| Composite/Sectioned | Terraform guide (6 markdown sections), project resource (repos/api/db/tools) | 8%  |
| Resource + Metadata | Gyazo image blob + metadata markdown, tile image + JSON metadata             | 6%  |
| Search Results      | Vector store search returning top 3 matches                                  | 4%  |
| Header + Items      | Status message + error list, data + user context                             | 4%  |

The dominant use case (65%) is returning collection contents—child resources with different URIs. The `capabilities.list` field legitimizes this pattern while providing clear semantics.

A capabilities-based approach was chosen over a type-based approach (e.g., a `resourceType` enum) for several reasons:

1. **Capabilities describe what you can _do_, not what something _is_**: A resource may be both readable and listable (e.g., a directory that has its own summary content). A type enum would force a single classification.
2. **Per-resource `subscribe`**: Subscription support is currently a server-level boolean, but in practice servers often only support subscriptions for certain resources. Per-resource capabilities allow clients to know upfront which resources are subscribable.
3. **Extensible without new types**: Future operations (e.g., streaming, chunking, seeking) can be added as new capability fields without changing an enum or introducing new resource kinds.
4. **Mirrors server capabilities pattern**: MCP already uses capability objects for server-level feature discovery; applying the same pattern at the resource level is consistent.

We considered several alternatives:

1. **`resourceType` enum (`"document"` | `"collection"`)** - Forces a single classification; a resource that is both listable and readable doesn't fit cleanly into either category
2. **Use mimeType (e.g., `inode/directory`)** - mimeType describes content format, not resource semantics; mixing concerns
3. **Infer from URI patterns** - Unreliable; not all collections end with `/`
4. **Boolean `isCollection` flag** - Only addresses one dimension; doesn't help with subscribe granularity

### Why Allow Multi-URI Returns for Listable Resources?

While the ideal API would have `resources/read` return only the requested URI (using `resources/list` for collection contents), existing implementations return child resources directly. The `capabilities.list` field allows us to:

1. Legitimize existing collection behavior
2. Deprecate multi-URI returns for non-listable resources
3. Provide a clear migration path toward stricter semantics

### Why Deprecate Multi-URI for Non-Listable Resources?

Returning unrelated URIs from a read operation violates the principle of least surprise. When I call `read(X)`, I expect to get `X` back—not `Y` and `Z`. The deprecation guides implementations toward the correct pattern while maintaining backwards compatibility.

### Why Remove EmbeddedResource.annotations?

With resource contents now including annotations, `EmbeddedResource` would have two places for annotations: `annotations` and `resource.annotations`. We considered several approaches:

1. **Keep both, define precedence** - Confusing; unclear which to use when creating or reading
2. **Require they match** - Redundant data that must be kept in sync
3. **Remove top-level annotations** - Single source of truth, SDKs can provide compatibility

Option 3 provides the cleanest protocol semantics while allowing SDKs to maintain API compatibility for existing code.

## Backward Compatibility

Most changes in this proposal are backwards compatible. The removal of `EmbeddedResource.annotations` is a breaking schema change, but can be handled gracefully.

### For Clients

- All new fields in `resources/read` responses are optional
- Clients can ignore fields they don't recognize
- Existing code continues to work unchanged
- Clients SHOULD handle `capabilities` but absence is valid (backwards compat)

### For Servers

- Servers SHOULD provide metadata fields when available, but they remain optional
- Servers with the `resources` capability MUST implement the new `resources/metadata` method
- Servers SHOULD set `capabilities` on all resources
- Servers returning multiple URIs for non-listable resources SHOULD migrate to `capabilities: { list: true }` or single-URI returns

### EmbeddedResource.annotations Removal

The removal of `EmbeddedResource.annotations` is a breaking change at the schema level. SDKs SHOULD maintain backwards compatibility by:

1. Continuing to accept `annotations` on `EmbeddedResource` in their APIs
2. Copying any provided annotations to `resource.annotations`
3. When reading, exposing `resource.annotations` as `annotations` for compatibility

This allows existing code to continue working while the protocol itself has a single, unambiguous location for annotations.

## Security Implications

This proposal introduces no new security concerns:

- All information exposed via `resources/read` metadata was already available via `resources/list`
- The `resources/metadata` endpoint exposes no new information
- The `capabilities` field exposes no new information beyond what was already discoverable
- Access controls should already be in place for resource access
