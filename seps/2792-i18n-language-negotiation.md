# SEP-2792: Internationalization via Per-Request Language Negotiation

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-05-26
- **Author(s)**: Sam Morrow (@SamMorrowDrums)
- **Sponsor**: None (seeking sponsor)
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2792

## Abstract

This SEP defines a transport-agnostic mechanism for clients to express a
language preference on every MCP request, and for servers to indicate the
language actually used in every response. Preferences are carried in `_meta`
using a single field whose value is a [BCP 47] language-range list with the
exact syntax of the HTTP [`Accept-Language`][rfc9110-accept-language] field
(including quality values). For the Streamable HTTP transport, the value is
additionally mirrored into the standard `Accept-Language` / `Content-Language`
HTTP headers, following the precedent set by [SEP-2243] for `Mcp-Method` and
`Mcp-Name`. The proposal is deliberately narrow: it standardizes only language
negotiation, reuses an existing IETF mechanism unchanged, and avoids any
session state. Because the field is sent on every request, a user may change
the preferred language at any point during a conversation without
renegotiation, aligning with the stateless-by-default direction established
by [SEP-2575].

## Motivation

MCP exposes user-facing strings on tools, resources, prompts, and server
metadata (`title`, `description`, `text` content blocks, error messages, etc.)
that are intended for display in user interfaces. The specification today
provides no mechanism for a client to request these strings in a particular
language, or for a server that supports multiple languages to advertise which
one it returned. This forces ad-hoc solutions and discourages MCP servers
from investing in i18n at all.

### Primary goal: leverage existing ecosystem; do not reinvent the wheel

The single most important design constraint for this SEP is that MCP **must
not** invent new i18n machinery. Language negotiation is one of the
oldest, most thoroughly-solved problems on the web, and the solutions are
already in the hands of every server author:

- **Standards already exist**, [BCP 47] language tags, [RFC 4647]
  language-range matching (lookup and filtering), and the HTTP
  [`Accept-Language`][rfc9110-accept-language] /
  [`Content-Language`](https://httpwg.org/specs/rfc9110.html#field.content-language)
  fields are stable, widely-understood IETF specifications. No bespoke
  syntax, matching rules, or fallback semantics need to be defined here.
- **Libraries already exist**, every major ecosystem ships a battle-tested
  matcher: `Intl.LocaleMatcher` and `Negotiator` in JavaScript,
  `golang.org/x/text/language`, Python `Babel` and `langcodes`, Java/ICU
  `ULocale.acceptLanguage`, Ruby's `Rack::Utils.q_values`, .NET
  `MicrosoftExtensions.Localization`, and so on. By accepting the
  `Accept-Language` syntax verbatim (quality values and all), server
  authors hand the string straight to a matcher they already trust.
- **Infrastructure already exists**, CDNs, caches, reverse proxies, WAFs
  and observability tools already understand `Accept-Language`,
  `Content-Language`, and `Vary: Accept-Language`. Mirroring the field
  into the HTTP layer means an MCP server fronted by Cloudflare, Fastly,
  nginx, Envoy or an API gateway gets per-language caching, routing and
  segmentation for free, no MCP-specific configuration required.
- **Translation tooling already exists**, gettext catalogs, ICU
  MessageFormat, Fluent, Crowdin/Lokalise/Transifex pipelines, and every
  framework-level i18n module (Rails I18n, ASP.NET resx, Django
  `gettext`, `i18next`, etc.) are keyed by BCP 47 tags. A server can
  plug its existing translation pipeline into MCP without writing a
  single line of new mapping code.

A previous attempt to address this ([PR #2355]) proposed adding guidance to
the Streamable HTTP transport recommending the use of standard HTTP
`Accept-Language` / `Content-Language` headers. That approach was correct in
spirit but received reasonable pushback from maintainers ([@pja-ant],
[@kurtisvg]) on two grounds:

1. **Transport parity.** A header-only solution leaves stdio (and any future
   non-HTTP transport) without an i18n mechanism, fragmenting the developer
   experience. [SEP-2575] explicitly requires that "stateless principles are
   applied consistently across all transports … allowing the core protocol
   semantics to be learned once and applied everywhere."
2. **Established mirroring pattern.** [SEP-2243] has since established the
   pattern of mirroring routing-relevant fields between the JSON-RPC payload
   and HTTP headers (with strict consistency requirements). Language
   preference belongs to the same category: it is metadata that
   intermediaries (CDNs, caches, gateways), the transport, and the
   application all benefit from seeing.

This SEP resolves both concerns by defining the language preference as a
first-class, transport-agnostic field in `_meta` and, on HTTP, requiring it
to mirror the existing standard headers, gaining stdio support, header
visibility, and stateless per-turn re-negotiation in one move, while
preserving the "lean into HTTP for what it already does well" approach that
has guided MCP's authorization story.

### Scope: user-facing content (and beyond)

The mechanism itself is entirely optional (see the note at the start of
[Specification](#specification)). When a server **does** choose to honor
`acceptLanguage`, this SEP scopes the negotiation to **user-facing
content**: strings that an MCP client surfaces directly in a user
interface and that the human user reads. Typical user-facing fields
(non-exhaustive) include:

- `title` and `description` on tools, resources, prompts, and server
  metadata (rendered in tool pickers, capability lists, settings, etc.)
- Error `message` strings intended for surfacing in a UI
- Notification messages (e.g. `logging/message`) that may be rendered to
  the user
- Any other field the host explicitly displays to the user without
  passing it through the model first

In addition, servers **MAY** translate body content returned from
`tools/call`, `resources/read`, and `prompts/get`. This content is
primarily model-facing and the model is generally language-flexible, but
localizing it can still be valuable, for example when the content is
likely to be quoted back to the user verbatim, or when the data is
inherently locale-specific (legal text, dates, currency formatting,
units). The choice is left to the server.

Out of scope in all cases: machine-interpreted values such as tool
names, identifiers, URIs, schema field names, enum tokens, MIME types,
or any other value whose semantics depend on the literal string. These
**MUST NOT** be translated.

## Specification

This entire mechanism is **opt-in on both sides**. Clients **MAY** send
`acceptLanguage`; servers **MAY** ignore it entirely. The rules below
apply only when each side chooses to participate. Nothing in this SEP
requires any existing client or server to change behavior.

### `_meta` fields

Two extension-prefixed `_meta` keys are defined, using the
`io.modelcontextprotocol/` vendor prefix per [SEP-2133]:

| Field                                     | Direction | Type     | Required | Description                                                                                                               |
| ----------------------------------------- | --------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| `io.modelcontextprotocol/acceptLanguage`  | Request   | `string` | No       | A language-range list with the syntax of the HTTP `Accept-Language` field as defined in [RFC 9110 §12.5.4].               |
| `io.modelcontextprotocol/contentLanguage` | Response  | `string` | No       | A single [BCP 47] language tag (or comma-separated list, per [RFC 9110 §8.5]) indicating the language(s) of the response. |

#### `acceptLanguage` (request)

- The client **MAY** include `io.modelcontextprotocol/acceptLanguage` in
  `params._meta` on **any** request or notification it sends.
- The value **MUST** conform to the `Accept-Language` ABNF in
  [RFC 9110 §12.5.4], i.e. a comma-separated list of language ranges per
  [RFC 4647], each with an optional weight (`q`-value).
- Examples:

  ```text
  en
  en-US
  en-US,en;q=0.9,fr;q=0.5
  *
  ```

- A server **MAY** ignore the field entirely. No capability negotiation or
  advertisement is required to opt out.
- A server that chooses to participate **MAY** select a language using
  [RFC 4647] language-range matching (lookup or filtering, server's
  choice) and produce user-facing strings in that language. It **MAY**
  additionally translate body content from `tools/call`,
  `resources/read`, and `prompts/get` (see
  [Scope](#scope-user-facing-content-and-beyond)).
- Servers **MUST NOT** translate identifiers, tool names, URIs, schema field
  names, enum tokens, MIME types, or any other value whose semantics depend
  on the literal string.
- If no available language matches the client's preferences, the server
  **SHOULD** fall back to a server-defined default and **MUST NOT** return an
  error solely because of an unmatched preference.

#### `contentLanguage` (response)

- A server that selected a language in response to `acceptLanguage`, or that
  is aware of the language of the user-facing content it returned, **MUST**
  include `io.modelcontextprotocol/contentLanguage` in `result._meta` on a
  successful response, or in `error.data._meta` on an error response (see
  [Error responses](#error-responses) below).
- The value **MUST** be a [BCP 47] language tag, or a comma-separated list
  per [RFC 9110 §8.5] when content contains multiple languages.
- A server that did not localize content **MAY** omit the field. Omission
  carries no semantics; clients **SHOULD NOT** assume any particular
  language.
- Clients **MAY** use this value for UI affordances (e.g. a "translated by
  server" badge, a fallback notice, or to drive a per-turn locale switch in
  surrounding chrome).

#### Per-request, by design

`acceptLanguage` is **not** negotiated once at the start of a session and is
**not** part of any handshake. Every request stands alone, matching the
stateless-by-default model of [SEP-2575]. This means:

- A user may change their preferred language mid-conversation; the very next
  request will reflect the change.
- Servers **MUST NOT** require that all requests within a logical session use
  the same language preference.
- Servers **MUST NOT** cache or persist a client's language preference across
  requests in a way that overrides a later, differing `acceptLanguage`
  value. Caching the resolved translations themselves is, of course, fine.

### Streamable HTTP transport binding

When using the Streamable HTTP transport, language preference and selection
are additionally exchanged via the standard HTTP headers, following the
mirroring pattern established by [SEP-2243].

#### Request

| HTTP header       | Source field                                      | Required when                                            |
| ----------------- | ------------------------------------------------- | -------------------------------------------------------- |
| `Accept-Language` | `_meta['io.modelcontextprotocol/acceptLanguage']` | The `_meta` field is present on the request being POSTed |

- When a client includes `io.modelcontextprotocol/acceptLanguage` in
  `params._meta`, it **SHOULD** also set the HTTP `Accept-Language` header
  on the corresponding POST to the same value, as a hint for intermediaries.
- The `_meta` field is **authoritative** and is the only canonical
  carrier of language preference. Servers **MUST** read language
  preference from `_meta` and **MUST NOT** treat a bare HTTP
  `Accept-Language` header (without the `_meta` field) as a language
  preference for MCP semantics. This keeps a single, transport-agnostic
  source of truth and avoids ambiguity introduced by intermediaries
  (CDNs, edge i18n routers, reverse proxies) that strip, normalize, or
  rewrite the header.

#### Error responses

The standard JSON-RPC `Error` object is `{ code, message, data? }` and
carries no `_meta` of its own. Localized error content lives under
`error.data._meta`:

```jsonc
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32602,
    "message": "Invalid arguments",
    "data": {
      "_meta": {
        "io.modelcontextprotocol/contentLanguage": "fr-CA",
      },
      "localizedMessage": "Arguments invalides : « location » est requis.",
    },
  },
}
```

- When a server localizes the `error.message` text, or any human-readable
  field inside `error.data`, it **MUST** set
  `error.data._meta['io.modelcontextprotocol/contentLanguage']` to the
  language of that text.
- On the Streamable HTTP transport, the `Content-Language` response header
  **SHOULD** mirror this value when an error response is returned, on the
  same best-effort basis as for successful responses.
- This SEP introduces no new error field beyond `_meta`; servers remain free
  to use any other `error.data` shape they already use for structured error
  context.

#### Response

| HTTP header        | Source field                                       |
| ------------------ | -------------------------------------------------- |
| `Content-Language` | `_meta['io.modelcontextprotocol/contentLanguage']` |

- When a server emits `io.modelcontextprotocol/contentLanguage` in the
  response `_meta`, it **SHOULD** also set the HTTP `Content-Language`
  response header to the same value, as a hint for intermediaries and
  caches. The `_meta` field is authoritative; the header is a
  best-effort mirror.
- Streaming responses (`text/event-stream`) **SHOULD** include
  `Content-Language` on the HTTP response if any event in the stream carries
  the `_meta` field; per-event variation within a single response is **NOT**
  permitted (use a fresh request to switch language mid-stream).

### stdio (and other non-HTTP) transports

Non-HTTP transports use the `_meta` fields only; there is no header layer.
All other semantics, per-request scope, fallback behavior, response
echoing, apply identically. This is the point: the same client and server
code can implement i18n once and have it work everywhere.

### Schema (illustrative)

```ts
// Request (any RequestParams)
interface RequestParams {
  _meta?: {
    /**
     * Language preference for user-facing content in the response.
     * Syntax matches the HTTP Accept-Language field (RFC 9110 §12.5.4),
     * a comma-separated list of BCP 47 language ranges with optional
     * quality values.
     *
     * @example "en-US,en;q=0.9,fr;q=0.5"
     */
    "io.modelcontextprotocol/acceptLanguage"?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// Response (any Result)
interface Result {
  _meta?: {
    /**
     * Language(s) of user-facing content in this response.
     * A BCP 47 language tag, or a comma-separated list per
     * RFC 9110 §8.5 when content contains multiple languages.
     *
     * @example "en-US"
     */
    "io.modelcontextprotocol/contentLanguage"?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
```

### Examples

#### Example 1, Streamable HTTP, `tools/call`

Request:

```http
POST /mcp HTTP/1.1
Content-Type: application/json
Accept-Language: fr-CA,fr;q=0.9,en;q=0.5
Mcp-Method: tools/call
Mcp-Name: get_weather

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": { "location": "Montréal, QC" },
    "_meta": {
      "io.modelcontextprotocol/acceptLanguage": "fr-CA,fr;q=0.9,en;q=0.5"
    }
  }
}
```

Response:

```http
HTTP/1.1 200 OK
Content-Type: application/json
Content-Language: fr-CA

{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      { "type": "text", "text": "À Montréal : 4 °C, partiellement nuageux." }
    ],
    "_meta": {
      "io.modelcontextprotocol/contentLanguage": "fr-CA"
    }
  }
}
```

#### Example 2, stdio, mid-conversation language switch

```jsonc
// Turn 1: user is browsing in English
{ "jsonrpc": "2.0", "id": 7, "method": "tools/list",
  "params": { "_meta": { "io.modelcontextprotocol/acceptLanguage": "en" } } }

// Turn 2 (same process, same client/server pair): user switched UI to German
{ "jsonrpc": "2.0", "id": 8, "method": "tools/list",
  "params": { "_meta": { "io.modelcontextprotocol/acceptLanguage": "de-DE,de;q=0.9,en;q=0.5" } } }
```

A compliant server returns German `title`/`description` strings on turn 8
even though turn 7 was in English. No re-`initialize`, no session
invalidation.

## Rationale

### Why `_meta` and not top-level `params`

[SEP-414] established `params._meta` as the conventional location for
per-request metadata that is orthogonal to the request's primary purpose.
Language preference is exactly that kind of cross-cutting concern: it
applies uniformly to every method that may return user-facing content,
without changing any method's contract. Using `_meta` also avoids touching
the schema of every individual request type.

### Why mirror the HTTP `Accept-Language` syntax verbatim

A simple single-tag `locale` field (e.g. `"en-US"`) is more compact, but
loses the fallback chain and quality values that real
internationalization requires (e.g. "I prefer Catalan, but Spanish is fine,
and English is a last resort"). Adopting the HTTP syntax verbatim means:

- Server authors can hand the string to any RFC 4647 matcher unchanged.
- HTTP-fronted servers do not need to translate between two formats.
- The ecosystem's deep tooling for language tags applies immediately.

The cost is a slightly less obvious format for callers who only want one
language, but `"en-US"` is itself a valid `Accept-Language` value, so the
simple case stays simple.

### Why mirror to HTTP headers (without a strict mismatch rule)

The HTTP `Accept-Language` and `Content-Language` headers are useful to:

- **Caches and CDNs**, which already understand `Vary: Accept-Language`.
- **Edge i18n services** that route requests to language-specific backends.
- **Observability tools** that segment usage by locale.

This SEP therefore says clients SHOULD mirror `_meta[acceptLanguage]` into
the `Accept-Language` request header, and servers SHOULD mirror
`_meta[contentLanguage]` into the `Content-Language` response header.

Unlike the headers introduced by [SEP-2243] (e.g. `Mcp-Method`,
`Mcp-Name`), which nothing on the network path is expected to touch,
`Accept-Language` and `Content-Language` are first-class HTTP headers
that intermediaries actively interact with. A few examples:

- [CloudFront strips `Accept-Language`][cloudfront-accept-language] from
  forwarded requests by default unless explicitly configured to preserve it.
- [Fastly's `accept.language_lookup()` VCL][fastly-accept-language-lookup]
  and [Varnish's `vmod_accept`][varnish-vmod-accept] are the recommended
  way to get the per-language caching benefit cited above; both rewrite
  `Accept-Language` to a single normalized tag before the request reaches
  the origin.
- Reverse proxies routinely route on `Accept-Language` and may strip,
  normalize, or re-serialize the header.

Additionally, [RFC 9110][rfc9110] does not define a single canonical
serialization for `Accept-Language`: optional whitespace after commas
([§5.6.1.1][rfc9110-5.6.1.1]), case-insensitive language tags
([RFC 5646 §2.1.1][rfc5646-2.1.1]), `q` parameter normalization and
trailing-zero weights ([§12.4.2][rfc9110-12.4.2]), and list fields
legally split across field lines and recombined ([§5.2-5.3][rfc9110-5.2])
are all under-specified, so "the header and the body field disagree" is
not even a well-defined comparison.

Applying [SEP-2243]'s hard-fail mismatch rule to these headers would
make every request that traverses a conformant edge-i18n setup error
out with `-32001`, defeating the very benefit we cite for putting the
value in the header in the first place. Instead, this SEP treats
`_meta` as the canonical value and the headers as a best-effort hint.
If they disagree, the server uses `_meta`.

### Why per-request, not per-session

[SEP-2575] is explicit that MCP is moving to a stateless-by-default model
and that `initialize` will no longer carry persistent negotiated state.
Putting language preference in `initialize` would re-introduce exactly the
kind of session coupling that SEP-2575 removes. Per-request scope is also
genuinely useful: a user switching their UI language, or an agent
operating across users (e.g. an org-wide assistant), should be able to
change the request language without tearing anything down.

### Relationship to SEP-1809 (proposed subsumption)

[SEP-1809] proposes a `clientContext` object on `tools/call` carrying
`timezone`, `currentTimestamp`, `locale`, and `userLocation`. Its `locale`
field overlaps with this SEP. Because SEP-1809 is currently in Draft and
without a visible sponsor, and because language is a strictly cross-cutting
concern (not limited to `tools/call`), this SEP proposes to **subsume the
language aspect of SEP-1809**:

- SEP-1809 (or its successor) should retain `timezone`, `currentTimestamp`,
  and `userLocation`, all of which are genuinely tool-call-scoped context.
- The `locale` field should be removed from SEP-1809 in favor of the
  cross-cutting `io.modelcontextprotocol/acceptLanguage` defined here.
- Servers that need both can read locale from `_meta` and the rest from
  `clientContext`.

We will coordinate with SEP-1809's author to align.

### Alternatives considered

1. **HTTP-only guidance (the original PR #2355).** Simpler, but leaves
   stdio without an answer and creates two i18n stories. Rejected per
   maintainer feedback and SEP-2575's transport-consistency requirement.
2. **A single `locale` string in `_meta`.** Simpler, but loses fallback
   semantics. Rejected, the marginal complexity of accepting the full
   `Accept-Language` syntax is paid once by spec readers and saved
   thereafter.
3. **A top-level `params.acceptLanguage` field on each affected request
   type.** Would require touching every request schema and offers no
   benefit over `_meta`. Rejected.
4. **Putting language in `initialize` capabilities.** Directly contradicts
   SEP-2575. Rejected.
5. **A new `i18n` capability that gates the feature.** Unnecessary: the
   `_meta` field is optional in both directions and degrades cleanly. No
   capability negotiation needed.

## Backward Compatibility

This proposal is fully backward compatible.

- The new `_meta` fields are optional in both directions.
- Servers and clients that do not implement them are unaffected: the field
  is simply ignored, and the server returns content in its default
  language.
- On HTTP, the mirrored headers (`Accept-Language`, `Content-Language`)
  are already standard HTTP and already permitted by every existing
  framework; their presence does not break any current MCP server.
- The `_meta` field is authoritative; intermediaries are free to strip
  or rewrite the headers without affecting correctness.

## Security Implications

- **Information leakage.** `Accept-Language` is a known fingerprinting
  vector. Clients that care about user privacy **SHOULD** consider
  truncating to a coarse language (e.g. `en` rather than `en-US`) or
  omitting the field entirely. This is the same guidance the HTTP
  community already gives.
- **Injection.** Servers **MUST** validate the field against the
  `Accept-Language` ABNF before passing it to any matcher; malformed
  values should be ignored, not cause an error.
- **Cache poisoning.** HTTP caches must `Vary: Accept-Language` when
  caching localized responses. This is standard HTTP behavior, not new
  here, but server implementers should be reminded.
- **Header tampering by intermediaries is expected, not an attack.**
  CDNs and edge i18n services routinely strip, normalize, or rewrite
  `Accept-Language` and `Content-Language`. This SEP therefore treats
  the `_meta` field as canonical and the headers as a best-effort hint:
  there is no header/body equality contract to violate, and no
  mismatch-based reject path that a malicious intermediary could trip.

No new attack surface is introduced beyond what `Accept-Language` already
implies on the open web.

## Reference Implementation

A reference implementation has been opened against the TypeScript SDK:

- **PR**: [modelcontextprotocol/typescript-sdk#2158] (draft)
- **Branch**: [`SamMorrowDrums/typescript-sdk@sammorrowdrums/reimagined-enigma`](https://github.com/SamMorrowDrums/typescript-sdk/tree/sammorrowdrums/reimagined-enigma)

It delivers:

1. A small `i18n` helper module exposing `ACCEPT_LANGUAGE_META` /
   `CONTENT_LANGUAGE_META` constants, get/set accessors for the two
   `_meta` fields, and a `negotiateLanguage()` function that delegates
   to [`@formatjs/intl-localematcher`] (an off-the-shelf [RFC 4647]
   matcher), demonstrating the "no reinvention" point in code.
2. Streamable HTTP transport mirroring in both directions:
   `_meta[acceptLanguage]` to/from the `Accept-Language` header on
   requests and `_meta[contentLanguage]` to/from `Content-Language`
   on responses, with `_meta` treated as canonical (no mismatch
   rejection).
3. stdio transport demonstrating that the same `_meta` fields flow
   end-to-end with no transport changes.
4. An example server (`get_greeting` tool) localized into **en / fr /
   de**, runnable in either stdio or Streamable HTTP mode, plus an
   example client that issues the call with `"en"`,
   `"fr-CA,fr;q=0.9,en;q=0.5"`, and `"ja"` (forcing fallback).
5. Tests: unit tests for the helpers and `negotiateLanguage` (quality
   values, wildcards, fallback), HTTP integration tests (header
   mirroring, `Content-Language` echoed, error-response localization),
   and stdio integration tests, including the critical proof that two
   sequential `tools/list` calls on the same connection with different
   `acceptLanguage` values return differently-localized `title`s. This
   is the runnable evidence for the per-request, mid-session-switch
   claim in [SEP-2575] alignment.

Earlier reference for the i18n machinery itself exists in
[github-mcp-server PR #25] (a server-side translations framework),
which can be plugged into the per-request selection defined here.

## Conformance

Per [SEP-2484], a conformance scenario is required before this SEP can
reach Final. The scenario will cover, at minimum:

1. A client sending `io.modelcontextprotocol/acceptLanguage` in
   `params._meta` and (on HTTP) the mirrored `Accept-Language` header.
2. A server returning localized user-facing strings and emitting
   `io.modelcontextprotocol/contentLanguage` in `result._meta` and (on
   HTTP) the mirrored `Content-Language` response header.
3. A server falling back to its default language when no preference
   matches, without returning an error.
4. A localized error response carrying
   `error.data._meta['io.modelcontextprotocol/contentLanguage']`,
   with `Content-Language` mirrored on HTTP JSON responses.
5. Per-request language switching on the same connection (notably
   stdio), to demonstrate that no session state is involved.
6. A request where the HTTP `Accept-Language` header has been stripped
   or rewritten by an intermediary while `_meta` is preserved: the
   server **MUST** honor `_meta` and **MUST NOT** reject the request.

## Open Questions

1. **Notifications carrying `acceptLanguage`.** Notifications have no
   response, so `contentLanguage` does not apply, but
   `logging/message` and similar server-to-client notifications could
   themselves benefit from a `contentLanguage`. Should server-initiated
   notifications also carry `contentLanguage`? (Tentative answer: yes,
   under the same rule, emit it if the content was localized.)
2. **`Vary` header guidance.** Should this SEP mandate
   `Vary: Accept-Language` on cacheable responses, or leave it as
   standard HTTP guidance? (Tentative: a SHOULD, with a pointer to
   RFC 9111.)

## Acknowledgments

- [@pja-ant] and [@kurtisvg] for the framing pushback on [PR #2355] that
  led directly to this proposal.
- Authors of [SEP-2243] for the header-mirroring pattern this SEP reuses.
- Authors of [SEP-2575] for the stateless-by-default direction that makes
  per-request negotiation the right default.
- Markus Cozowicz for [SEP-1809], which surfaced the need for structured
  client context.

[`@formatjs/intl-localematcher`]: https://formatjs.github.io/docs/polyfills/intl-localematcher
[modelcontextprotocol/typescript-sdk#2158]: https://github.com/modelcontextprotocol/typescript-sdk/pull/2158
[BCP 47]: https://www.rfc-editor.org/info/bcp47
[RFC 4647]: https://www.rfc-editor.org/rfc/rfc4647
[RFC 9110 §8.5]: https://httpwg.org/specs/rfc9110.html#field.content-language
[RFC 9110 §12.5.4]: https://httpwg.org/specs/rfc9110.html#field.accept-language
[rfc9110-accept-language]: https://httpwg.org/specs/rfc9110.html#field.accept-language
[SEP-414]: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/414-request-meta.md
[SEP-2133]: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/2133-extensions.md
[SEP-2243]: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2243
[SEP-2575]: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2575
[SEP-1809]: https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1809
[SEP-2484]: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/2484-conformance-tests-required-for-final-seps.md
[PR #2355]: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2355
[@pja-ant]: https://github.com/pja-ant
[@kurtisvg]: https://github.com/kurtisvg
[github-mcp-server PR #25]: https://github.com/github/github-mcp-server/pull/25
[cloudfront-accept-language]: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/RequestAndResponseBehaviorCustomOrigin.html
[fastly-accept-language-lookup]: https://www.fastly.com/documentation/reference/vcl/functions/content-negotiation/accept-language-lookup/
[varnish-vmod-accept]: https://docs.varnish-software.com/varnish-enterprise/vmods/accept/
[rfc9110]: https://www.rfc-editor.org/rfc/rfc9110
[rfc9110-5.2]: https://www.rfc-editor.org/rfc/rfc9110.html#section-5.2
[rfc9110-5.6.1.1]: https://www.rfc-editor.org/rfc/rfc9110.html#section-5.6.1.1
[rfc9110-12.4.2]: https://www.rfc-editor.org/rfc/rfc9110.html#section-12.4.2
[rfc5646-2.1.1]: https://www.rfc-editor.org/rfc/rfc5646.html#section-2.1.1
