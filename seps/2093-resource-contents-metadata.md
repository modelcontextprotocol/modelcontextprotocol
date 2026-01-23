# SEP-2093: Resource Contents Metadata and Collection Semantics

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-01-15
- **Author(s)**: Peter Alexander (@pja-ant)
- **Sponsor**: None (seeking sponsor)
- **PR**: https://github.com/modelcontextprotocol/specification/pull/2093

## Abstract

This SEP proposes five related changes to improve the consistency and usability of MCP resources:

1. **Extend resource contents with full metadata**: Change `TextResourceContents` and `BlobResourceContents` to extend `Resource` instead of `ResourceContents`, making all resource metadata (name, title, description, icons, annotations, size) available in `resources/read` responses.

2. **New `resources/metadata` endpoint**: Introduce a method to fetch resource metadata without retrieving content, enabling efficient conditional loading and metadata refresh.

3. **Introduce `isCollection` flag**: Add an `isCollection` boolean to `Resource` to distinguish collection resources (like directories) from regular resources, with defined semantics for each.

4. **Define multi-content semantics**: Specify clear rules for `ReadResourceResult.contents[]` based on whether the resource is a collection, resolving the current ambiguity around multi-URI returns.

5. **Remove `EmbeddedResource.annotations`**: Since resource contents now include annotations, remove the redundant top-level annotations field from `EmbeddedResource`.

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

### 4. No Collection Concept

Many servers expose hierarchical resources (filesystems, databases with tables, etc.) but there's no standard way to indicate that a resource is a collection (container) versus a leaf resource. This leads to ambiguity about what `resources/read` should return for directory-like resources.

### 5. mimeType Ambiguity

When `Resource.mimeType` (from listing) differs from `ResourceContents.mimeType` (from reading), the relationship is undefined. Additionally, if a resource supports multiple formats, it's unclear what `Resource.mimeType` should represent.

### 6. Redundant Annotations on EmbeddedResource

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

### 2. Add `isCollection` to Resource

Add a boolean field to `Resource` indicating whether the resource is a collection:

```typescript
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
   * If true, this resource represents a collection (like a directory or folder).
   * Collections may contain other resources.
   *
   * When reading a collection:
   * - The `contents` array MAY include child resources with different URIs
   * - For large collections, clients SHOULD use `resources/list` with this URI instead
   *
   * When `isCollection` is false, `resources/read` MUST return only the requested URI.
   *
   * When `isCollection` is absent, servers MAY return multiple URIs for backwards
   * compatibility, but this behavior is deprecated for non-collection resources.
   */
  isCollection?: boolean;

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

### 4. Multi-Content Semantics

The `contents` array in `ReadResourceResult` has different semantics based on the `isCollection` flag:

#### For Collection Resources (`isCollection: true`)

When reading a collection resource:

1. The `contents` array MAY contain child resources with **different URIs**
2. Each child resource SHOULD include its own metadata (name, mimeType, etc.)
3. The array is NOT guaranteed to be complete—large collections may return a subset
4. For complete and paginated access to children, clients SHOULD use `resources/list` with the collection URI

Example collection read response:

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
        "isCollection": false,
        "text": "import { app } from './app';\n..."
      },
      {
        "uri": "file:///projects/src/app.ts",
        "name": "app.ts",
        "mimeType": "text/typescript",
        "isCollection": false,
        "text": "export const app = ..."
      }
    ]
  }
}
```

#### For Non-Collection Resources (`isCollection: false`)

When reading a non-collection resource:

1. The `contents` array MUST contain **at least one element**
2. All elements MUST have the **same URI** (the one requested)
3. Multiple elements represent format alternatives (same content, different mimeType)
4. Metadata fields (name, title, description, annotations) SHOULD be consistent across elements
5. The `size` field, if present, SHOULD reflect the size of that specific representation

Example non-collection read response with format alternatives:

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
        "isCollection": false,
        "size": 102400,
        "blob": "JVBERi0xLjQK..."
      },
      {
        "uri": "file:///docs/report.pdf",
        "name": "Quarterly Report",
        "mimeType": "text/plain",
        "isCollection": false,
        "size": 8192,
        "text": "Extracted text content of the PDF..."
      }
    ]
  }
}
```

#### When `isCollection` is Absent (Backwards Compatibility)

For resources where `isCollection` is not specified:

1. Servers MAY return multiple URIs in the `contents` array
2. This behavior is **DEPRECATED** for non-collection resources
3. New implementations SHOULD always specify `isCollection`
4. Clients SHOULD handle multiple URIs gracefully but MAY treat the first element as primary

#### Resource Not Found

If the requested resource does not exist, servers MUST return a JSON-RPC error with code `-32602` (invalid params) rather than an empty contents array:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "error": {
    "code": -32602,
    "message": "Resource not found",
    "data": {
      "uri": "file:///nonexistent.txt"
    }
  }
}
```

### 5. Resource.mimeType Semantics

When a resource supports multiple formats:

- `Resource.mimeType` in `resources/list` represents the **primary or preferred** format
- Clients can discover all available formats via `resources/read` or `resources/metadata`
- If no primary format exists, `mimeType` MAY be omitted
- For collections, `mimeType` MAY indicate the collection type (e.g., `inode/directory`) or be omitted

### 6. Remove EmbeddedResource.annotations

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

### Why an `isCollection` Flag?

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

The dominant use case (65%) is returning collection contents—child resources with different URIs. The `isCollection` flag legitimizes this pattern while providing clear semantics.

We considered several alternatives for distinguishing collections:

1. **Use mimeType (e.g., `inode/directory`)** - mimeType describes content format, not resource semantics; mixing concerns
2. **Infer from URI patterns** - Unreliable; not all collections end with `/`
3. **Separate resource types** - Would require larger schema changes
4. **Explicit boolean flag** - Clear, simple, no overloading of existing fields

The boolean flag is explicit about intent and allows servers to clearly communicate resource semantics.

### Why Allow Multi-URI Returns for Collections?

While the ideal API would have `resources/read` return only the requested URI (using `resources/list` for collection contents), existing implementations return child resources directly. The `isCollection` flag allows us to:

1. Legitimize existing collection behavior
2. Deprecate multi-URI returns for non-collections
3. Provide a clear migration path toward stricter semantics

### Why Deprecate Multi-URI for Non-Collections?

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
- Clients SHOULD handle `isCollection` but absence is valid (backwards compat)

### For Servers

- Servers SHOULD provide metadata fields when available, but they remain optional
- Servers with the `resources` capability MUST implement the new `resources/metadata` method
- Servers SHOULD set `isCollection` on all resources
- Servers returning multiple URIs for non-collections SHOULD migrate to collection semantics or single-URI returns

### EmbeddedResource.annotations Removal

The removal of `EmbeddedResource.annotations` is a breaking change at the schema level. SDKs SHOULD maintain backwards compatibility by:

1. Continuing to accept `annotations` on `EmbeddedResource` in their APIs
2. Copying any provided annotations to `resource.annotations`
3. When reading, exposing `resource.annotations` as `annotations` for compatibility

This allows existing code to continue working while the protocol itself has a single, unambiguous location for annotations.

### Error Code Standardization

Current SDK implementations vary in their error handling for resource not found:

| SDK        | Current Error Code                   |
| ---------- | ------------------------------------ |
| TypeScript | `-32602` (InvalidParams)             |
| Python     | `0` (generic)                        |
| C#         | `-32002` (custom RESOURCE_NOT_FOUND) |
| Rust       | `-32002` (custom RESOURCE_NOT_FOUND) |
| Java       | `-32002` (custom RESOURCE_NOT_FOUND) |
| Go         | `-32002` (custom RESOURCE_NOT_FOUND) |

This SEP standardizes on `-32602` (InvalidParams) as it is the correct standard JSON-RPC error code for invalid parameters, and a non-existent URI is semantically an invalid parameter. While this is a breaking change for C#, Rust, Java, and Go SDKs, clients already need to handle multiple error codes due to the existing inconsistency between TypeScript (-32602), Python (0), and the others (-32002). Standardizing on the correct JSON-RPC code provides a clear path forward.

### Migration Path

1. Servers should start including metadata in `resources/read` responses
2. Servers should set `isCollection` on all resources
3. Servers should implement `resources/metadata`
4. Servers should use error code `-32602` for resource not found
5. Servers returning multiple URIs for non-collections should either:
   - Mark the resource as `isCollection: true` if it's genuinely a collection
   - Return only the requested URI if it's not a collection
6. Clients can gradually adopt the new fields and method
7. SDKs should implement the compatibility shim for `EmbeddedResource.annotations`

## Security Implications

This proposal introduces no new security concerns:

- All information exposed via `resources/read` metadata was already available via `resources/list`
- The `resources/metadata` endpoint exposes no new information
- The `isCollection` flag exposes no new information
- Access controls should already be in place for resource access
