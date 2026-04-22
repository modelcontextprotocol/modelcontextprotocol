# SEP-2356: Declarative File Inputs for Tools and Elicitation

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-03-04
- **Author(s)**: TBD
- **Sponsor**: None
- **PR**: [#2356](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2356)

## Abstract

This SEP introduces `mcpFile`, a JSON Schema extension keyword that marks a
`uri`-format string property as a file input. The keyword carries optional
MIME-type filters and a size limit. Clients that recognize the keyword render
a native file picker for the annotated property and populate it with a URI
pointing to the selected file. Servers receive an ordinary URI string; the
annotation affects client-side presentation only.

The mechanism is a pure annotation. The underlying schema type is a standard
`{ "type": "string", "format": "uri" }` (or an array thereof), and servers
accept any well-formed URI regardless of whether the client recognized the
keyword or how the value was produced.

## Motivation

Many tools conceptually operate on files: image converters, document parsers,
code formatters, data importers. MCP currently offers no first-class way for a
server to tell a client "this string argument is meant to be a file the user
picks from disk." Today, server authors work around this in one of several
unsatisfying ways:

1. **Prose instructions in the tool description.** "Pass the file as a
   base64-encoded data URI in the `image` field." This relies on the model
   correctly interpreting natural language and hand-assembling a data URI,
   which is brittle and wastes context-window tokens on encoding boilerplate.
2. **Filesystem paths.** Some local servers accept a path string and read the
   file themselves. This only works when client and server share a filesystem,
   fails for remote servers, and couples the tool to the client's directory
   layout.
3. **Separate upload endpoints.** The server exposes an out-of-band HTTP
   endpoint, the user uploads there first, and passes a returned handle to the
   tool. This works but requires the server to run an HTTP listener and the
   client to know about it, neither of which MCP standardizes today.

Meanwhile, the client is the party best positioned to solve this problem. It
already has native UI, knows the user's filesystem, and can trivially show a
file picker. It just doesn't know _which_ arguments should trigger one.

This SEP closes that gap with a small, declarative annotation. The keyword
lives directly inside the schema property it describes, which keeps the schema
self-contained and avoids introducing a parallel data structure that has to
stay in sync with it.

## Overview

This section walks through both surfaces end-to-end with the smallest possible
examples. The formal rules follow in **Specification**.

### Tool surface: definition → call

A server declares that the `image` argument is a file by adding the `mcpFile`
keyword to the property's schema. The argument's type does not change; it
remains an ordinary `uri`-format string:

```json
{
  "name": "describe_image",
  "description": "Describe the contents of an image.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "image": {
        "type": "string",
        "format": "uri",
        "description": "The image to describe.",
        "mcpFile": {
          "accept": ["image/png", "image/jpeg"],
          "maxSize": 5242880
        }
      }
    },
    "required": ["image"]
  }
}
```

A client that recognizes `mcpFile` renders a file picker filtered to PNG/JPEG,
encodes the user's selection as a URI, and invokes the tool:

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tools/call",
  "params": {
    "name": "describe_image",
    "arguments": {
      "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNkYGBgAAAABQABWaDDsAAAAABJRU5ErkJggg=="
    }
  }
}
```

The payload above is a real 1×1 PNG, not truncated. The file travels inline
with no separate upload step.

### Elicitation surface: request → response

The server asks the user for a file mid-flow. The same `mcpFile` keyword
applies to `requestedSchema` properties:

```json
{
  "jsonrpc": "2.0",
  "id": 12,
  "method": "elicitation/create",
  "params": {
    "mode": "form",
    "message": "Please select a profile photo.",
    "requestedSchema": {
      "type": "object",
      "properties": {
        "photo": {
          "type": "string",
          "format": "uri",
          "title": "Profile photo",
          "mcpFile": {
            "accept": ["image/*"],
            "maxSize": 2097152
          }
        }
      },
      "required": ["photo"]
    }
  }
}
```

The client renders a form with a file picker for `photo`, the user chooses a
file, and the client responds with the file encoded as a URI in the same
string slot the schema already defined:

```json
{
  "jsonrpc": "2.0",
  "id": 12,
  "result": {
    "action": "accept",
    "content": {
      "photo": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNkYGBgAAAABQABWaDDsAAAAABJRU5ErkJggg=="
    }
  }
}
```

That's the entire mechanism. The rest of this document specifies the keyword's
constraints, wire encoding, and error handling.

## Specification

### The `mcpFile` extension keyword

`mcpFile` is a JSON Schema extension keyword in the sense of
[§6.5 of the JSON Schema core specification][json-schema-6.5]: an unknown
keyword that implementations SHOULD treat as an annotation. It is valid only
on schemas that describe a URI-bearing string, specifically:

- **Single file:** `type: "string"` with `format: "uri"`.
- **Multiple files:** `type: "array"` whose `items` schema is
  `type: "string"` with `format: "uri"`. The `mcpFile` keyword appears on the
  array schema, not on `items`.

[json-schema-6.5]: https://json-schema.org/draft/2020-12/json-schema-core#section-6.5

The keyword's value is an object:

```typescript
interface FileInputDescriptor {
  /**
   * Media type patterns and/or file extensions the client SHOULD filter the
   * picker to. Supports exact MIME types ("image/png"), wildcard subtypes
   * ("image/*"), and dot-prefixed extensions (".pdf") following the same
   * grammar as the HTML accept attribute. Extension entries are picker hints
   * only; server-side validation compares MIME types. If omitted, the picker
   * SHOULD accept any file type.
   */
  accept?: string[];

  /**
   * Maximum size in bytes of the decoded file content that the server will
   * accept. For array-typed properties, this limit applies per file. Servers
   * SHOULD set this to avoid surprising clients with rejection after a large
   * upload. If omitted, the server imposes no declared limit (but MAY still
   * reject excessively large payloads).
   */
  maxSize?: number;

  /**
   * Name of a sibling string property in the same object schema that the
   * client SHOULD populate with the selected file's original filename.
   */
  filenameProperty?: string;
}
```

Clients that encounter `mcpFile` on a schema that does not match one of the
permitted shapes **SHOULD** ignore the keyword and render the field as an
ordinary input.

For the array form, the client **SHOULD** respect `minItems` and `maxItems`
from the enclosing array schema when configuring the file picker. Servers
**SHOULD** declare `maxItems` whenever `mcpFile` is present on an array, and
**SHOULD** enforce an aggregate ceiling no greater than `maxSize × maxItems`
bytes. Clients **SHOULD** refuse to render an unbounded multi-file picker.

The standard `required` array governs whether the file argument is mandatory,
as with any other property.

The `format: "uri"` precondition is a recognition marker. Clients and servers
**SHOULD NOT** enable `format: "uri"` as a JSON Schema validation assertion on
`mcpFile` fields; the value is constrained by [Wire encoding](#wire-encoding)
below, not by RFC 3986 generic syntax, and asserting it would run large data
URIs through a regex on every call.

#### Example: image resizing tool

```json
{
  "name": "resize_image",
  "description": "Resize an image to the specified dimensions.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "image": {
        "type": "string",
        "format": "uri",
        "description": "The image to resize.",
        "mcpFile": {
          "accept": ["image/png", "image/jpeg", "image/webp"],
          "maxSize": 10485760
        }
      },
      "width": { "type": "integer", "minimum": 1 },
      "height": { "type": "integer", "minimum": 1 }
    },
    "required": ["image", "width", "height"]
  }
}
```

#### Example: multi-file attachment tool

```json
{
  "name": "create_support_ticket",
  "description": "File a support ticket with optional attachments.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "summary": { "type": "string" },
      "attachments": {
        "type": "array",
        "items": { "type": "string", "format": "uri" },
        "maxItems": 5,
        "mcpFile": {
          "accept": ["image/*", "application/pdf", "text/plain"],
          "maxSize": 5242880
        }
      }
    },
    "required": ["summary"]
  }
}
```

### Elicitation schema extension: `ArraySchema`

To support multi-file elicitation fields, `PrimitiveSchemaDefinition` gains an
`ArraySchema` member:

```typescript
type PrimitiveSchemaDefinition =
  | StringSchema
  | NumberSchema
  | BooleanSchema
  | EnumSchema
  | ArraySchema;

interface ArraySchema {
  type: "array";
  items: StringSchema;
  title?: string;
  description?: string;
  minItems?: number;
  maxItems?: number;
  mcpFile?: FileInputDescriptor;
}
```

`ArraySchema` admits only string items in this SEP. Generalization to other
primitive item types is deferred to a follow-on SEP that simultaneously widens
`ElicitResult.content` (currently `string | number | boolean | string[]`) to
carry the corresponding array values. Nesting (arrays of arrays) is not
permitted. When `mcpFile` is present, `items` **MUST** have `format: "uri"`.

The `StringSchema` type likewise gains an optional `mcpFile` field for the
single-file case.

Because `ArraySchema` is a new union member, clients predating this addition
may reject the entire elicitation request rather than rendering the array
field as unknown. Servers **SHOULD NOT** include `type: "array"` properties in
`requestedSchema` unless the client declared `elicitation.arrays` in its
capabilities.

### Wire encoding

When a client populates an `mcpFile`-annotated argument from a user-selected
file, it **SHOULD** encode the file as an [RFC 2397][rfc2397] data URI using
base64 encoding:

```
data:<mediatype>;base64,<data>
```

[rfc2397]: https://www.rfc-editor.org/rfc/rfc2397

Where `<mediatype>` is the MIME type of the file as reported by the client's
platform (e.g., `image/png`). If the platform does not report a type, the
client **SHOULD** use `application/octet-stream`.

Example value (a complete, valid 1×1 PNG, not truncated):

```
data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNkYGBgAAAABQABWaDDsAAAAABJRU5ErkJggg==
```

Clients **MAY** instead supply a URI using a different scheme when doing so is
more appropriate for the transport or file size:

- `file://` URIs are suitable when client and server share a filesystem (e.g.,
  a local stdio server). The server reads the file directly with no encoding
  overhead.
- `http://` or `https://` URIs are suitable when the file is already hosted or
  when the client has access to upload infrastructure. The server fetches the
  file itself.

Servers **MUST** accept `data:` URIs for `mcpFile` arguments. Servers **MAY**
reject other schemes; such servers **SHOULD** document this restriction in the
tool description and use the `file_scheme_unsupported` reason (see
[Server-side validation](#server-side-validation)). Servers that accept
`http(s)://` or `file://` schemes **MUST** apply the safeguards in
[Security Implications](#security-implications).

If a server needs the original filename, it **SHOULD** declare a separate
string argument for it and reference it via `filenameProperty` in the
`mcpFile` descriptor. Clients **SHOULD** populate the named property from the
picker's `File.name`. Clients **MUST NOT** attempt to infer which sibling
property is the filename by name-matching heuristics.

### Host integration on the tool surface

Tools are model-controlled; the model populates `arguments`. The recommended
flow for `mcpFile` arguments on the tool surface is:

1. The model emits a `tools/call` with the `mcpFile` argument absent or set to
   a placeholder value.
2. The host detects the unfilled `mcpFile` slot at the human-in-the-loop
   confirmation step it already presents for tool calls.
3. The host renders a file picker, encodes the user's selection per
   [Wire encoding](#wire-encoding), and substitutes the value before
   dispatching the request to the server.
4. Hosts **SHOULD NOT** include the encoded data URI value in model context;
   the model does not need to see file bytes to proceed.

Hosts **MAY** alternatively pre-bind files the user has already attached to
the conversation, matching them to `mcpFile` slots by `accept` filter, and
present that binding for confirmation rather than a fresh picker. This is the
pattern OpenAI Apps SDK `fileParams` follows.

Hosts that recognize `mcpFile` but cannot present a picker (CLI without a TTY,
automated agents, CI pipelines) **SHOULD** prompt for a local path and encode
it, or for elicitation respond with `action: "decline"`. Hosts **SHOULD NOT**
prompt the user to type a raw data URI string.

### Client-side validation

Clients **SHOULD** check the selected file's size against `maxSize` after
selection and before encoding, and present a user-facing error rather than
transmitting a payload that is known to violate the constraint. Clients
**SHOULD NOT** rely on the operating system's picker filter alone to enforce
`accept`; pickers commonly allow the user to override the filter.

### Server-side validation

Servers **MUST** validate received file inputs against their declared
constraints regardless of which surface delivered them.

When validating against `accept`, servers **MUST** compare only the
`type/subtype` portion of the content's media type, ignoring any parameters,
and the comparison **MUST** be case-insensitive. For data URIs, the media type
is the `<mediatype>` segment before `;base64`. For fetched or file-read
content, the media type is determined by the server (from HTTP headers,
extension heuristics, or content sniffing). A wildcard entry such as `image/*`
matches any subtype of `image`.

Recommended `reason` values for the structured error payloads that follow:

| `reason`                  | Meaning                                                      |
| ------------------------- | ------------------------------------------------------------ |
| `file_too_large`          | Content size exceeds `maxSize`.                              |
| `file_type_rejected`      | Media type does not satisfy `accept`.                        |
| `file_uri_malformed`      | Value uses the `data:` scheme but is not well-formed.        |
| `file_scheme_unsupported` | URI scheme is valid but not accepted by this server.         |
| `file_unreachable`        | Server could not fetch or read the file at the supplied URI. |

#### Tool calls

Following [SEP-1303][sep-1303], servers **SHOULD** report `file_too_large`,
`file_type_rejected`, `file_scheme_unsupported`, and `file_unreachable` as
tool-execution errors (`CallToolResult` with `isError: true`) so that the
model can see the failure and self-correct. The error content **SHOULD** be a
structured object:

```json
{
  "jsonrpc": "2.0",
  "id": 42,
  "result": {
    "isError": true,
    "content": [
      {
        "type": "text",
        "text": "File exceeds maximum size"
      }
    ],
    "structuredContent": {
      "reason": "file_too_large",
      "argument": "image",
      "maxSize": 10485760,
      "receivedSize": 15728640
    }
  }
}
```

Servers **MAY** instead return JSON-RPC `-32602` (Invalid Params) for
`file_uri_malformed`, where the value fails the `format: "uri"` schema
constraint and is therefore a protocol-level input error rather than an
execution-level one.

[sep-1303]: ./1303-input-validation-errors-as-tool-execution-errors.md

#### Elicitation results

An `ElicitResult` is a JSON-RPC _response_, so the server cannot reject it
with `-32602`. When a file field in `ElicitResult.content` violates a
constraint, the server **SHOULD** do one of the following:

- Issue a fresh `elicitation/create` request whose `message` explains the
  violation (e.g., "The selected file is 12 MB; please choose one under
  10 MB."), giving the user a chance to retry.
- Fail the operation that initiated the elicitation. For an elicitation nested
  inside a tool call, return a `CallToolResult` with `isError: true` and a
  textual explanation.

Servers **SHOULD** prefer re-eliciting when the violation is user-correctable
and failing the enclosing operation when it is not.

## Rationale

### Why an inline extension keyword rather than a sidecar map?

An earlier draft of this SEP placed file annotations in a separate
`inputFiles` map alongside `inputSchema`, keyed by property name. The inline
design is simpler for several reasons:

- **No dual-keying.** A sidecar map creates two places that must agree on
  property names. The inline keyword lives directly on the property it
  describes, so mismatch is impossible by construction.
- **Standard JSON Schema mechanism.** §6.5 of the core specification
  explicitly permits extension keywords; using it means generic JSON Schema
  tooling passes the keyword through unchanged. The 2020-12 dialect (MCP's
  default per SEP-1613) already includes `contentEncoding` and
  `contentMediaType` as annotation keywords for describing encoded string
  content, so the pattern has precedent within the dialect itself.
- **No capability gate for the keyword itself.** A sidecar field on `Tool`
  raises the question of whether servers should send it to clients that don't
  understand it. An inline keyword inside `inputSchema` is simply an unknown
  annotation to such clients, which §6.5 already says they SHOULD ignore. The
  §6.5 argument establishes that a flag is not needed for protocol safety; it
  does not address server-side discovery utility ("should I list this tool if
  the client cannot fill it"). The `elicitation.arrays` flag introduced by
  this SEP exists for the latter reason on the elicitation surface, where a
  new union member is not gracefully degradable in shipped SDKs.

The analogy to HTML is instructive: `<input type="file" accept="image/*">`
puts the file hint directly on the element, not in a parallel attribute map.

### Why not `contentEncoding` / `contentMediaType`?

The 2020-12 dialect already provides `contentMediaType` and `contentEncoding`
for annotating string content. This SEP introduces `accept` instead for three
reasons:

- `contentMediaType` takes a single RFC 2046 media type and cannot express
  disjunction (`["image/png", "image/jpeg"]`) or wildcard subtypes
  (`"image/*"`). `accept` is the multi-valued analogue, not a reinvention.
- `contentEncoding: "base64"` would fix the wire shape to inline bytes,
  foreclosing the `file://` and `https://` reference forms.
- A URI-typed carrier lets one schema slot hold either inline bytes or a
  reference, and lets the same server-side handler accept both.

Servers **MAY** additionally emit `contentMediaType` on the same property as a
hint for non-MCP JSON Schema tooling.

### Why not reuse `BlobResourceContents` or `EmbeddedResource` as the wire shape?

MCP already carries binary content via `BlobResourceContents` and
`EmbeddedResource`, but those types are members of the `ContentBlock` union
used in server-to-client flows (`CallToolResult`, `ReadResourceResult`).
`CallToolRequest.arguments` is an open `{[key]: unknown}` shaped by the tool's
JSON Schema, and `ElicitResult.content` is restricted to primitives. Carrying
a structured object would require widening both surfaces, whereas a URI string
fits the slots that already exist. The trade-off is that the string carrier
does not provide a structured `{name, mimeType, size}` metadata envelope,
which is why `filenameProperty` exists as a declarative pointer to a sibling
field.

### Why not `x-mcp-file` or a `_meta` placement?

The `x-` prefix offers no additional validator tolerance: strict-mode
validators reject `x-mcpFile` exactly as they reject `mcpFile`. OpenAPI 3.1
dropped the `x-` requirement for Schema Objects in favor of vocabulary
declarations. A `_meta` placement (the original review suggestion) was
considered and rejected because it separates the annotation from the property
it describes, which is poor locality for generic JSON Schema form renderers
and reintroduces the dual-keying problem the inline design avoids.

### Why data URIs by default rather than mandating them?

Data URIs are the only scheme a client can always produce without external
infrastructure: no upload endpoint, no shared filesystem, no network
dependency. That makes them the right default. But mandating them ignores
cases where a better option exists:

- A local stdio client and server share a filesystem; `file://` avoids a 33%
  base64 encoding overhead and the memory cost of materializing the encoded
  string.
- A file already hosted at a public URL needs no re-encoding at all.
- A future MCP resource-writing mechanism may offer transport-optimized
  transfer that neither party should be prevented from using.

The SEP therefore specifies data URIs as the default encoding and permits
other schemes as a client choice. Servers that want the simplicity of a single
code path may reject other schemes; servers that want the efficiency may
accept them.

### Why not carry the filename in the URI?

An earlier draft added a `name=` parameter to the data URI
(`data:image/png;name=photo.png;base64,…`). This was dropped because:

- RFC 2397 does not define `name=` semantically; standardizing it within MCP
  would be a protocol-specific reinterpretation of a generic format.
- Clients may prefer not to expose original filenames, which can leak
  information the user did not intend to share.
- Servers that need the filename can declare a separate string argument, which
  makes the requirement explicit in the schema and lets the user see (and
  edit) what is being sent.

### Why not mandate a hard size limit in the spec?

Data URIs embed base64 in the JSON-RPC envelope, so very large files are
impractical (memory pressure on both sides, ~33% encoding overhead, JSON
parser limits in some runtimes). However, "large" is context-dependent: a
50 MB limit is conservative for a local stdio server and generous for a
constrained edge deployment. The SEP therefore provides the `maxSize` knob
per-argument and leaves the value to server authors.

For files too large to embed inline, the scheme flexibility above provides two
escape valves: `file://` for local servers, and URL-mode elicitation to direct
the user to a server-controlled upload endpoint for remote ones. Neither
requires new transport machinery.

### Prior art: OpenAI Apps SDK `openai/fileParams`

OpenAI's [Apps SDK](https://developers.openai.com/apps-sdk/reference/) defines
a vendor `_meta` key, `_meta["openai/fileParams"]`, that serves the same
declarative purpose: it is a list of top-level input-schema field names that
ChatGPT should populate from user-uploaded files. That design validates the
core premise of this SEP: a lightweight annotation naming the file arguments
is sufficient for clients to render the right affordance.

This SEP diverges from `openai/fileParams` in two deliberate ways:

- **Inline keyword, not a name list.** `openai/fileParams` is a flat
  `string[]` outside the schema. This SEP places the annotation directly on
  the schema property so that per-argument constraints (`accept`, `maxSize`)
  travel with the declaration, and so that the schema is self-describing.
- **No hosted-file indirection.** OpenAI's file params are object-typed
  (`{ download_url, file_id, name, mime_type, size }`) because ChatGPT uploads
  files to OpenAI-managed storage first and passes a reference. This SEP
  instead defaults to passing the bytes inline as a data URI, avoiding the
  need for either party to operate an upload endpoint, while permitting URL
  references when they are available.

Standardizing this pattern at the protocol level, rather than leaving it to
vendor `_meta` keys, lets any MCP client implement the file-picker affordance
against any server, not only pairings where both sides happen to agree on the
same vendor convention.

### Relationship to other file-handling work

This SEP is complementary to URL-mode elicitation. The two address different
interaction patterns:

- **This SEP (push):** The client knows at tool-listing time which arguments
  are files, gathers them up front, and sends them with the call. Suited to
  tools where "which file" is part of the user's initial intent.
- **URL-mode elicitation (pull, out-of-band):** The server decides during
  execution that it needs a file and directs the user to an upload endpoint.
  Suited to conditional or multi-step flows, and the natural choice when the
  payload is too large to embed inline and no other scheme is available.

A client may reasonably support both. A server may use `mcpFile` for its
simple tools and fall back to URL-mode elicitation for the heavy ones.

## Backward Compatibility

This SEP is backward compatible at the schema level:

- `mcpFile` is a JSON Schema extension keyword. Per §6.5 of the JSON Schema
  core specification, implementations that do not recognize it SHOULD treat it
  as an annotation and otherwise ignore it. Clients that do not recognize the
  keyword see an ordinary `uri`-format string field.
- `ArraySchema` is a new union member of `PrimitiveSchemaDefinition`. Existing
  schemas using the other four members are unaffected. Some shipped client
  SDKs implement `PrimitiveSchemaDefinition` as a closed union and will reject
  the entire `elicitation/create` request when they encounter `type: "array"`.
  The `elicitation.arrays` client capability lets servers detect support
  before emitting the new member.

Servers **MUST** accept any well-formed URI value for a `uri`-format argument
regardless of whether the client recognized `mcpFile` or how the value was
produced. The keyword governs _presentation_, not _acceptance_.

A required `mcpFile` argument on a non-recognizing client renders as a bare
URI text input that the user cannot reasonably fill. Servers **SHOULD NOT**
mark `mcpFile` arguments `required` unless the tool is useless without them,
and **SHOULD** accept `https://` so a model-supplied URL remains a viable path
when no picker is available.

## Implementation Notes

JSON Schema validators in strict mode reject schemas containing unknown
keywords at compile time rather than silently ignoring them as §6.5 prefers.
Ajv v7 and later default to strict mode and will throw
`unknown keyword: "mcpFile"` when compiling a tool's `inputSchema`. Hosts that
compile `inputSchema` or `requestedSchema` with such a validator **MUST**
either register the keyword (e.g.,
`ajv.addKeyword({keyword: "mcpFile", schemaType: "object"})`) or disable
strict-schema mode for these schemas. Official MCP SDKs **MUST** pre-register
the keyword in any validator they ship.

## Security Implications

The threat model for file inputs has two distinct defenders. The **host**
protects the user from a malicious or compromised server (and from a model
under that server's influence via prompt injection). The **server** protects
itself and its operating environment from a malicious or compromised client.
The requirements below are grouped by defender; neither set substitutes for
the other.

### Host-side file access (protecting the user from the server)

The host is the user's trust boundary. Servers are untrusted by default; tool
descriptions and prior tool results may contain prompt-injection payloads that
influence the model. The host is the only party that knows whether a given
file path was selected by the user or authored by the model.

- Hosts **MUST NOT** read a local file and encode it into a `data:` URI unless
  the user explicitly selected that file for this tool invocation via a picker
  or equivalent consent gesture.
- Hosts **MUST NOT** auto-dereference a `file://` URI or filesystem path that
  originated from the model layer. If the model supplies a path-like value in
  an `mcpFile` slot, the host **MUST** either present it to the user for
  explicit confirmation (showing the resolved path and the destination server)
  or reject the call.
- Hosts **SHOULD** display, before transmission, which file is being sent and
  to which server, with the same prominence as other destructive-tool
  confirmations.
- Hosts **MAY** maintain a per-server allow-list of directories the user has
  previously granted, analogous to per-origin grants in the browser File
  System Access API, but **MUST NOT** grant blanket filesystem access to any
  server by default.

### File content is untrusted input

Servers **MUST** treat file content as untrusted, exactly as they would any
other client-supplied data. This applies equally to inline data URIs and to
content fetched from `http(s)://` or read from `file://` URIs.

### MIME type is advisory

The `<mediatype>` in a data URI, the `Content-Type` header on a fetched URL,
and any extension-based type inference are all set by parties other than the
server and may not reflect the actual byte content. Servers that dispatch on
file type **SHOULD** verify the type against the content (magic bytes) and
**SHOULD** reject on mismatch rather than silently re-typing, to avoid
polyglot-file routing attacks.

Servers that accept compressed or container formats **MUST** enforce
decompression-ratio and output-size limits to mitigate archive bombs. Servers
that accept XML-based formats (including SVG and Office Open XML) **MUST**
disable external-entity resolution. Servers **SHOULD** sandbox file processing
where feasible.

### Resource exhaustion

Because files may arrive inline, a malicious or buggy client can attempt to
exhaust server memory with oversized payloads. Servers **SHOULD** enforce
`maxSize` early (ideally during JSON parsing or immediately after, before
fully materializing the decoded bytes) and **SHOULD** apply a sensible global
ceiling even for arguments where `maxSize` is omitted.

### Local file inclusion (protecting the server from the client)

These requirements protect the server and its operating environment. They do
not protect the user from a malicious server; see
[Host-side file access](#host-side-file-access-protecting-the-user-from-the-server)
above. The wire format carries no provenance, so servers **MUST NOT** assume
that a `file://` value was user-selected rather than model-authored.

Servers that accept `file://` URIs:

- **MUST** canonicalize the path (resolving `..` segments and symlinks via a
  `realpath`-equivalent) before applying any access check.
- **MUST** restrict reads to an operator-configured allow-list of directories
  and reject any path that falls outside it after canonicalization.
- **SHOULD** reject `file://` on non-stdio transports with
  `file_scheme_unsupported`, since the assumption of a shared filesystem is
  not verifiable from the wire.

Servers not prepared to implement the above **MUST** reject `file://` outright
with `file_scheme_unsupported`.

Servers using the [Roots][roots] capability **SHOULD** cross-check `file://`
paths against the client's declared roots, noting that roots are guidance and
not a hard access-control list.

Unlike [`Icon.src`][icons-security], where consumers are required to reject
`file:` because the consumer is a UI renderer, `mcpFile` values are consumed
by server tool logic that may legitimately share a filesystem with a stdio
client. `file://` is therefore permitted here subject to the controls above.

[roots]: ../docs/specification/draft/client/roots.mdx
[icons-security]: ../docs/specification/draft/basic/index.mdx

### Server-side request forgery

Servers that fetch `http(s)://` URIs supplied by clients **MUST** treat those
URIs as untrusted and apply the following safeguards. Servers not prepared to
implement them **MUST** reject `http(s)://` schemes with
`file_scheme_unsupported`.

- Servers **MUST NOT** send credentials (cookies, `Authorization` headers, or
  ambient cloud-SDK identity such as EC2 instance profiles, GKE workload
  identity, or Application Default Credentials) when fetching client-supplied
  URLs.
- Servers **MUST** resolve the hostname once, validate the resolved IP against
  the deny-list below, and pass the validated IP literal directly to the
  socket connect call (setting `Host` and SNI to the original hostname).
  Implementations **MUST NOT** re-resolve the hostname between validation and
  connection.
- The deny-list **MUST** include, after canonicalizing the address
  representation (decimal, octal, and IPv6-mapped-IPv4 forms): loopback
  (`127.0.0.0/8`, `::1`), link-local (`169.254.0.0/16`, `fe80::/10`, which
  covers AWS, GCP, and Azure instance-metadata endpoints), private ranges
  (RFC 1918), and unique-local (`fc00::/7`).
- Servers **MUST NOT** follow redirects that change origin.
- Servers **SHOULD** prefer allow-lists when the tool's expected source
  domains are bounded.
- Servers **SHOULD** impose timeouts and size limits on the fetch.

See the [OWASP SSRF Prevention Cheat Sheet][owasp-ssrf] for further guidance.

[owasp-ssrf]: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html

### `accept` is a UX filter, not a security boundary

The `accept` list constrains the client's file picker, but a client is free to
send any MIME type it likes. Servers **MUST** validate the received type if it
matters for correctness or safety, and **MUST NOT** assume `accept` was
enforced.

## Future Work

### MCP JSON Schema vocabulary

`mcpFile` is the first MCP-defined JSON Schema extension keyword. MCP
extension keywords use the `mcp` name prefix; servers and clients **MUST NOT**
define their own `mcp`-prefixed keywords. A formal `$vocabulary` URI
(`https://modelcontextprotocol.io/json-schema/vocab/draft`) will be registered
in the dialect declared by SEP-1613 so that future keywords have a common
home and validators can be configured once for all of them.

### Reserved extensions to `FileInputDescriptor`

The descriptor may grow the following fields in future SEPs; their semantics
are not specified here:

- `directory?: boolean` for directory selection, analogous to HTML
  `webkitdirectory`.
- `schemes?: string[]` for machine-readable per-field declaration of accepted
  URI schemes, replacing the current advice to document scheme restrictions in
  the tool description.

### Generalized `ArraySchema` items

`ArraySchema.items` is restricted to `StringSchema` in this SEP. A follow-on
SEP may widen it to other primitive types together with a corresponding
widening of `ElicitResult.content`, which currently cannot carry `number[]` or
`boolean[]` values.

## Reference Implementation

TBD. A reference implementation will demonstrate:

- TypeScript SDK: `FileInputDescriptor` type exported for use in tool
  definitions, and a client-side helper that reads a `File`/`Blob` and
  produces a conforming data URI string.
- A sample server exposing an image-processing tool with `mcpFile`, validating
  `maxSize` and `accept` on receipt.
- A sample client rendering a native file picker for annotated arguments.
