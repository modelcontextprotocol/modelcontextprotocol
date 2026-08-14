# SEP-2792: Per-Request User Language Preference

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-05-26
- **Author(s)**: Sam Morrow (@SamMorrowDrums)
- **Sponsor**: Peter Alexander (@pja-ant)
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2792

## Abstract

This SEP defines a transport-neutral way for an MCP client to propagate a user's
natural-language preference on each request and for a server to report the
language it used. The canonical fields are
`io.modelcontextprotocol/acceptLanguage` in request `_meta` and
`io.modelcontextprotocol/contentLanguage` in response `_meta`.

The fields reuse HTTP semantics rather than defining MCP-specific language
syntax: `acceptLanguage` uses the `Accept-Language` field-value grammar and
meaning, including weighted language ranges and the wildcard;
`contentLanguage` uses `Content-Language` syntax and meaning; matching follows
[RFC 4647]. Streamable HTTP mirrors the canonical `_meta` values into the
standard HTTP fields and uses `Vary: Accept-Language` for language-dependent
cache variants.

This is language-preference propagation, not a general locale system or
translation framework. It does not communicate timezone, currency, calendar,
measurement, formatting, or other non-language preferences. The preference is
request-scoped and does not create session state.

## Motivation

MCP exposes user-facing text before a model or tool is chosen. Discovery
responses contain display titles, elicitation requests contain UI messages and
form labels, and progress notifications can contain user-visible status text.
MCP currently has no common way to carry the language preference already known
to an operating system, desktop application, terminal, or HTTP user agent.

Relying on a model is not sufficient. A model is not guaranteed to know the
user's operating-system or application preference, and putting that preference
into chat context is indirect and unreliable. Tool arguments are also too late
for discovery and would require every tool and method to define duplicate
semantics.

MCP is intended to work globally and across transports. HTTP already defines a
widely implemented language-preference signal, but stdio and other transports
need equivalent semantics. Defining the signal in core `_meta` and mirroring it
to HTTP preserves transport parity without inventing syntax, matching rules, or
translation infrastructure.

### Why this is core protocol behavior

This proposal is optional to use, but its meaning belongs in the core
specification rather than an extension:

- Discovery and list methods need the preference before any model or tool
  selection.
- Stateless MCP requires the current preference to travel with every request,
  not be established as connection or session state.
- The signal propagates existing user context that MCP currently drops; it is
  not a new domain feature.
- Existing core fields need one consistent interpretation. Defining competing
  extension semantics for the same `title`, elicitation, and progress fields
  would fragment client and server behavior.
- HTTP clients already carry this signal, while transport-neutral core
  semantics give stdio and future transports parity.

No capability negotiation is required. A client can send the preference to an
older server, which ignores the unknown `_meta` key, and a server can ignore a
preference it does not support.

## Specification

### Scope

This SEP standardizes only propagation, selection, and reporting of a user's
natural-language preference. Language tags can contain script or region
subtags, but those subtags do not imply any non-language locale behavior.

This SEP does not define translation catalogs, message formatting, machine
translation, or preferences for timezone, currency, calendars, collation,
number or date formats, units of measurement, location, or other locale
concerns.

### `_meta` fields

| Field                                     | Direction | Type     | Meaning                                                                                             |
| ----------------------------------------- | --------- | -------- | --------------------------------------------------------------------------------------------------- |
| `io.modelcontextprotocol/acceptLanguage`  | Request   | `string` | The user's language preference, with the syntax and semantics of HTTP `Accept-Language`.            |
| `io.modelcontextprotocol/contentLanguage` | Response  | `string` | The language or languages used for the intended audience, with the semantics of `Content-Language`. |

`_meta` is the canonical carrier on every transport.

#### Request behavior

A client that knows an applicable user language preference **SHOULD** include
`io.modelcontextprotocol/acceptLanguage` in `params._meta` on **every request**.
The value **MUST** conform to the HTTP `Accept-Language` field-value grammar in
[RFC 9110 §12.5.4]. This includes weighted [RFC 4647] language ranges and the
wildcard, for example:

```text
fr-CA,fr;q=0.9,en;q=0.5
```

The preference is request-scoped:

- A client **MAY** change or omit it on any request.
- A server **MUST NOT** bind it to a connection or logical session.
- A server **MUST NOT** reuse a preference from an earlier request when
  processing a later request that omits or changes the field.
- Messages produced while processing one request, such as an input-required
  elicitation or a progress notification, use that request's selected language.

A server **MAY** ignore the preference.

A server that participates **MUST** use matching behavior compatible with HTTP
language negotiation and [RFC 4647], including weights and wildcard semantics.
The server can use lookup or filtering as appropriate to its representation.
It **MUST NOT** define a different interpretation of the field value.

If no supported language matches, the server **MUST** use its server-defined
default and **MUST NOT** return an error solely because the preference was
unmatched.

#### Response behavior

If a server honors `acceptLanguage`, including by falling back to its default,
it **MUST** report the actual language used in
`io.modelcontextprotocol/contentLanguage`. The value **MUST** follow
`Content-Language` syntax and meaning in [RFC 9110 §8.5]: one or more [BCP 47]
language tags describing the natural language of the intended audience. It
does not need to enumerate languages that appear only in quotations, names, or
embedded source material.

The field is carried:

- in `result._meta` for a successful or input-required response;
- in `error.data._meta` for an error response whose user-facing text is
  localized; and
- in `params._meta` for a localized notification associated with the request.

If `error.data` carries `contentLanguage`, it **MUST** be an object. The
machine-readable `error.code` remains unchanged.

A server that ignores `acceptLanguage` **MAY** omit `contentLanguage`.
Omission does not identify any language.

### Translation boundary

Language selection does not imply that every natural-language string should be
translated. When a server honors the preference and has a supported selected
language, it **SHOULD** translate these display-oriented fields:

- `BaseMetadata.title` on `Implementation`, `Tool`, `Resource`,
  `ResourceTemplate`, `Prompt`, `PromptArgument`, and `PromptReference`;
- `ToolAnnotations.title`;
- `ElicitRequestFormParams.message` and `ElicitRequestURLParams.message`;
- property-level `title` and `description` values in
  `ElicitRequestFormParams.requestedSchema` (property keys remain stable); and
- `ProgressNotificationParams.message`.

A server **MAY** translate `Error.message` when it is intended for user
display. `Error.code` remains stable.

A server **MAY** translate other natural-language, model-facing, or returned
content, but this is not expected in ordinary circumstances. Translation can
change meaning and model behavior, including tool selection and argument
generation. This category includes general `description` fields such as
`Tool.description`, `Resource.description`, `ResourceTemplate.description`,
`Prompt.description`, `PromptArgument.description`, and
`Implementation.description`, as well as tool, prompt, and resource content.
Servers that translate such content are responsible for preserving its
domain-specific semantics.

A server **MUST NOT** translate a machine-interpreted identifier or token. This
categorical rule includes:

- MCP method names;
- every `BaseMetadata.name` and every `params.name`, including tool, prompt,
  and resource names;
- URIs and URI templates;
- MIME types;
- JSON and JSON Schema property keys;
- enum and `const` values;
- type, result, role, and other discriminators;
- capability and extension identifiers;
- protocol versions;
- error codes;
- `_meta` keys; and
- opaque IDs, cursors, state values, and tokens.

### Explicit language selection takes precedence

`acceptLanguage` is fallback user context, not a replacement for
method-specific or domain-specific content selection. If a method or tool has
an explicit language argument, that argument **MUST** take precedence over the
negotiated preference for the content it controls.

For example, a tool that retrieves an official legal document can expose a
`language` argument because the chosen edition is part of the operation's
meaning. The preference still localizes discovery before the tool is selected
and provides a fallback when the explicit argument is absent.

### Streamable HTTP binding

Streamable HTTP mirrors the canonical `_meta` values into standard HTTP fields:

| HTTP field         | Canonical MCP field                                         |
| ------------------ | ----------------------------------------------------------- |
| `Accept-Language`  | `params._meta["io.modelcontextprotocol/acceptLanguage"]`    |
| `Content-Language` | response `_meta["io.modelcontextprotocol/contentLanguage"]` |

A Streamable HTTP client that sends `acceptLanguage` **MUST** send an
`Accept-Language` field with the same value.

The strict payload/header agreement rule from [SEP-2243] and the current
[Streamable HTTP server validation] applies when the header is present. The
server **MAY** tolerate a missing or stripped `Accept-Language` header and use
the canonical `_meta` value. If both are present and do not satisfy the
transport's equality rule, the server **MUST** reject the request with HTTP
`400 Bad Request` and `HeaderMismatch` (`-32020`). A bare header without the
canonical `_meta` field does not create an MCP preference.

For a JSON response carrying `contentLanguage`, the server **MUST** mirror it
into `Content-Language`. If a client receives both values and they conflict
under the transport equality rule, the response is malformed.

An SSE response header describes the stream as a whole and is fixed before
individual messages are produced. A server **MAY** omit `Content-Language` on
`text/event-stream`, unless one value accurately describes every applicable
message on that stream. Each localized response or notification still carries
its own canonical `_meta` value.

Non-HTTP transports use only `_meta`; all request scope, matching, fallback,
reporting, and translation rules remain the same.

### Caching

Language-dependent responses remain cacheable. Existing `ttlMs` and
`cacheScope` freshness and sharing semantics are unchanged.

Any MCP or client cache that reuses a response **MUST** include the request's
`acceptLanguage` value in its cache key when the representation varies by
language. A cached response for one preference **MUST NOT** be served for a
different preference. This applies even when both preferences happen to select
the same language.

An HTTP response that varies by language **MUST** include
`Vary: Accept-Language`. If a shared cache cannot observe the language signal,
for example because an intermediary stripped the header while preserving
`_meta`, the response **MUST** either be private or use an equivalent
language-aware key visible to that cache. `cacheScope: "public"` permits
sharing across authorization contexts; it does not permit sharing across
language variants without the required language key.

### Examples

#### Localized discovery with stable identifiers

The client sends its preference before any model or tool argument is involved:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {
    "_meta": {
      "io.modelcontextprotocol/acceptLanguage": "fr-CA,fr;q=0.9,en;q=0.5"
    }
  }
}
```

The server localizes the display `title` while preserving the machine `name`:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "resultType": "complete",
    "tools": [
      {
        "name": "weather_current",
        "title": "Météo actuelle",
        "inputSchema": {
          "type": "object"
        }
      }
    ],
    "ttlMs": 300000,
    "cacheScope": "public",
    "_meta": {
      "io.modelcontextprotocol/contentLanguage": "fr-CA"
    }
  }
}
```

The cache entry is keyed by the request's `acceptLanguage` value in addition to
the existing request and authorization dimensions.

#### Localized elicitation UI with a stable field key

While processing a request with `acceptLanguage: "de"`, a server can return an
input-required result containing localized elicitation text:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "resultType": "input_required",
    "inputRequests": {
      "contact": {
        "method": "elicitation/create",
        "params": {
          "message": "Bitte geben Sie Ihre E-Mail-Adresse ein.",
          "requestedSchema": {
            "type": "object",
            "properties": {
              "email": {
                "type": "string",
                "format": "email",
                "title": "E-Mail-Adresse",
                "description": "Adresse für die Bestätigung"
              }
            },
            "required": ["email"]
          }
        }
      }
    },
    "_meta": {
      "io.modelcontextprotocol/contentLanguage": "de"
    }
  }
}
```

The property key `email`, schema `type`, and `format` remain unchanged.

#### Explicit content language override

Suppose the same user preference is `"en"`, but a
`get_official_document` tool call includes `"language": "ga"`. The explicit
argument selects the Irish edition of the returned resource content. The
preference can still localize discovery and other display fields, but it does
not override the operation's explicit content selection.

## Rationale and Alternatives

### Why `_meta`

Language preference is orthogonal to any individual method and applies before
method-specific behavior. `_meta` carries it without changing every request
shape and works on HTTP, stdio, and future transports.

### Why reuse HTTP semantics

A single language tag would lose preference ordering, weighted fallback, and
wildcard behavior. Reusing `Accept-Language`, `Content-Language`, [RFC 4647],
`Vary`, and HTTP privacy guidance gives implementations established parsers,
matchers, and cache behavior without an MCP-specific grammar.

### Why not an extension

An extension would make core discovery and UI fields depend on an optional,
separately interpreted contract. Multiple extensions could assign different
language semantics to the same fields, and clients would need the preference
before discovering which extension or tool applies. Core `_meta` defines one
transport-neutral meaning while remaining backward compatible and optional to
honor.

### Why not tool arguments or model context

Tool arguments cannot localize `tools/list`, prompt and resource discovery,
elicitation UI, or progress messages before a tool call. Adding the preference
to every tool would duplicate syntax and matching rules. Model context is also
not a reliable source for a host-level user preference and unnecessarily
consumes model-visible context. Explicit domain language arguments remain
appropriate when language changes the operation itself and take precedence as
specified above.

### Why per request

Users can change preferences at any time, and one client or server connection
can serve multiple users or contexts. Per-request propagation follows
stateless MCP and prevents stale connection state from selecting the wrong
language.

### Rejected alternatives

- **HTTP headers only:** excludes stdio and makes semantics transport-specific.
- **A bespoke `locale` field:** conflates language with unrelated locale
  concerns and discards standard weighted fallback semantics.
- **Handshake or capability state:** conflicts with stateless operation and
  cannot represent a changed preference on the next request.
- **Automatic translation of all natural-language fields:** changes
  model-facing semantics and exceeds the display-oriented need this SEP
  addresses.

## Backward Compatibility

The new `_meta` keys are optional and unknown `_meta` keys are ignored.
Existing clients and servers continue to use their current language behavior.
Servers can adopt matching, reporting, translation, and HTTP mirroring
incrementally, provided that a server claiming to honor the preference follows
all requirements in this SEP.

Existing HTTP deployments that rewrite `Accept-Language` while leaving the
JSON body unchanged must preserve, remove, or consistently mirror the field to
avoid `HeaderMismatch`. This is the same routing-integrity requirement already
used by Streamable HTTP mirroring.

## Security and Privacy

`Accept-Language` can increase fingerprinting entropy. Clients **SHOULD**
follow the privacy guidance in [RFC 9110 §12.5.4], including sending only the
detail needed for the interaction or omitting the preference when appropriate.

Receivers **MUST** validate the field-value grammar before using a parser or
matcher. A malformed canonical value can be ignored as an absent preference;
a present HTTP mirror still has to satisfy Streamable HTTP agreement rules.

Incorrect cache variation can disclose one user's localized representation to
another user. Implementations **MUST** follow the cache-key, `cacheScope`, and
`Vary` requirements above.

Translations of model-facing text can alter model behavior. Servers that use
the **MAY** category should review translations for semantic equivalence and
test relevant model interactions. Machine-interpreted identifiers remain
stable to prevent routing, validation, authorization, and parsing failures.

## Reference Implementation

[modelcontextprotocol/typescript-sdk#2158] is a draft reference implementation
covering Streamable HTTP and stdio. [github-mcp-server PR #25] is prior art for
server-side translation catalogs that can consume the request-scoped
preference.

## Conformance

Per [SEP-2484], a conformance scenario is required before this SEP can reach
Final. Tests should cover at least:

1. Weighted ranges, wildcard matching, supported selection, and default
   fallback without an unmatched-preference error.
2. Preference changes and omission on consecutive requests over one
   connection, proving no earlier value is reused.
3. Localized `tools/list` titles with stable names and a reported
   `contentLanguage`.
4. Localized elicitation and progress display text with stable property keys
   and tokens.
5. Preservation of all machine-interpreted identifiers and explicit language
   arguments taking precedence.
6. HTTP request and JSON response mirroring, tolerated missing
   `Accept-Language`, `HeaderMismatch` (`-32020`) on a present mismatch, and a
   malformed response on conflicting duplicated values.
7. SSE and notification reporting through per-message `_meta`.
8. MCP and HTTP cache separation across language preferences, including
   `ttlMs`, `cacheScope`, `Vary: Accept-Language`, and the stripped-header
   shared-cache case.
9. HTTP language-preference privacy guidance.

## Acknowledgments

Thanks to [@pja-ant] and [@kurtisvg] for the transport-parity and scope
feedback on [PR #2355], to the Transport Working Group for review, and to the
authors of [SEP-2243], [SEP-2575], and [SEP-2484].

[BCP 47]: https://www.rfc-editor.org/info/bcp47
[RFC 4647]: https://www.rfc-editor.org/rfc/rfc4647
[RFC 9110 §8.5]: https://www.rfc-editor.org/rfc/rfc9110.html#section-8.5
[RFC 9110 §12.5.4]: https://www.rfc-editor.org/rfc/rfc9110.html#section-12.5.4
[SEP-2243]: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/2243-http-standardization.md
[SEP-2484]: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/2484-conformance-tests-required-for-final-seps.md
[SEP-2575]: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/2575-stateless-mcp.md
[Streamable HTTP server validation]: https://modelcontextprotocol.io/specification/draft/basic/transports/streamable-http#server-validation
[PR #2355]: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2355
[modelcontextprotocol/typescript-sdk#2158]: https://github.com/modelcontextprotocol/typescript-sdk/pull/2158
[github-mcp-server PR #25]: https://github.com/github/github-mcp-server/pull/25
[@pja-ant]: https://github.com/pja-ant
[@kurtisvg]: https://github.com/kurtisvg
