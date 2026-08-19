# SEP-0000: Negotiated tool result variants

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-08-18
- **Author(s)**: Kyle Rubenok (@krubenok)
- **Sponsor**: None (seeking sponsor)
- **PR**: TBD
- **Target revision**: 2026-12-01
- **Related**: [SEP-2200](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2200)

> This file uses SEP-0000 while the proposal is developed locally. The file and heading should be renamed to the pull request number when submitted.

## Abstract

This SEP adds negotiated, audience-directed variants to tool results. A tool declares the result representations it can produce. A client selects the representations needed for a particular `tools/call` request. The server returns exactly those representations, and the host routes each one according to its declared audience.

The core protocol defines a small set of audience and format combinations based on current MCP usage: content or structured data for an assistant, content or structured data presented to a user without automatic model inclusion, and structured data for programmatic processing. MCP extensions may define additional audiences under their extension identifiers. For example, the MCP Apps extension can define `io.modelcontextprotocol/ui` for data delivered to an App View.

Each audience has an independent result contract. Structured results for an assistant, a programmatic consumer, and an App View may use different schemas and contain different information. They describe the same tool execution and must not contradict one another, but they are not required to be serialized copies or lossless projections of one another.

This replaces the ambiguous relationship between `CallToolResult.content` and `CallToolResult.structuredContent` with request-time selection and explicit routing. It retains a versioned compatibility path for clients and servers using the 2026-07-28 result shape.

## Motivation

The 2026-07-28 protocol defines two sibling tool result fields:

- `content`, a required array of content blocks
- `structuredContent`, an optional JSON value validated by `Tool.outputSchema`

The specification also recommends serializing `structuredContent` into a `TextContent` block for backwards compatibility. Implementations disagree about the meaning of these fields and which one to use. Some clients send only `content` to the model. Some replace `content` with `structuredContent`. Some send both. Others retain structured data only for application code.

This disagreement has visible costs. [A survey of 18 open source clients](https://gist.github.com/olaservo/3bb819673c444e4fe282c3af44a1ae01) found that six would show the model an empty or placeholder result if a server stopped mirroring structured data into `content`. Ten of the clients either discard the mirror or send both copies into model context. SDKs also expose different defaults for producing the mirror.

[SEP-2200](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2200) tried to reduce the ambiguity by defining `content` as model-oriented and `structuredContent` as machine-oriented. Core maintainer feedback identified that approach as incomplete and deferred it in favor of fixing the underlying result shape. Changing guidance for two fields that are always returned together would still leave servers and clients to infer which behavior the other side expects. The requested direction was a polymorphic result selected by the client.

Several established scenarios now require more than a choice between text and JSON:

- Conversational clients need concise natural language or multimodal content for model context.
- Some clients intentionally provide structured JSON to the model.
- Code-mode clients and orchestration layers need typed data for programmatic processing outside model context.
- Hosts may render media or structured data for the user without adding that output to model context.
- MCP Apps need structured data and private View metadata that can differ from both the model representation and a code-mode representation.

The current fields encode format but not destination. Treating all structured data as a single host-facing value does not solve the problem. The host contains several possible consumers, and those consumers may require different schemas, redaction, and presentation.

## Goals

This SEP has the following goals:

- Make result selection deterministic when a conforming client does not make an explicit selection.
- Ensure the host always routes each received output to the consumer identified by its `audience` field, rather than inferring the destination from the output format or content.
- Let a tool provide natural language, structured model input, programmatic data, user-visible media or structured data, and extension data without treating them as equivalent copies, duplicating model context, or sending redundant payloads over the wire.
- Define only the core variants backed by current common scenarios.
- Let negotiated MCP extensions add audiences for specialized consumers without expanding the core vocabulary for each one.
- Provide a migration path for the 2026-07-28 result shape and existing SDK behavior.

This SEP does not attempt to define every future result format or presentation target.

## Terminology

A **result variant** is one representation of a completed tool execution. It has an audience, a format, and a payload.

An **audience** names the consumer for which a result variant was produced. Audience is a routing contract, not a statement about which protocol process receives the bytes. The MCP client receives the complete response and routes each variant to its intended consumer.

A **format** describes the payload encoding defined by the core protocol. This SEP defines `content` and `structured`.

The **programmatic** audience identifies structured output for client-controlled program logic outside automatic model or user presentation. It covers code mode, orchestration, middleware, and typed integrations without naming a specific component inside the host.

An **extension audience** is a non-core audience defined by an MCP extension. The extension defines its identifier, permitted formats, routing, and handling rules.

The **fallback output** is the `assistant/content` variant returned when the client does not make an explicit output selection.

## Specification

The key words MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT, RECOMMENDED, MAY, and OPTIONAL in this document are to be interpreted as described in BCP 14 when, and only when, they appear in all capitals.

### Result audience

The core protocol defines these audiences:

| Audience       | Meaning                                                                 |
| -------------- | ----------------------------------------------------------------------- |
| `assistant`    | The host may provide the output to the model as tool result context.    |
| `user`         | The host may render the output to the user without automatic model use. |
| `programmatic` | Client-controlled program logic consumes the output.                    |

The core `audience` field MUST be one of these values or the identifier of an MCP extension that the client and server negotiated for the current request.

The existing `Annotations.audience` field remains a hint attached to individual content blocks. `ToolResultOutput.audience` is a normative routing instruction for the whole output. Clients MUST NOT infer the output audience by inspecting block annotations. If a block annotation conflicts with its containing output, the output-level audience controls routing.

### Result format

The core protocol defines two formats:

- `content` contains a `ContentBlock[]` value.
- `structured` contains a JSON value. If the variant declaration has a schema, the value MUST conform to that schema unless the tool result has `isError: true`.

The core protocol permits these combinations:

| Audience       | `content` | `structured` | Scenario                                   |
| -------------- | --------- | ------------ | ------------------------------------------ |
| `assistant`    | Yes       | Yes          | Conversational or structured model context |
| `user`         | Yes       | Yes          | Host-native presentation                   |
| `programmatic` | No        | Yes          | Code mode and programmatic orchestration   |

Other combinations require an MCP extension. This keeps the core set tied to current scenarios without preventing future formats or consumers.

A `user/structured` schema describes the data shape, not its visual layout. A client SHOULD request this variant only when it can present the declared schema using host-controlled UI. A server that requires a specific layout, custom interaction, or server-provided rendering logic should use an extension audience such as `io.modelcontextprotocol/ui`.

### Schema types

The following TypeScript is illustrative. The protocol schema remains the source of truth.

```typescript
export type CoreToolResultAudience = "assistant" | "user" | "programmatic";

/**
 * A core audience or a negotiated MCP extension identifier.
 */
export type ToolResultAudience = CoreToolResultAudience | string;

export type ToolResultFormat = "content" | "structured";

export interface ToolResultOutputSelector {
  audience: ToolResultAudience;
  format: ToolResultFormat;
}

export interface ContentToolResultVariant extends ToolResultOutputSelector {
  format: "content";
}

export interface StructuredToolResultVariant extends ToolResultOutputSelector {
  format: "structured";
  schema?: { $schema?: string; [key: string]: unknown };
}

export type ToolResultVariant =
  | ContentToolResultVariant
  | StructuredToolResultVariant;

export interface ContentToolResultOutput extends ToolResultOutputSelector {
  format: "content";
  content: ContentBlock[];
}

export interface StructuredToolResultOutput extends ToolResultOutputSelector {
  format: "structured";
  structuredContent: unknown;
}

export type ToolResultOutput =
  | ContentToolResultOutput
  | StructuredToolResultOutput;
```

Although `ToolResultAudience` is represented as a string for extension compatibility, arbitrary server-defined audience names are not valid. A non-core audience MUST be defined by an MCP extension, and its identifier MUST follow the extension's namespacing rules.

### Tool declaration

`Tool` gains an `outputVariants` field:

```typescript
export interface Tool extends BaseMetadata, Icons {
  name: string;
  description?: string;
  inputSchema: { $schema?: string; type: "object"; [key: string]: unknown };
  outputVariants: ToolResultVariant[];
  annotations?: ToolAnnotations;
  _meta?: MetaObject;
}
```

The following rules apply:

- A tool MUST NOT declare the same audience and format pair more than once.
- Every tool MUST declare an `assistant/content` variant.
- The `assistant/content` variant MUST provide a usable model representation of the successful tool result. It MUST NOT be only a placeholder that directs the model to an output it cannot receive.
- A tool MAY declare additional variants, including `assistant/structured` when it can provide suitable structured data.
- Each variant SHOULD be tailored to its declared audience and format rather than mechanically encoding another variant.
- A `structured` variant SHOULD declare a JSON Schema for its payload. It MAY omit the schema when the payload is intentionally unconstrained or a negotiated extension defines the contract elsewhere.
- A server MUST NOT include an extension audience in `outputVariants` unless both the client and server advertised support for the defining extension and satisfied any audience-specific negotiation rules defined by that extension.
- The former top-level `outputSchema` maps only to the legacy `structuredContent` field. It does not define the schema for every structured variant.
- A client MAY decline to request a structured variant that does not declare a schema.

The per-variant schema is necessary because structured outputs for different audiences are independent contracts. A tool may use the same schema for several audiences, but schema equality MUST NOT be inferred from their shared format.

### Request-time selection

`CallToolRequestParams` gains an optional `requestedOutputs` field:

```typescript
export interface CallToolRequestParams extends InputResponseRequestParams {
  name: string;
  arguments?: { [key: string]: unknown };
  requestedOutputs?: ToolResultOutputSelector[];
}
```

For a request using protocol version `2026-12-01` or later, a client SHOULD send `requestedOutputs` when it requires an output other than, or in addition to, the `assistant/content` fallback. It MAY omit `requestedOutputs` to accept the fallback.

A client MUST NOT send `requestedOutputs` on a request using an earlier protocol version.

The client MUST select only variants advertised by the tool. It MUST NOT request an extension audience unless both client and server advertised support for the defining extension and completed any audience-specific negotiation it requires.

The client MUST NOT include the same selector more than once in `requestedOutputs`.

`requestedOutputs` is protocol control data selected by the client or host. It is not part of the tool's model-generated arguments. A client SHOULD choose it from the active execution mode, available consumers, local policy, and negotiated extensions. When a client presents an output schema to a model for code generation or result planning, it SHOULD present the schema for the variant it will request rather than every schema advertised by the tool.

If `requestedOutputs` is absent, the server MUST return `assistant/content`. This fixed fallback preserves the current required `content` result while allowing clients with a specific execution mode to make an explicit selection.

The client MAY request more than one variant. Multiple variants are intended for calls with more than one active consumer. An Apps-capable conversational host, for example, can request one output for the assistant and one for the App View. Servers do not return multiple formats merely because they are available.

If the client requests an undeclared or unnegotiated variant, the server MUST reject the request as invalid parameters. It MUST NOT silently substitute another variant.

### Tool call result

For tools that declare `outputVariants`, `CallToolResult` contains an `outputs` array:

```typescript
export interface CallToolResult extends Result {
  outputs: ToolResultOutput[];
  isError?: boolean;
}
```

For a successful call, the server:

- MUST return exactly one output for every requested selector
- MUST NOT return an output that the client did not request
- MUST use the audience and format from the matching selector
- MUST validate each structured output against the schema for that variant
- MUST NOT mirror a structured output into a content output unless the client requested both

The order of `outputs` has no semantic meaning.

The server may compute one internal result and project it into several outputs. The wire protocol does not require outputs to originate from the same in-memory value.

### Routing requirements

After receiving a valid result, the client or host routes each output as follows:

- `assistant` outputs are eligible for model context. The host MAY transform them to match the model provider's tool-result format.
- `user` outputs are eligible for user presentation. A `user/content` output provides typed content blocks for the host to render. A `user/structured` output provides structured data for host-controlled presentation, such as a table, property view, or JSON inspector. The host MUST NOT automatically add either format to model context.
- `programmatic` outputs are returned to client-controlled program logic. The host MUST NOT automatically add them to model context or render them to the user.
- Extension outputs follow the routing rules defined by the negotiated extension.

Routing an output to an additional audience is a local host action and is outside the server's contract. Hosts SHOULD require an explicit product policy or user action before doing so. They MUST NOT treat one audience as a fallback for another merely because the formats match.

### Relationship between outputs

Outputs from one `tools/call` response describe the same tool execution. They MUST NOT contradict one another about the externally observable outcome of that execution.

Servers SHOULD tailor each output to its audience and format. Outputs may express the same result differently, such as concise prose for a model, typed records for programmatic use, or presentation data for an App View.

Outputs for different audiences are not otherwise required to be equivalent. In particular:

- One output may contain fields omitted from another.
- One output may summarize another.
- Structured outputs for different audiences may have different schemas.
- A content output does not need to serialize any structured output.
- A server may apply audience-specific redaction or aggregation.

This distinction is intentional. A code-mode client may need stable identifiers, pagination state, and provenance. An App View may need chart series and display state. A model may need a concise answer and a small set of citations. Requiring these to be the same JSON value recreates the problem this SEP is intended to solve.

### Result metadata

`CallToolResult` continues to inherit a single `_meta` field from `Result`. A server MAY vary its contents based on `requestedOutputs`, as it may for any other result field.

Result-level `_meta` is not an output and has no implicit audience. A client MUST NOT forward it to the model, user, programmatic caller, or an extension consumer unless the core protocol or a negotiated extension defines handling for the relevant metadata entry. Data intended as part of an audience's result belongs in that output's `content` or `structuredContent`.

An extension MAY define a namespaced result-level `_meta` entry and explicit rules for handling or forwarding it. This allows the Apps extension, for example, to retain View-only control metadata in `CallToolResult._meta` while the dedicated `io.modelcontextprotocol/ui` output carries the App's result data.

### Errors

When `isError` is `true`, the server SHOULD return outputs matching the requested selectors when it can produce a useful audience-specific error representation.

Structured error outputs are not required to conform to the success schema. An extension MAY define a separate error schema for its audience.

Clients MUST NOT substitute an error output from one audience for another. If the server cannot produce any requested error representation, it SHOULD return a protocol-level error rather than a successful result with an empty `outputs` array.

## Core examples

### Conversational client

A conversational client requests only natural language model context:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "search_customers",
    "arguments": { "query": "Globex" },
    "requestedOutputs": [{ "audience": "assistant", "format": "content" }],
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-12-01",
      "io.modelcontextprotocol/clientCapabilities": {}
    }
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "resultType": "complete",
    "outputs": [
      {
        "audience": "assistant",
        "format": "content",
        "content": [
          {
            "type": "text",
            "text": "I found 37 Globex customer records. The three most recently active accounts are Globex Retail, Globex Energy, and Globex Labs."
          }
        ]
      }
    ]
  }
}
```

### Code-mode client

A code-mode client requests stable machine data without paying for a text mirror:

```json
{
  "name": "search_customers",
  "arguments": { "query": "Globex" },
  "requestedOutputs": [{ "audience": "programmatic", "format": "structured" }]
}
```

```json
{
  "resultType": "complete",
  "outputs": [
    {
      "audience": "programmatic",
      "format": "structured",
      "structuredContent": {
        "items": [
          { "customerId": "cust_1042", "displayName": "Globex Retail" },
          { "customerId": "cust_2088", "displayName": "Globex Energy" }
        ],
        "nextCursor": "eyJvZmZzZXQiOjJ9"
      }
    }
  ]
}
```

### Structured model input

A client that wants JSON in model context requests `assistant` with the `structured` format:

```json
{
  "name": "search_customers",
  "arguments": { "query": "Globex" },
  "requestedOutputs": [{ "audience": "assistant", "format": "structured" }]
}
```

This output has the schema advertised for `assistant/structured`. It need not use the schema or payload returned for `programmatic/structured`.

### User-visible media

An image generation client can request several renderable results without automatic model inclusion:

```json
{
  "name": "generate_images",
  "arguments": { "prompt": "A sunrise over Puget Sound", "count": 2 },
  "requestedOutputs": [{ "audience": "user", "format": "content" }]
}
```

```json
{
  "resultType": "complete",
  "outputs": [
    {
      "audience": "user",
      "format": "content",
      "content": [
        { "type": "image", "data": "...", "mimeType": "image/png" },
        { "type": "image", "data": "...", "mimeType": "image/webp" }
      ]
    }
  ]
}
```

The `content` array may contain any number of supported blocks and may mix text, images, audio, resource links, and embedded resources. Video and other media without a dedicated content block can use a resource link or embedded blob with an appropriate MIME type. The host renders the result but does not tokenize it merely because it came from a tool call.

### Host-native structured presentation

A client with a generic JSON renderer can request structured data for user presentation:

```json
{
  "name": "search_customers",
  "arguments": { "query": "Globex" },
  "requestedOutputs": [{ "audience": "user", "format": "structured" }]
}
```

```json
{
  "resultType": "complete",
  "outputs": [
    {
      "audience": "user",
      "format": "structured",
      "structuredContent": [
        { "displayName": "Globex Retail", "region": "NA" },
        { "displayName": "Globex Energy", "region": "EMEA" }
      ]
    }
  ]
}
```

The host chooses how to present the value using its own UI. The server does not control the layout. A tool that requires a custom table, chart, or interactive experience should use a negotiated extension audience.

## MCP Apps integration

This SEP recommends that the MCP Apps extension define a dedicated `io.modelcontextprotocol/ui` audience. The extension would allow the `structured` format and define the audience as data delivered to the App View associated with the called tool.

An Apps-capable host can request both the assistant and View representations:

```json
{
  "name": "search_customers",
  "arguments": { "query": "Globex" },
  "requestedOutputs": [
    { "audience": "assistant", "format": "content" },
    { "audience": "io.modelcontextprotocol/ui", "format": "structured" }
  ],
  "_meta": {
    "io.modelcontextprotocol/protocolVersion": "2026-12-01",
    "io.modelcontextprotocol/clientCapabilities": {
      "extensions": {
        "io.modelcontextprotocol/ui": {
          "mimeTypes": ["text/html;profile=mcp-app"]
        }
      }
    }
  }
}
```

The server can return a concise model representation and a richer View representation:

```json
{
  "resultType": "complete",
  "outputs": [
    {
      "audience": "assistant",
      "format": "content",
      "content": [
        {
          "type": "text",
          "text": "I found 37 Globex customer records and displayed them in an interactive table."
        }
      ]
    },
    {
      "audience": "io.modelcontextprotocol/ui",
      "format": "structured",
      "structuredContent": {
        "columns": ["displayName", "region", "lastActivity"],
        "rows": [
          {
            "customerId": "cust_1042",
            "displayName": "Globex Retail",
            "region": "NA",
            "lastActivity": "2026-08-17T21:10:00Z"
          }
        ],
        "facets": { "region": ["NA", "EMEA", "APAC"] }
      }
    }
  ],
  "_meta": {
    "io.modelcontextprotocol/ui": {
      "datasetVersion": "v18",
      "continuationToken": "view_opaque_token"
    }
  }
}
```

The host provides only the `assistant` output to the model. It forwards only the `io.modelcontextprotocol/ui` output to the View. Under protocol version `2026-12-01`, a client without the Apps extension can omit `requestedOutputs`, receive the `assistant/content` fallback, and never receive the View payload.

This does not change the existing Apps result flow for earlier protocol versions. An Apps-capable client using protocol version `2026-07-28` or earlier sends no `requestedOutputs`; the server returns the legacy `content` and optional `structuredContent` fields, and the host forwards the legacy `CallToolResult` to the View as defined by the Apps extension. The requested core protocol version determines which result shape applies.

An App-enhanced tool declares both `assistant/content` and its App output. The Apps extension may define a tool as App-only, for example through `_meta.ui.visibility: ["app"]`, but the tool still declares the core `assistant/content` fallback:

```json
{
  "name": "refresh_dashboard",
  "inputSchema": { "type": "object" },
  "outputVariants": [
    {
      "audience": "assistant",
      "format": "content"
    },
    {
      "audience": "io.modelcontextprotocol/ui",
      "format": "structured",
      "schema": {
        "type": "object",
        "properties": {
          "datasetVersion": { "type": "string" }
        },
        "required": ["datasetVersion"]
      }
    }
  ],
  "_meta": {
    "ui": {
      "resourceUri": "ui://dashboard/index.html",
      "visibility": ["app"]
    }
  }
}
```

The Apps extension owns the meaning and enforcement of App-only visibility, including preventing the tool from being exposed to the model. An App or Apps-capable host calling an App-only tool requests `io.modelcontextprotocol/ui/structured` explicitly. If it omits `requestedOutputs`, the server returns the same `assistant/content` fallback used by every other tool.

The Apps extension must define the exact `ui/notifications/tool-result` projection for the new shape. The recommended projection is the selected `io.modelcontextprotocol/ui` output rather than the entire `CallToolResult`. This prevents unrelated assistant or programmatic outputs from crossing the View boundary.

## Extension audiences

An extension may define one or more result audiences when it has distinct consumers or routing rules that the core audiences cannot express.

An extension that defines an audience MUST specify:

- the audience's full identifier
- which core or extension-defined formats are permitted
- how tools advertise schemas for that audience
- how clients route the output
- whether and how the output may enter model context
- how namespaced result-level `_meta` entries are handled
- fallback behavior when the extension is not negotiated
- compatibility behavior across extension versions

Clients and servers declare connection-level support through the defining extension's entries in `ClientCapabilities.extensions` and `ServerCapabilities.extensions`. Core MCP does not define a separate server-wide list of extension audiences.

An extension with one audience SHOULD use its extension identifier as the audience identifier. An extension MAY define additional namespaced audience identifiers. If any audiences are optional within the extension, the extension MUST define how clients and servers negotiate each one through its per-extension capability settings.

The extension capability declarations establish which audiences the connection supports. A Tool's `outputVariants` establishes which of those negotiated audiences that tool can produce. An extension audience may appear in `outputVariants` or `requestedOutputs` only when both client and server advertised the defining extension and completed any audience-specific negotiation it requires.

Extensions must not redefine the semantics of the core audiences.

## Backward compatibility

This SEP changes the tool result wire shape for the 2026-12-01 protocol revision. MCP's per-request protocol version and capability declarations provide the compatibility boundary.

Supporting protocol version `2026-12-01` does not require a server to implement earlier versions. A server that does not implement the requested version rejects it through the protocol's normal versioning mechanism. The projection rules below apply to servers and SDKs that choose to support both versions.

The requested protocol version, not the presence or absence of a field, determines the Tool and result shapes:

| Requested protocol version | Tool declaration               | `tools/call` request        | `CallToolResult`                        |
| -------------------------- | ------------------------------ | --------------------------- | --------------------------------------- |
| `2026-12-01` or later      | `outputVariants`               | Optional `requestedOutputs` | `outputs`                               |
| `2026-07-28` or earlier    | Legacy optional `outputSchema` | No `requestedOutputs`       | `content`, optional `structuredContent` |

A client that receives a Tool without `outputVariants` under protocol version `2026-12-01` MUST treat the response as invalid. It MUST NOT silently switch to legacy semantics. To use an earlier shape, the client repeats the request under an earlier protocol version supported by the server.

### Servers handling older requests

A server handling `tools/list` under protocol version `2026-07-28` or earlier MUST return the legacy Tool shape and MUST omit `outputVariants`. It MAY expose one structured variant through the legacy `outputSchema`. For a new tool, the server SHOULD use the schema from `assistant/structured` when that variant is declared and MUST NOT automatically project a `user`, `programmatic`, or extension schema into `outputSchema` unless a negotiated extension defines a compatible legacy projection.

A server handling `tools/call` under protocol version `2026-07-28` or earlier MUST return the legacy `content` and optional `structuredContent` fields. It SHOULD construct `content` from `assistant/content`. If the corresponding legacy Tool declaration included `outputSchema`, any successful `structuredContent` value MUST conform to that schema.

For a tool that already supported the requested older version, the server SHOULD preserve its established `outputSchema` and `structuredContent` behavior. For a new tool without a safe structured projection, the server MAY omit both fields and return only `content`.

The server SHOULD retain the mirroring behavior required or recommended by the requested protocol version. It MUST NOT assume an old client understands `outputs`.

### Clients calling older servers

A client calling a server under protocol version `2026-07-28` or earlier MUST use the legacy Tool and request shapes and MUST NOT send `requestedOutputs`. It MUST accept the legacy result shape. It may apply local selection rules to `content` and `structuredContent`, but it cannot assume the server produced either field for a particular audience.

An `outputVariants` field received under an earlier protocol version is not a negotiation signal and does not enable the new request or result shapes.

### SDK migration

SDKs should expose the new API as explicit declarations, selectors, and result unions. They should keep legacy constructors behind version-aware adapters rather than preserving automatic mirroring in the new API.

For new-protocol requests, SDKs MUST NOT generate an unrequested text mirror. For old-protocol requests, SDKs may continue to generate the mirror needed for compatibility.

### Tool migration

SDKs may help existing tools migrate with these inferences:

- A legacy tool maps `content` to `assistant/content`.
- A legacy tool that produces structured data suitable for model context should also declare `assistant/structured`.
- A legacy tool with `outputSchema` may expose `programmatic/structured` only when its implementation can produce structured data without relying on client-side inference.
- A legacy tool that already provides model text and App data should declare `assistant/content` and `io.modelcontextprotocol/ui/structured` when the Apps extension is negotiated.
- A tool that the Apps extension defines as App-only still declares `assistant/content` and adds `io.modelcontextprotocol/ui/structured` for explicit App requests.

SDKs must not infer that one legacy `outputSchema` is suitable for assistant, programmatic, and extension audiences.

## Security implications

Audience selection separates model-visible, user-visible, programmatic, and extension data for routing. It does not make tool results trustworthy. Clients must continue to treat server output as untrusted input.

Audience selection is a routing mechanism, not an authorization or confidentiality boundary. Clients receive every requested output and MUST enforce their own authorization, isolation, and data-handling policies. Servers MUST NOT rely on an audience declaration to protect sensitive data.

Servers should minimize every output for its audience. Audience-specific schemas do not authorize the server to disclose data the client or user is not permitted to access.

Clients should validate structured outputs against the schema for the requested variant. A client must not validate an App output against the programmatic schema or accept one audience as a substitute for another.

## Rationale

### Keep a model-compatible baseline

The current protocol guarantees a `content` result shape that every tool client can process. Requiring `assistant/content` as the fallback for every tool preserves that lowest common denominator while making its intended consumer explicit. A basic conversational client can call any tool deterministically without understanding structured output or selecting among variants.

`assistant/structured` remains recommended when a tool has a natural structured representation for model context, but requiring every tool to invent one would create low-value wrapper schemas. Conversely, structured data prepared only for code, host-native presentation, or an App does not replace a usable model representation.

### Keep the fallback fixed

Client capabilities describe the representations a client can consume, but they do not identify the active consumer for a particular call. One client may support conversational, programmatic, and App outputs at the same time. The client therefore selects `requestedOutputs` when it knows the intended consumers.

When the client makes no selection, a fixed `assistant/content` fallback preserves existing behavior without adding another declaration or an extension-specific branch. Extension-aware callers already know when they need an extension output and can request it explicitly.

### Separate audience from format

`content` versus `structured` answers how data is encoded. It does not answer who should receive the data. Keeping audience and format separate supports structured model inputs, host-native presentation of structured data, and user-visible media that stays out of model context.

The valid core combinations remain closed. This avoids adding speculative combinations merely because the two properties can form a larger matrix.

### Select at request time

The client knows whether the current call serves a conversation, code mode, a user presentation, or a negotiated extension. The server knows which representations it can produce. Advertisement plus request-time selection lets both sides participate without giving either one unilateral control.

The server does not waste bytes on representations the client will discard. The client does not guess the purpose of fields after receiving them.

### Allow explicitly requested multiple outputs

Most calls should request one output. A strict one-output rule would force MCP Apps to perform a second tool call or make the server choose between model context and View hydration. Multiple outputs are therefore permitted only when the client requests multiple audiences.

This keeps the common result polymorphic while supporting calls that genuinely have several consumers.

### Give MCP Apps a dedicated audience

`host` is too broad. A host may contain a model adapter, a code executor, a renderer, an App View, and product-specific middleware. Marking structured data as host-facing does not identify which of those components should receive it.

The Apps extension already defines a distinct consumer and a negotiated routing path. Giving it the `io.modelcontextprotocol/ui` audience lets the extension own those semantics. It also lets an App schema differ from the schema for `programmatic/structured` or `assistant/structured`.

### Keep schemas per variant

A single `Tool.outputSchema` implies that every structured consumer receives the same contract. That is false for several real tools. Per-variant schemas make the difference visible during tool discovery and let generated SDK types reflect the output the client actually requested.

## Alternatives considered

### Keep the current fields and revise guidance

This was the approach in SEP-2200. It improves prose but leaves selection implicit and asks clients to infer server intent after the response arrives. Core maintainer feedback rejected it as a partial fix.

### Define `content` as assistant data and `structuredContent` as host data

This cannot distinguish direct structured model input, code-mode data, and App View data. It also retains a single `outputSchema` for consumers that may need different contracts.

### Use only content block annotations

`Annotations.audience` applies to individual content blocks and currently uses the `user` and `assistant` roles. It does not annotate `structuredContent`, declare a structured schema, or let a client request a result shape before execution. Annotations remain useful within a content output but do not replace output negotiation.

### Allow arbitrary server-defined variant identifiers

Arbitrary identifiers offer flexibility but give clients no interoperable routing semantics. This SEP defines a closed core set and reuses negotiated extension identifiers for additional audiences.

### Require exactly one output

This matches the simplest interpretation of a polymorphic result. It does not support a single App tool call that needs both model context and View hydration. Explicit multi-selection is narrower than returning all available variants when the request omits a selection.

### Require all variants to contain equivalent data

Semantic equivalence sounds safe but is difficult to define and blocks legitimate audience-specific schemas, redaction, summaries, and display state. The proposal requires consistency about the tool execution while allowing each audience to receive the representation it needs.

## Open questions

- Should `requestedOutputs` be required whenever a tool declares more than one variant, instead of allowing the fixed `assistant/content` fallback to apply?
- Should structured error outputs have an optional per-variant error schema?
- Should the Apps extension forward only its selected output to the View, or wrap that output in a reduced `CallToolResult` for compatibility with existing App SDKs?

## Reference implementation and testing plan

A reference implementation should cover one server SDK and two client modes before this SEP moves to Final:

- a conversational call requesting `assistant/content`
- a code-mode call requesting `programmatic/structured`
- a direct structured-model call requesting `assistant/structured`
- a user-rendered media call requesting `user/content`
- a host-native table call requesting `user/structured`
- an Apps call requesting `assistant/content` and `io.modelcontextprotocol/ui/structured`
- rejection of any tool declaration that omits `assistant/content`
- an App-only call explicitly requesting `io.modelcontextprotocol/ui/structured`
- an App-only call without `requestedOutputs` receiving `assistant/content`
- rejection of undeclared and unnegotiated selectors
- independent validation of programmatic and App schemas
- omission of `requestedOutputs` when calling under protocol version `2026-07-28` or earlier
- versioned projection of Tool declarations and results to the `2026-07-28` legacy shapes
- rejection of a Tool without `outputVariants` under protocol version `2026-12-01`
- confirmation that unrequested outputs and metadata do not reach the model or App View

SDK conformance tests should verify both selection and routing. Schema-only validation cannot prove that a host kept a user, programmatic, or extension output out of model context.

## References

- [SEP-2200: Clarify tool result content visibility](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2200)
- [Update structuredContent guidance for TextContent blocks](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2847)
- [MCP Apps specification](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx)
- [Rust SDK structured-only proposal](https://github.com/modelcontextprotocol/rust-sdk/pull/1046)
- [Rust SDK explicit mirroring alternative](https://github.com/modelcontextprotocol/rust-sdk/pull/1085)
- [StructuredContent versus Content client survey](https://gist.github.com/olaservo/3bb819673c444e4fe282c3af44a1ae01)
- [MCP Apps working group discussion](https://discord.com/channels/1358869848138059966/1536816939270410321)

## Acknowledgments

This proposal builds on review and implementation feedback from Ola Hungerford, David Soria Parra, Shaun Jacobs, Cliff Hall, Dale Seo, Alex Hancock, the MCP Apps maintainers, and participants in the MCP contributor discussions about tool result routing.
