# SEP-0000: Resource Contents Metadata and Multi-Format Semantics

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-01-15
- **Author(s)**: Peter Alexander (@pja-ant)
- **Sponsor**: None (seeking sponsor)
- **PR**: TBD

## Abstract

This SEP proposes four related changes to improve the consistency and usability of MCP resources:

1. **Extend resource contents with full metadata**: Change `TextResourceContents` and `BlobResourceContents` to extend `Resource` instead of `ResourceContents`, making all resource metadata (name, title, description, icons, annotations, size) available in `resources/read` responses.

2. **New `resources/metadata` endpoint**: Introduce a method to fetch resource metadata without retrieving content, enabling efficient conditional loading and metadata refresh.

3. **Define multi-content semantics**: Specify that `ReadResourceResult.contents[]` is for returning the same logical resource in multiple MIME type formats, not for returning multiple distinct resources.

4. **Remove `EmbeddedResource.annotations`**: Since resource contents now include annotations, remove the redundant top-level annotations field from `EmbeddedResource`.

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

### 4. mimeType Ambiguity

When `Resource.mimeType` (from listing) differs from `ResourceContents.mimeType` (from reading), the relationship is undefined. Additionally, if a resource supports multiple formats, it's unclear what `Resource.mimeType` should represent.

### 5. Redundant Annotations on EmbeddedResource

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


### 2. New `resources/metadata` Method

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
   * Metadata for the requested resource. The array typically contains
   * one element, but MAY contain multiple elements if the resource
   * is available in multiple formats (with different mimeTypes).
   */
  metadata: Resource[];
}
```

Servers advertising the `resources` capability MUST support this method.

### 3. Multi-Content Semantics

The `contents` array in `ReadResourceResult` is defined with the following requirements:

1. All elements MUST have the **same URI** (the one requested)
2. Each element SHOULD have a **different mimeType** (this is the purpose of multiple elements)
3. Metadata fields (name, title, description, annotations) SHOULD be consistent across all elements
4. The `size` field, if present, SHOULD reflect the size of that specific representation

Servers MAY return only a subset of available formats based on capability or client needs.

Example response with multiple formats:

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

### 4. Resource.mimeType Semantics

When a resource supports multiple formats:

- `Resource.mimeType` in `resources/list` represents the **primary or preferred** format
- Clients can discover all available formats via `resources/read` or `resources/metadata`
- If no primary format exists, `mimeType` MAY be omitted

### 5. Remove EmbeddedResource.annotations

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

### Why Remove EmbeddedResource.annotations?

With resource contents now including annotations, `EmbeddedResource` would have two places for annotations: `annotations` and `resource.annotations`. We considered several approaches:

1. **Keep both, define precedence** - Confusing; unclear which to use when creating or reading
2. **Require they match** - Redundant data that must be kept in sync
3. **Remove top-level annotations** - Single source of truth, SDKs can provide compatibility

Option 3 provides the cleanest protocol semantics while allowing SDKs to maintain API compatibility for existing code.

### Alternative: Extract ResourceMetadata Base Type

An alternative approach suggested during discussion was extracting a `ResourceMetadata` type (Resource minus uri) that would be shared by Resource, ResourceTemplate, and contents types. While elegant, this would be a larger refactor. This SEP takes a more conservative approach; a future SEP could introduce this consolidation.

## Backward Compatibility

Most changes in this proposal are backwards compatible. The removal of `EmbeddedResource.annotations` is a breaking schema change, but can be handled gracefully.

### For Clients

- All new fields in `resources/read` responses are optional
- Clients can ignore fields they don't recognize
- Existing code continues to work unchanged

### For Servers

- Servers SHOULD provide metadata fields when available, but they remain optional
- Servers with the `resources` capability MUST implement the new `resources/metadata` method
- Servers using `contents[]` for purposes other than multi-format should migrate to the defined semantics

### EmbeddedResource.annotations Removal

The removal of `EmbeddedResource.annotations` is a breaking change at the schema level. SDKs SHOULD maintain backwards compatibility by:

1. Continuing to accept `annotations` on `EmbeddedResource` in their APIs
2. Copying any provided annotations to `resource.annotations`
3. When reading, exposing `resource.annotations` as `annotations` for compatibility

This allows existing code to continue working while the protocol itself has a single, unambiguous location for annotations.

### Migration Path

1. Servers should start including metadata in `resources/read` responses
2. Servers should implement `resources/metadata`
3. Clients can gradually adopt the new fields and method
4. SDKs should implement the compatibility shim for `EmbeddedResource.annotations`

## Security Implications

This proposal introduces no new security concerns:

- All information exposed via `resources/read` metadata was already available via `resources/list`
- The `resources/metadata` endpoint exposes no new information
- Access controls should already be in place for resource access

## Reference Implementation

A reference implementation will be provided in the TypeScript SDK prior to finalization:

1. Update schema.ts with new type definitions
2. Update Python SDK with corresponding changes
3. Implement `EmbeddedResource.annotations` compatibility shim in both SDKs
4. Add example server demonstrating multi-format resources
5. Add client examples using `resources/metadata`

