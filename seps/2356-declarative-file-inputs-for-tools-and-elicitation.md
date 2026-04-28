# SEP-2356: Declarative File Inputs for Tools and Elicitation

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-03-04
- **Author(s)**: Olivier Chafik (@ochafik)
- **Sponsor**: Den Delimarsky (@localden)
- **PR**: [#2356](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2356)

## Abstract

This SEP introduces `x-mcp-file`, a JSON Schema extension keyword that marks a
`uri`-format string property as a file input. The keyword carries an optional
media-type filter and size limit. Clients that recognize the keyword render a
native file picker for the annotated property and populate it with an RFC 2397
data URI. Servers receive an ordinary string; the annotation affects
client-side presentation only.

This SEP is deliberately the minimum viable change. It composes from existing
primitives (JSON Schema annotations, RFC 2397 data URIs, URL-mode elicitation
for large files) and adds the smallest descriptor that lets a host know which
fields need a file picker. It does not introduce upload protocols, scheme
negotiation, multi-file forms, or new capability flags. Those can be layered
on later without contradicting anything specified here.

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

These workarounds are deployed today. One server author [on this SEP's
discussion thread][gumbees-comment] describes their production instance of
pattern 3: the tool description instructs the model to `curl` the file to a
per-request staging URL the server mints, then pass the returned attachment
URL as the tool argument. It works, but every server reinvents the staging
endpoint and the model has to be coached through it in prose.

[gumbees-comment]: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2356#issuecomment-4193417740

Meanwhile, the client is the party best positioned to solve this problem. It
already has native UI, knows the user's filesystem, and can trivially show a
file picker. It just doesn't know _which_ arguments should trigger one.

This SEP closes that gap with a single annotation keyword.

## Overview

This section walks through both surfaces end-to-end with the smallest possible
examples. The formal rules follow in **Specification**.

### Tool surface: definition → call

A server declares that the `image` argument is a file by adding the `x-mcp-file`
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
        "x-mcp-file": {
          "accept": ["image/png", "image/jpeg"],
          "maxSize": 5242880
        }
      }
    },
    "required": ["image"]
  }
}
```

A client that recognizes `x-mcp-file` renders a file picker filtered to PNG/JPEG,
encodes the user's selection as a data URI, and invokes the tool:

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

The server asks the user for a file mid-flow. The same `x-mcp-file` keyword
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
          "x-mcp-file": {
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
file, and the client responds with the file encoded as a data URI in the same
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

### MCP JSON Schema vocabulary

`x-mcp-file` follows the `x-mcp-*` extension keyword convention established by
[SEP-2243][sep-2243], which introduced [`x-mcp-header`][x-mcp-header] for the
same placement (a property inside a tool's `inputSchema`). MCP-defined JSON
Schema extension keywords use the `x-mcp-` name prefix. Servers and clients
**MUST NOT** define their own `x-mcp-`-prefixed keywords; each new keyword in
this family requires its own SEP. The keyword belongs to the vocabulary
`https://modelcontextprotocol.io/json-schema/vocab/draft`, which is part of
the dialect declared by [SEP-1613][sep-1613]. Implementations that do not
recognize a keyword in this vocabulary **SHOULD** treat it as an annotation
per [§6.5 of the JSON Schema core specification][json-schema-6.5].

[sep-2243]: ./2243-http-standardization.md
[x-mcp-header]: ../docs/specification/draft/server/tools.mdx#x-mcp-header
[sep-1613]: ./1613-establish-json-schema-2020-12-as-default-dialect-f.md
[json-schema-6.5]: https://json-schema.org/draft/2020-12/json-schema-core#section-6.5

### The `x-mcp-file` extension keyword

`x-mcp-file` is valid only on a schema of the form
`{"type": "string", "format": "uri"}`. Its value is an object:

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
   * Maximum decoded file size in bytes that the server will accept inline as
   * a data URI. Servers MUST reject larger payloads. If omitted, the server
   * accepts any size it is willing to buffer; clients SHOULD warn above an
   * implementation-defined threshold.
   */
  maxSize?: number;
}
```

Clients that encounter `x-mcp-file` on a schema that does not match the permitted
shape **SHOULD** ignore the keyword and render the field as an ordinary input.
For example, the keyword below is misplaced (the property is not
`format: "uri"`) and a client treats `notes` as a plain string field:

```json
{
  "notes": {
    "type": "string",
    "x-mcp-file": { "accept": ["text/plain"] }
  }
}
```

The standard `required` array governs whether the file argument is mandatory,
as with any other property.

The `format: "uri"` precondition is a recognition marker. Clients and servers
**SHOULD NOT** enable `format: "uri"` as a JSON Schema validation assertion on
`x-mcp-file` fields; the value is constrained by [Wire encoding](#wire-encoding)
below, and asserting it would run large data URIs through a regex on every
call.

For elicitation forms, `StringSchema` gains an optional `x-mcp-file` field with
the same semantics.

### Wire encoding

Clients **MUST** populate an `x-mcp-file`-annotated argument with an
[RFC 2397][rfc2397] data URI:

```
data:[<mediatype>][;base64],<data>
```

[rfc2397]: https://www.rfc-editor.org/rfc/rfc2397

Where `<mediatype>` is the MIME type of the file as reported by the client's
platform (e.g., `image/png`). If the platform does not report a type, the
client **MUST** use `application/octet-stream`. Clients **SHOULD** use the
`;base64` form for binary content; the percent-encoded form is permitted and
may be preferable for short textual payloads.

Example values (both well-formed; the first is a complete 1×1 PNG):

```
data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNkYGBgAAAABQABWaDDsAAAAABJRU5ErkJggg==
data:text/plain,hello%20world
```

Servers **MUST** accept well-formed `data:` URIs in `x-mcp-file`-annotated
arguments in either encoding. Servers **MUST** reject any other scheme and
**MUST NOT** dereference it.

If a server needs the original filename, it **SHOULD** declare a separate
ordinary string argument for it; the description on that argument is
sufficient for hosts to know what to populate.

### Host integration on the tool surface

Tools are model-controlled; the model populates `arguments`. For an
`x-mcp-file` argument on the tool surface, the typical flow is that the model
leaves the argument absent and the host fills it from a user gesture:

1. The model emits a `tools/call` with the `x-mcp-file` argument absent.
2. The host detects the unfilled slot at the human-in-the-loop confirmation
   step it already presents for tool calls.
3. The host renders a file picker, encodes the user's selection per
   [Wire encoding](#wire-encoding), and substitutes the value before
   dispatching the request to the server.
4. The host **MUST NOT** include the encoded data URI value in model context.
   The bytes do not pass through the model in either direction.

Hosts **MAY** offer a file the user has already attached to the conversation
as a picker default, but **MUST NOT** bind it to a server's `x-mcp-file` slot
without an explicit per-invocation confirmation that displays the destination
server.

Hosts **MAY** instead forward a `data:` URI the model supplied directly in the
slot, subject to the host's existing tool-approval policy. This is appropriate
where the model has code-execution or filesystem access via other tools and
constructs the bytes itself (for example, the output of an image pipeline it
ran). The exfiltration surface in that arrangement is the model's existing
tool access, which this SEP does not change. Hosts that forward a
model-supplied value **MUST NOT** dereference, resolve, or substitute content
for it; the value is forwarded verbatim or discarded. See [Security
Implications](#host-side-file-access-protecting-the-user-from-the-server).

Hosts that recognize `x-mcp-file` but cannot present a picker (CLI without a
TTY, CI pipelines) and are not forwarding a model-supplied value **SHOULD**
prompt for a local path and encode it, or for elicitation respond with
`action: "decline"`. Hosts **SHOULD NOT** prompt the user to type a raw data
URI string.

### Client-side validation

Clients **SHOULD** check the selected file's size against `maxSize` after
selection and before encoding, and present a user-facing error rather than
transmitting a payload that is known to violate the constraint. Clients
**SHOULD NOT** rely on the operating system's picker filter alone to enforce
`accept`; pickers commonly allow the user to override the filter.

### Large files

Inline `data:` URIs are practical for small to medium files. They are not
practical for large ones: a 100 MB file becomes ~133 MB of base64 inside a
single JSON-RPC message that both sides must buffer in full. This SEP does not
introduce an upload protocol for that case. Servers that need files larger
than their declared `maxSize` **SHOULD** obtain them via [URL-mode
elicitation][url-elicit], which already provides an out-of-band browser flow
where the upload protocol is entirely server-controlled. The `x-mcp-file` slot
carries only files that fit inline.

When the client has not declared the `elicitation.url` capability, the server
**MAY** return `URLElicitationRequiredError` (`-32042`) so the host can
surface the upload URL to the operator. This path, including the completion
notification, is specified in [URL Mode Elicitation][url-elicit] and is
unchanged by this SEP.

[url-elicit]: ../docs/specification/draft/client/elicitation.mdx

### Server-side validation

Servers **MUST** validate received file inputs against their declared
constraints regardless of which surface delivered them.

When validating against `accept`, servers **MUST** compare only the
`type/subtype` portion of the data URI's `<mediatype>` segment, ignoring any
parameters, and the comparison **MUST** be case-insensitive. A wildcard entry
such as `image/*` matches any subtype of `image`.

#### Tool calls

Following [SEP-1303][sep-1303], servers **SHOULD** report validation failures
as tool-execution errors (`CallToolResult` with `isError: true`) so that the
model can see the failure and self-correct. The text content **SHOULD**
identify the offending argument and which constraint was violated (size, media
type, scheme, or URI form).

This SEP does not define a structured error shape for these failures. A
machine-readable validation-error vocabulary is a cross-cutting concern not
specific to file inputs and is deferred to [Future Work](#future-work).

[sep-1303]: ./1303-input-validation-errors-as-tool-execution-errors.md

#### Elicitation results

An `ElicitResult` is a JSON-RPC _response_, so the server cannot reject it
with `-32602`. When a file field in `ElicitResult.content` violates a
constraint, the server **SHOULD** do one of the following:

- Issue a fresh `elicitation/create` request whose `message` explains the
  violation, giving the user a chance to retry.
- Fail the operation that initiated the elicitation. For an elicitation nested
  inside a tool call, return a `CallToolResult` with `isError: true` and a
  textual explanation.

Servers **SHOULD** prefer re-eliciting when the violation is user-correctable
and failing the enclosing operation when it is not.

## Rationale

### Design intent: deliberately minimal

Adding to a protocol as widely adopted as MCP is easy; removing from it is
not. This SEP therefore ships the smallest mechanism that solves the stated
problem and leaves obvious extensions (multi-file, alternate schemes, prompt
arguments) to future SEPs that can be motivated by demonstrated need. Each
deferred extension has a known backward-compatible path documented in this
section, so this SEP does not paint the protocol into a corner.

### Why an inline extension keyword rather than a sidecar map?

An earlier draft of this SEP placed file annotations in a separate
`inputFiles` map alongside `inputSchema`, keyed by property name. The inline
design is simpler:

- **No dual-keying.** A sidecar map creates two places that must agree on
  property names. The inline keyword lives directly on the property it
  describes, so mismatch is impossible by construction.
- **Standard JSON Schema mechanism.** §6.5 of the core specification
  explicitly permits extension keywords; using it means generic JSON Schema
  tooling passes the keyword through unchanged.
- **No capability gate.** A sidecar field on `Tool` raises the question of
  whether servers should send it to clients that don't understand it. An
  inline keyword is simply an unknown annotation to such clients, which §6.5
  already says they SHOULD ignore.

The analogy to HTML is instructive: `<input type="file" accept="image/*">`
puts the file hint directly on the element, not in a parallel attribute map.

### Why not `contentEncoding` / `contentMediaType`?

The 2020-12 dialect already provides these for annotating string content.
`contentMediaType` takes a single RFC 2046 media type and cannot express
disjunction or wildcard subtypes; `accept` is the multi-valued analogue, not a
reinvention. Servers **MAY** additionally emit `contentMediaType` on the same
property as a hint for non-MCP JSON Schema tooling.

### Why not reuse `BlobResourceContents` or `EmbeddedResource` as the wire shape?

MCP already carries binary content via these types, but they are members of
the `ContentBlock` union used in server-to-client flows. `CallToolRequest
.arguments` is an open `{[key]: unknown}` shaped by the tool's JSON Schema,
and `ElicitResult.content` is restricted to primitives. Carrying a structured
object would require widening both surfaces, whereas a data URI string fits
the slots that already exist.

### Why the `x-mcp-` prefix?

[SEP-2243][sep-2243] established `x-mcp-header` as a JSON Schema extension
property inside `inputSchema`, and this SEP follows that precedent rather than
introduce a second naming style for the same placement. The `x-` prefix offers
no additional validator tolerance (strict-mode validators reject any unknown
keyword regardless of prefix), and OpenAPI 3.1 dropped the `x-` requirement
for Schema Objects in favor of vocabulary declarations, but consistency within
the MCP dialect outweighs both of those points.

A `_meta` placement was considered and rejected because it separates the
annotation from the property it describes, which is poor locality for JSON
Schema form renderers and reintroduces dual-keying.

### Why `data:` only?

Permitting `file:` and `https:` alongside `data:` was explored. It introduces
scheme negotiation that is MAY-on-both-sides (clients MAY send, servers MAY
accept) without a machine-readable way for either side to learn the other's
choice, which is as good as not specifying it. It also pulls SSRF and
local-file-inclusion threat surface into this SEP that the inline `data:` path
does not have. A future SEP can add scheme support together with a
machine-readable `schemes` declaration once there is demonstrated need; the
`format: "uri"` carrier already admits any scheme, so adding more later is
backward-compatible with this SEP's `data:`-only requirement.

### Why not multi-file in this SEP?

Multi-file requires adding an `ArraySchema` member to
`PrimitiveSchemaDefinition`, which is a closed union in several shipped SDKs;
older clients reject the entire elicitation request rather than ignoring the
unknown member. That widening, its capability flag, and the corresponding
`ElicitResult.content` change are general elicitation concerns, not
file-specific ones, and belong in their own SEP. This SEP's keyword applies
unchanged to an array-of-uri-strings schema once that SEP lands; nothing here
forecloses it. On the tool surface, `Tool.inputSchema` is open JSON Schema, so
servers can already declare an array property whose `items` carry `x-mcp-file`
without protocol changes; only the elicitation form surface is constrained.

### Why not prompts?

`PromptArgument` is intentionally a flat scalar shape rather than JSON Schema,
so the keyword does not reach it. The backward-compatible path is a future SEP
that adds `"x-mcp-file"?: FileInputDescriptor` directly to `PromptArgument`,
with
the same data-URI string carrier; no decision in this SEP forecloses that.
Until then, a prompt that needs a file can describe a tool that accepts one.

### Why not carry the filename in the URI?

An earlier draft added a `name=` parameter to the data URI. RFC 2397 does not
define `name=` semantically. Servers that need the filename declare a separate
string argument, which makes the requirement explicit in the schema and lets
the user see and edit what is being sent.

### Why not a presigned-upload descriptor?

A `FileUploadTarget` descriptor (`{url, method, headers, expiresAt,
reference}`) modelled on S3/GCS/Azure presigned URLs was explored. It only
covers single-shot presigned object storage: the credential-forgery defense
(clients refuse `Authorization` in `headers`) means it cannot reach
authenticated server-owned endpoints; it cannot express resumable protocols or
multipart-chunked uploads; and any server needing those falls through to
URL-mode anyway. URL-mode already exists and keeps the upload protocol
server-side where it belongs.

### Prior art: OpenAI Apps SDK `openai/fileParams`

OpenAI's [Apps SDK](https://developers.openai.com/apps-sdk/reference/) defines
a vendor `_meta` key, `_meta["openai/fileParams"]`, that serves the same
declarative purpose: a list of input-schema field names that ChatGPT should
populate from user-uploaded files. That validates the core premise: a
lightweight annotation naming the file arguments is sufficient for clients to
render the right affordance. This SEP places the annotation inline so
per-argument constraints travel with the declaration, and standardizes the
pattern so any MCP client can implement it against any server rather than only
pairings that agree on a vendor `_meta` key.

### Relationship to other file-handling work

This SEP layers on URL-mode elicitation rather than replacing it:

- **`x-mcp-file` with `data:` (push, inline):** small-to-medium payloads where
  inline transfer is practical.
- **URL-mode elicitation (pull, out-of-band):** large payloads, with the
  upload protocol server-controlled.

A server uses `x-mcp-file` for inputs up to its `maxSize` and URL-mode
elicitation above it.

## Drawbacks

This design accepts the following costs in exchange for its minimal surface:

- **Inline transfer only.** Base64 inflates payload size by roughly a third
  and the entire encoded value travels in one JSON-RPC message that both
  peers buffer in full. There is no chunking or resumption. Files above the
  low-megabyte range are pushed to URL-mode elicitation
  ([§Large files](#large-files)), which means the simple path stops being
  the available path well before most users would consider a file "large."
- **Validator registration burden.** Because `x-mcp-file` is an extension
  keyword, every SDK that bundles a JSON Schema validator must pre-register
  it, and non-SDK hosts running a strict-mode validator must do the same
  ([§Implementation Notes](#implementation-notes)). This is a small but
  perpetual maintenance cost across the SDK matrix and a foot-gun for hosts
  that compile `inputSchema` directly.
- **Degraded UX on non-recognizing clients.** With no capability gate, a
  server cannot tell whether the client will render a picker. A `required`
  `x-mcp-file` argument on an older client surfaces as a bare URI text box the
  user cannot reasonably fill
  ([§Backward Compatibility](#backward-compatibility)). The mitigation is
  guidance (servers SHOULD NOT mark these required) rather than mechanism.

## Backward Compatibility

This SEP is fully backward compatible. `x-mcp-file` is a JSON Schema extension
keyword; per §6.5 implementations that do not recognize it SHOULD treat it as
an annotation and otherwise ignore it. Clients that do not recognize the
keyword see an ordinary `uri`-format string field. `StringSchema` gaining an
optional field is additive.

Servers **MUST** accept well-formed `data:` URIs for an `x-mcp-file`-annotated
argument regardless of whether the client recognized the keyword. The keyword
governs presentation, not acceptance.

A required `x-mcp-file` argument on a non-recognizing client renders as a bare
URI text input that the user cannot reasonably fill. Servers **SHOULD NOT**
mark `x-mcp-file` arguments `required` unless the tool is useless without them.

## Implementation Notes

JSON Schema validators in strict mode reject schemas containing unknown
keywords at compile time rather than silently ignoring them as §6.5 prefers.
Ajv v7 and later default to strict mode and will throw
`unknown keyword: "x-mcp-file"` when compiling a tool's `inputSchema`. Hosts
that compile `inputSchema` or `requestedSchema` with such a validator **MUST**
either register the keyword (e.g.,
`ajv.addKeyword({keyword: "x-mcp-file", schemaType: "object"})`) or disable
strict-schema mode for these schemas. Official MCP SDKs **MUST** pre-register
the keyword in any validator they ship.

## Security Implications

These requirements assume the host is trustworthy software acting on the
user's behalf; host integrity is a prerequisite outside this document's scope.

### Host-side file access (protecting the user from the server)

The host is the user's trust boundary. Servers are untrusted by default; tool
descriptions and prior tool results may contain prompt-injection payloads that
influence the model (see [OWASP LLM Top 10 2025][owasp-llm], LLM01 and LLM06).
The host is the only party that knows whether a given value was selected by
the user or authored by the model.

- Hosts **MUST NOT** read a local file and encode it into a `data:` URI unless
  the user explicitly selected that file via a picker or equivalent consent
  gesture for a single (server, tool, request) tuple, and **MUST NOT** pass
  any model-supplied value to a path-resolution API. Hosts **MUST** discard
  the encoded value after dispatch and **MUST NOT** include it in model
  context.
- Hosts **MUST** display, before transmitting a host-populated value, the file
  identity (derived by the host from the picker selection) and the destination
  server.
- A `data:` URI the model supplied directly is model-authored. Hosts **MAY**
  forward it verbatim under their existing tool-approval policy as described
  in [Host integration](#host-integration-on-the-tool-surface), but **MUST
  NOT** dereference it or substitute other content for it. Hosts that forward
  a model-supplied value **SHOULD** display the decoded size and media type at
  the approval step so the user has a signal beyond a truncated string.

### File content reaching the model

File content is untrusted with respect to the model as well as the server.
Hosts **MUST NOT** include the encoded `data:` URI value in model context.
Servers returning text derived from `x-mcp-file` input in `CallToolResult`
**SHOULD** delimit it as untrusted data, and hosts **MUST** present such
results to the model as data, not instructions ([OWASP LLM Top 10
2025][owasp-llm], LLM01).

### Server-side handling

Because this SEP specifies `data:` as the only wire scheme, servers do not
fetch URLs or read filesystem paths on the basis of an `x-mcp-file` value, and
the SSRF and local-file-inclusion classes do not arise from this mechanism.
Servers are still decoding untrusted bytes and **MUST** satisfy the applicable
requirements of [OWASP ASVS 5.0 §V5 (File Handling)][asvs-v5] for the formats
they accept. The OWASP cheat sheets for [File Upload][cs-upload] and [XXE
Prevention][cs-xxe] provide implementation guidance.

The wire format carries no provenance: servers **MUST NOT** assume any
received value was user-selected rather than model-authored. The `accept` list
is a UX filter; servers **MUST NOT** assume it was enforced. The
`<mediatype>` segment of a `data:` URI is advisory; servers **MUST NOT**
dispatch on it without validating the content.

### Logging and telemetry

`data:` URI values in `x-mcp-file` arguments contain user file bytes and **MUST**
be treated as sensitive. Hosts, servers, and SDKs **MUST** redact them (e.g.,
to `data:<type>;base64,[<n> bytes]`) in transport logs, debug output, tracing
spans, and error reports.

[owasp-llm]: https://genai.owasp.org/llm-top-10/
[asvs-v5]: https://github.com/OWASP/ASVS/blob/v5.0.0/5.0/en/0x14-V5-File-Handling.md
[cs-upload]: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
[cs-xxe]: https://cheatsheetseries.owasp.org/cheatsheets/XML_External_Entity_Prevention_Cheat_Sheet.html

## Unresolved Questions

These do not block Draft and are recorded so reviewers can track them rather
than re-derive them:

- Whether the vocabulary URI
  `https://modelcontextprotocol.io/json-schema/vocab/draft` is intended to
  resolve to a machine-readable vocabulary document or is a URN-style
  identifier only. SDK validators that fetch `$vocabulary` entries behave
  differently depending on the answer.
- Whether SDKs should pre-register the `x-mcp-file` keyword in their bundled
  validators one protocol version before the keyword appears in the spec, to
  narrow the strict-validator skew window described in
  [Implementation Notes](#implementation-notes).

## Future Work

Each item below has a backward-compatible path documented in
[Rationale](#rationale) and requires no change to what this SEP specifies.

- **Multi-file inputs.** Via a general elicitation `ArraySchema` SEP; the
  keyword applies unchanged to array items once that lands.
- **Additional wire schemes.** Via a `schemes` declaration on the descriptor;
  the `format: "uri"` carrier already admits any scheme.
- **`PromptArgument` support.** Via an additive `"x-mcp-file"` field on
  `PromptArgument` with the same data-URI carrier.
- **Out-of-band transfer and file outputs.** [SEP-2631][sep-2631] proposes
  capability-negotiated upload/download methods that layer on this SEP's
  `data:` baseline. Reconciliation is routed through the [File Uploads Working
  Group][file-uploads-wg].
- **Pull-based composition via Resources.** Exposing user-attached files as
  client Resources and having the server pull via `resources/read` was raised
  in [review][keremnalbant-comment]; it keeps large payloads out of tool-call
  JSON entirely and is complementary rather than an alternative.
- **Structured validation-error vocabulary.** A machine-readable error shape
  for `isError: true` results is a cross-cutting concern and belongs in its
  own SEP so that file inputs are one case rather than the precedent.

[sep-2631]: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2631
[file-uploads-wg]: ../docs/community/file-uploads/charter.mdx
[keremnalbant-comment]: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2356#issuecomment-4298675411

## Reference Implementation

A reference implementation in the TypeScript SDK is required before this SEP
advances past Draft. It will demonstrate:

- `FileInputDescriptor` exported for use in tool definitions, with the keyword
  pre-registered in the SDK's bundled validator.
- A client-side `encodeFileAsDataUri(file: File | Blob): string` helper.
- A sample server exposing an image-processing tool with `x-mcp-file`, validating
  `maxSize` and `accept` on receipt.
- A sample host demonstrating the §Host integration flow end to end: model
  emits the call with the slot absent, host renders a picker, substitutes the
  encoded value, and keeps it out of model context.
