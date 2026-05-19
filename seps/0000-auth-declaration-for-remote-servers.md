# SEP-0000: Declaring Authentication Methods for Remote MCP Servers

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-05-19
- **Author(s)**: Tobin South (@tobinsouth)
- **Sponsor**: None (seeking sponsor — Server Card WG / Auth IG)
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/0000

## Abstract

The MCP authorization specification defines _how_ a client authenticates to an OAuth-protected server: RFC 9728 / RFC 8414 discovery, RFC 7591 dynamic client registration, PKCE, and resource indicators. The configuration formats that surround the protocol — `server.json` (MCP Registry), MCP Server Cards (SEP-2127), and `mcp.json` (SEP-2633) — describe how a client _connects_ to a server, but none of them currently declare _which authentication methods a server supports_, or what an OAuth client needs that discovery cannot provide.

This SEP adds an `auth` block to the `Remote` shape shared by `server.json` and Server Cards. The block declares: an authentication posture (`none`, `optional`, `required`), a list of supported authentication methods (OAuth, static headers), and — for OAuth methods — the registration mode (`dynamic`, `client-metadata`, `static`), the required token-endpoint client credential type, and out-of-band Authorization Server endpoints when standard discovery is unavailable. It also adds two small validation hints (`pattern`, `maxLength`) to the existing `Input` shape so configuration UIs can validate user-supplied values.

These are exactly the facts a client needs to build a complete authentication flow and a configuration form _before_ the first MCP request. Today they live scattered across per-client README sections, hardcoded client allowlists, and trial-and-error 401 responses.

## Motivation

### The gap in the configuration formats

The three configuration formats describe progressively more concrete things:

| Format | Layer | Authentication coverage today |
| --- | --- | --- |
| `server.json` / Server Card (SEP-2127) | "What this server supports" | `headers[]` on the `Remote` shape — header-based auth only. **No OAuth declaration of any kind.** |
| `mcp.json` (SEP-2633) | "How this client will connect" | An `oauth` object with three fields: `clientId`, `scopes`, `redirectUri`. |

Both gaps prevent real servers from being configured automatically:

1. **A server that supports OAuth has no way to say so in its Server Card.** The `Remote` shape in SEP-2127 (and the underlying `server.schema.json`) declares headers via `KeyValueInput` but has no field for OAuth at all. A registry, IDE, or marketplace ingesting a Server Card cannot tell whether the server expects an OAuth flow, an API key, or nothing.

2. **A server that supports both OAuth and a static API key can declare neither as a choice.** `headers[]` is a flat list. There is no way to say "use OAuth, or alternatively send an API key" — common for servers whose enterprise customers prefer key-based service accounts while individual users prefer OAuth.

3. **A confidential OAuth client is unrepresentable.** `mcp.json`'s `oauth` object has no field for a client secret, a private key, or a client certificate. Servers whose Authorization Servers require `client_secret_post`, `client_secret_basic`, `private_key_jwt` (RFC 7523), or `tls_client_auth` (RFC 8705) cannot be expressed. The configuration falls back to a hand-rolled `Authorization` header, which abandons the OAuth flow entirely.

4. **Servers with non-standard discovery cannot be configured.** RFC 9728 / RFC 8414 discovery is the standard, but a meaningful fraction of real-world Authorization Servers do not publish `.well-known/oauth-authorization-server` or publish it incorrectly. Snowflake's Custom OAuth security integration, for example, exposes its endpoints at `/oauth/authorize` and `/oauth/token-request` and publishes no discovery document. There is no escape hatch in any of the configuration formats.

5. **Client ID Metadata Documents are unrepresentable.** [The CIMD Internet-Draft](https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/) defines a registration model where the `client_id` _is_ an HTTPS URL pointing to a metadata document — no DCR, no per-server pre-registration. A `clientId` field that contains an HTTPS URL cannot be distinguished from a static client identifier that happens to look like a URL. The connection behavior is completely different.

6. **Servers that accept anonymous requests but offer authenticated tools have no way to say so.** Many servers serve `initialize` and `tools/list` without authentication but require it for some `tools/call` operations, returning 401 lazily. A client that doesn't know this pre-authenticates unnecessarily; a client that doesn't know auth is _required_ wastes a round-trip on a guaranteed 401.

### The motivating consequence

SEP-2633's motivation section observes that the GitHub MCP server's documentation contains _eleven separate per-client configuration examples_. Standardizing the configuration format reduces eleven snippets to one, but only if that one snippet can express what eleven hand-written ones can. Today, the auth-related half of the format cannot.

A server publisher who wants their server to "just work" when discovered must today:

- maintain hardcoded knowledge in each client (which doesn't scale beyond a handful of curated servers), or
- maintain per-client README snippets (which is the problem SEP-2633 exists to solve), or
- only support DCR + PKCE + perfect RFC 8414 discovery (which excludes a large fraction of real Authorization Servers).

This SEP closes the gap by declaring the small set of authentication facts that cannot be discovered from RFC 9728 / RFC 8414 metadata at runtime.

### The discoverability principle

Conversely, this SEP deliberately _excludes_ everything that can be discovered. The MCP authorization specification already defines how a client learns the Authorization Server's `token_endpoint`, `authorization_endpoint`, `registration_endpoint`, `token_endpoint_auth_methods_supported`, `scopes_supported`, and `code_challenge_methods_supported` from `.well-known` metadata (RFC 8414) and how it learns which Authorization Server protects an MCP server from `.well-known/oauth-protected-resource` (RFC 9728). Storing those facts in a configuration document would create a copy that drifts from the source of truth.

A field belongs in the `auth` block only when no discovery channel can provide it: which authentication methods to offer, who registered the OAuth client, what kind of credential the client needs, and what the configuration UI should label its inputs. Everything else is the runtime's job.

## Specification

This SEP modifies the `Remote` and `Input` shapes used by `server.json` (MCP Registry) and Server Cards (SEP-2127). It uses the existing `KeyValueInput` shape for header declarations and introduces no new top-level documents.

### `Remote.auth`

A new optional `auth` field on the `Remote` shape declares the authentication methods a remote endpoint supports.

```jsonc
{
  "type": "streamable-http",
  "url": "https://mcp.example.com/mcp",
  "auth": {
    "posture": "required",      // "none" | "optional" | "required"
    "preferred": "oauth",       // optional: which method to preselect when there's a choice
    "methods": [
      { "type": "oauth", ... },
      { "type": "headers", ... }
    ]
  }
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `posture` | `"none"` \| `"optional"` \| `"required"` | No (default `"required"`) | Whether the server requires authentication for the MCP connection. See [Posture semantics](#posture-semantics). |
| `methods` | `AuthMethod[]` | No | The authentication methods the server supports. Each entry is one selectable option. MUST be empty when `posture` is `"none"`. SHOULD have at least one entry otherwise. At most one entry per `type`. |
| `preferred` | `string` | No | The `type` value of the method the configuration UI SHOULD preselect when more than one is offered. If absent or unrecognized, the first entry is preselected. |

#### Posture semantics

- **`none`** — The server requires no authentication. Every MCP method, including `initialize` and all `tools/call`, succeeds without credentials. `methods` MUST be empty. Clients MAY treat list responses as cacheable across users.
- **`optional`** — The server accepts unauthenticated connections (`initialize`, `tools/list` succeed without credentials) but some operations may require authentication and return `401 Unauthorized` lazily, per the MCP authorization specification. Clients SHOULD offer authentication during configuration; clients MAY connect without it.
- **`required`** — The server requires authentication before `initialize`. Clients MUST establish credentials before connecting. This is the default because it fails closed: a publisher who forgets to declare a posture gets an authenticated server, not an accidentally public one.

`optional` and `required` collect the same configuration inputs — there is no later moment to collect them. The distinction controls connection behavior, not the configuration form.

### `AuthMethod` (discriminated on `type`)

Each entry in `auth.methods` is one selectable authentication method. The `type` field is both the discriminator and the selector: there is at most one entry per `type`.

```ts
type AuthMethod = OAuthMethod | HeadersMethod;
```

#### `OAuthMethod`

```jsonc
{
  "type": "oauth",
  "registration": "dynamic",       // "dynamic" | "client-metadata" | "static"
  "clientId": "...",               // present when the publisher pre-registered a shared client
  "clientCredential": "none",      // "none" | "client_secret" | "private_key_jwt" | "tls_client_auth"
  "endpoints": {                   // out-of-band Authorization Server metadata
    "authorization": "/oauth/authorize",
    "token": "/oauth/token"
  },
  "headers": [ KeyValueInput ]     // optional: auxiliary headers sent alongside the bearer token
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | `"oauth"` | Yes | Discriminator. |
| `registration` | `"dynamic"` \| `"client-metadata"` \| `"static"` | No (default `"dynamic"`) | How the OAuth client is established. See [Registration modes](#registration-modes). |
| `clientId` | `string` | When `registration` is `"static"` and the publisher provides a shared client ID | The OAuth client identifier. See [Static registration and `clientId`](#static-registration-and-clientid). |
| `clientCredential` | `"none"` \| `"client_secret"` \| `"private_key_jwt"` \| `"tls_client_auth"` | No (default `"none"`) | The kind of token-endpoint client credential the client must present. `"none"` means a public client (PKCE only). See [Client credential types](#client-credential-types). |
| `endpoints` | `OAuthEndpoints` | No | Out-of-band Authorization Server endpoints, used when standard discovery is unavailable. MUST NOT be present when discovery works. See [Out-of-band Authorization Server metadata](#out-of-band-authorization-server-metadata). |
| `headers` | `KeyValueInput[]` | No | Additional HTTP headers the client MUST send on every MCP request alongside the OAuth bearer token. MUST NOT include a header named `Authorization` (case-insensitively) — the OAuth method owns that header. |

#### Registration modes

- **`dynamic`** — The client registers itself with the Authorization Server at runtime using RFC 7591 Dynamic Client Registration. No `clientId` is declared. The Authorization Server may issue a `client_secret` in the registration response, which the client stores. This is the default and the recommended mode for new servers, per the MCP authorization specification.

- **`client-metadata`** — The client identifier is an HTTPS URL pointing to a Client ID Metadata Document, per [draft-ietf-oauth-client-id-metadata-document](https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/). There is no registration step and no per-server state. The client supplies its own metadata document URL as `client_id`. No `clientId` is declared in the server's `auth` block (the URL belongs to the _client_, not the server). _Note: this mode depends on the MCP authorization specification adopting CIMD support; it is included here so the configuration format does not need a breaking change when it does._

- **`static`** — The OAuth client was pre-registered out of band with the Authorization Server. The `clientId` field carries the identifier when the publisher offers a shared client; when absent, each consumer registers its own client and supplies its identifier during configuration. See below.

#### Static registration and `clientId`

Static registration covers two distinct real-world arrangements:

1. **Publisher-shared client.** The server publisher pre-registered an OAuth client with the Authorization Server and offers it to all consumers. The publisher includes the `clientId` in the `auth` block. A confidential shared client is uncommon (sharing the secret is awkward) but not prohibited.

2. **Consumer-registered client.** Each consumer (user, organization) must register their own OAuth client with the Authorization Server — typical for enterprise IdPs and multi-tenant SaaS where the OAuth client lives in the consumer's tenant. The publisher omits `clientId` from the `auth` block; the configuration UI prompts for it.

The presence or absence of `clientId` distinguishes the two. A publisher MUST NOT include a `clientId` that consumers are expected to replace; a publisher MUST include the `clientId` when offering a shared client.

#### Client credential types

`clientCredential` declares what the configuration UI must collect and what the runtime must present at the token endpoint. It does NOT declare the wire encoding (`client_secret_post` vs `client_secret_basic`); that is read from the Authorization Server's `token_endpoint_auth_methods_supported` metadata (RFC 8414) at runtime.

- **`none`** — Public client. The client authenticates with PKCE only. Nothing is collected.
- **`client_secret`** — A shared secret per RFC 6749 §2.3.1. The configuration UI collects it as a secret value.
- **`private_key_jwt`** — A signed JWT client assertion per RFC 7523 §2.2. The configuration UI collects a private key. The signing algorithm is derived from the key bytes and constrained by `token_endpoint_auth_signing_alg_values_supported`.
- **`tls_client_auth`** — Mutual TLS per RFC 8705. The configuration UI collects a client certificate and its private key.

`clientCredential` is meaningful only when `registration` is `"static"` or `"client-metadata"`. For `"dynamic"`, the Authorization Server decides at registration time whether to issue a secret; the publisher does not know in advance and SHOULD NOT declare `clientCredential`.

#### Out-of-band Authorization Server metadata

`endpoints` carries the Authorization Server endpoints that RFC 8414 discovery would have provided, for servers whose Authorization Servers do not publish `.well-known/oauth-authorization-server`.

```jsonc
"endpoints": {
  "authorization": "/oauth/authorize",
  "token": "/oauth/token"
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `authorization` | `string` | Yes (when block present) | The `authorization_endpoint`. Either an absolute `https://` URL or an origin-relative path beginning with `/`. |
| `token` | `string` | Yes (when block present) | The `token_endpoint`. Same format constraints. |

When the values are origin-relative paths, the client resolves them against the Authorization Server's base URL discovered from the server's `.well-known/oauth-protected-resource` metadata (RFC 9728), or — falling back — against the MCP server's own origin. Origin-relative paths are preferred for multi-tenant servers where the path is fixed but the host varies per tenant.

`endpoints` MUST NOT be declared when RFC 8414 discovery succeeds. It is an exception, not a default. An empty `endpoints` object is invalid.

The constraints on this block are deliberately strict — see [Security Implications](#security-implications) for the IdP Mix-Up rationale:

- Both `authorization` and `token` MUST be present when the block is present.
- Both MUST be the same form: both origin-relative paths, or both absolute `https://` URLs.
- When absolute, both MUST share an origin.
- Values MUST NOT contain path-traversal segments (`..`), protocol-relative prefixes (`//`), whitespace, control characters, or percent-encoded path delimiters (`%2F`, `%2E`).
- `http://` is not permitted.

#### `HeadersMethod`

```jsonc
{
  "type": "headers",
  "headers": [ KeyValueInput ]
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | `"headers"` | Yes | Discriminator. |
| `headers` | `KeyValueInput[]` | Yes (non-empty) | HTTP headers that authenticate the request. The headers ARE the credential. The only method type that may declare a header named `Authorization`. |

`HeadersMethod` covers API-key and bearer-token authentication that does not use the OAuth flow. Each header is a `KeyValueInput`, so it carries everything a configuration UI needs (`description`, `isRequired`, `isSecret`, `placeholder`, `choices`, `default`, and the new `pattern` / `maxLength` from this SEP).

### Relationship to `Remote.headers`

The existing `Remote.headers` field describes HTTP headers required to _connect_ to the remote endpoint, irrespective of authentication. With this SEP, it remains for non-credential headers (a region selector, a tenant routing key, a content-negotiation hint). Credential headers SHOULD be declared inside an `AuthMethod` so that:

- A configuration UI can show "choose one" between OAuth and an API key.
- A client knows which headers to send with which method.
- A publisher can declare a server that supports both OAuth-with-an-auxiliary-routing-header AND a single API-key header, without ambiguity about which combination is valid.

For backward compatibility, a `Remote` with `headers` and no `auth` block is interpreted as an implicit `HeadersMethod` whose `headers` are the `Remote.headers` entries, with `posture: "required"` if any header has `isRequired: true` and `posture: "optional"` otherwise.

### `Input.pattern` and `Input.maxLength`

Two new optional fields on the existing `Input` shape:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `pattern` | `string` | No | A regular expression the configuration UI SHOULD validate the input against. Implementations SHOULD bound the length and complexity of accepted patterns to mitigate regular-expression denial of service. |
| `maxLength` | `number` | No | The maximum length of the input value. |

These are display/validation hints, not security controls. Clients MUST enforce their own limits on stored values regardless of `maxLength`.

### Interaction with `mcp.json` (SEP-2633)

This SEP defines the publisher-side declaration; `mcp.json` (SEP-2633) is the resolved client-side configuration. To make a resolved `mcp.json` self-sufficient when its source Server Card is unavailable, this SEP recommends the following additions to the `mcp.json` `oauth` object (proposed as review feedback on SEP-2633, not as normative text here):

- `oauth.registration` — the same `"dynamic" | "client-metadata" | "static"` value.
- `oauth.clientCredential` — the same enum, plus the corresponding interpolated secret slot (`clientSecret`, `privateKey`, `clientCertificate`, `clientPrivateKey`).
- `oauth.endpoints` — the same `OAuthEndpoints` shape.
- A top-level `auth` posture per remote entry, so a client knows whether to authenticate before `initialize`.
- A `serverCard` reference per entry resolving SEP-2633's open question about referencing the registry entry or Server Card.

### Worked examples

#### Public server with no authentication

```json
{
  "type": "streamable-http",
  "url": "https://mcp.example.com/mcp",
  "auth": { "posture": "none" }
}
```

#### Server supporting both OAuth (DCR) and an API key

```json
{
  "type": "streamable-http",
  "url": "https://mcp.example.com/mcp",
  "auth": {
    "posture": "required",
    "preferred": "oauth",
    "methods": [
      { "type": "oauth", "registration": "dynamic" },
      {
        "type": "headers",
        "headers": [
          { "name": "X-API-Key", "description": "API key from your account settings", "isRequired": true, "isSecret": true, "placeholder": "sk-..." }
        ]
      }
    ]
  }
}
```

#### Confidential client with consumer-registered OAuth app

```json
{
  "type": "streamable-http",
  "url": "https://{tenant}.example.com/mcp",
  "variables": { "tenant": { "description": "Your tenant subdomain", "isRequired": true } },
  "auth": {
    "posture": "required",
    "methods": [
      { "type": "oauth", "registration": "static", "clientCredential": "client_secret" }
    ]
  }
}
```

The client prompts for the tenant, the OAuth `client_id`, and the `client_secret` during configuration.

#### Server with non-standard Authorization Server discovery

```json
{
  "type": "streamable-http",
  "url": "https://{account}.snowflakecomputing.com/mcp",
  "variables": { "account": { "description": "Snowflake account identifier", "isRequired": true } },
  "auth": {
    "posture": "required",
    "methods": [
      {
        "type": "oauth",
        "registration": "static",
        "clientCredential": "client_secret",
        "endpoints": {
          "authorization": "/oauth/authorize",
          "token": "/oauth/token-request"
        }
      }
    ]
  }
}
```

The override paths are origin-relative because the Authorization Server host varies per account, but the path is the same for every account.

#### Optional auth — authenticate only for write tools

```json
{
  "type": "streamable-http",
  "url": "https://mcp.docs.example.com/mcp",
  "auth": {
    "posture": "optional",
    "methods": [
      { "type": "oauth", "registration": "dynamic" }
    ]
  }
}
```

The client connects without credentials, lists tools, and offers authentication when a tool returns 401.

## Rationale

### Why declare a menu, not a choice

A Server Card describes what a server supports; an `mcp.json` describes what one consumer chose. Putting `auth.methods` on the publisher-side document keeps the layering consistent with how SEP-2127 and SEP-2633 already split concerns — `server.json` is "highly configurable," `mcp.json` is "fully resolved." Without a menu, a server that supports both OAuth and an API key must publish two Server Cards.

### Why not store discoverable facts

`token_endpoint_auth_method`, `scopes`, signing algorithms, registration endpoints, and almost every other OAuth fact a client needs at runtime is available from RFC 8414 / RFC 9728 discovery or from the Authorization Server's responses. Storing a copy in a configuration document creates two sources of truth that can disagree. The `auth` block is constrained to facts the runtime cannot discover: which methods to offer, who registered the client, what kind of credential to collect, and where the Authorization Server's endpoints are when discovery is broken.

### Why posture is three-valued, not boolean

`required` and `none` are obvious. `optional` matters because the MCP authorization specification's lazy-401 model means many servers can legitimately serve `initialize` and `tools/list` to anonymous clients while gating individual tools. A boolean conflates "you must authenticate before connecting" with "you can authenticate if you want a better experience." Clients need to distinguish them: a client that doesn't know auth is required wastes a round-trip; a client that doesn't know auth is optional pre-authenticates everyone.

### Why `clientCredential` doesn't declare wire encoding

`client_secret_post` vs `client_secret_basic` is in the Authorization Server's `token_endpoint_auth_methods_supported` metadata (RFC 8414). A configuration document declaring it would either duplicate the metadata (drift risk) or override it (interop risk). Trying one and falling back to the other on failure is also unsafe — an authorization code is single-use, so a failed token request burns it.

### Why `endpoints` is an exception, not a default

The MCP authorization specification mandates RFC 8414 discovery. The `endpoints` block exists because a meaningful fraction of real Authorization Servers don't comply, and there is no other way to reach them. Making it the default would normalize bypassing discovery and weaken the spec's interoperability guarantees. Making it a constrained, validated exception keeps the default path the right one.

### Alternatives considered

- **Putting the auth declaration in `_meta`.** The `_meta` mechanism is for vendor-specific extension data. Authentication declaration is a core interoperability concern shared by every client that wants to configure a server automatically. Using `_meta` would lead to a fragmentation of vendor-specific shapes — the exact problem SEP-2633 motivates.
- **Putting the auth declaration in `mcp.json` only.** `mcp.json` is the resolved layer; it carries the answer, not the menu. A server publisher who wants their server discoverable needs the menu to live in the publisher-side document.
- **A separate `.well-known/mcp-auth-card`.** Adds a round-trip and a file format. The `Remote` shape is the natural home because auth is a property of a transport endpoint.
- **Declaring scopes.** SEP-2633's `oauth.scopes` enables the "two entries, two scope sets" pattern, which is a client-side resolution concern. Server Cards declare what's possible; the client and the Authorization Server negotiate scopes at runtime per RFC 6749 §3.3.

## Backward Compatibility

This SEP is fully backward compatible:

- `auth` is optional. Servers that don't declare it work exactly as today.
- Clients that don't understand `auth` ignore it and use existing 401-driven discovery.
- The implicit `HeadersMethod` interpretation of `Remote.headers` preserves the behavior of every existing Server Card.
- `Input.pattern` and `Input.maxLength` are additive optional fields.

Forward-compatibility note: a client that encounters an `AuthMethod` whose `type` it does not recognize SHOULD drop that entry and continue with the remaining methods; if no recognized method remains, the client SHOULD treat the server as requiring manual configuration. This lets the `methods` array gain new types (e.g., enterprise federated identity) without breaking older clients.

## Security Implications

### IdP Mix-Up via `endpoints`

A configuration document that points `authorization` at a legitimate identity provider and `token` at an attacker-controlled host enables an IdP Mix-Up attack: the user authorizes with the real IdP, and the client sends the resulting authorization code and PKCE verifier to the attacker. PKCE does not help because the client hands over the verifier voluntarily.

The mitigation is structural: `endpoints` requires both endpoints together, requires them to be the same form, and requires absolute URLs to share an origin. The split-origin shape the attack requires is unrepresentable. Path-traversal segments, protocol-relative prefixes, whitespace, control characters (CVE-2022-0391-class bypasses), and percent-encoded path delimiters are also rejected.

Clients consuming `endpoints` SHOULD additionally:

- Verify that the discovered Authorization Server metadata's `issuer` matches the issuer URL the `.well-known` suffix was inserted into, per RFC 8414 §3.3, and request and verify the `iss` parameter in the authorization response per RFC 9207.
- Send the RFC 8707 `resource` parameter on both the authorize and token requests.
- Pin the resolved endpoints for the lifetime of the OAuth flow; do not re-resolve mid-flow.
- Use their own `redirect_uri`; never accept one from the configuration document.

### Public Server Cards must not carry secrets

Server Cards are publicly accessible by design (SEP-2127). The `auth` block declares the _shape_ of authentication, never values. `clientId` is a public identifier. `clientCredential` is a discriminator. Headers declared in an `AuthMethod` describe what to collect, not what was collected.

### Trust boundary between publisher and client

The `auth` block is publisher-authored. Clients MUST treat it as untrusted input:

- A publisher SHOULD NOT be able to grant themselves elevated client capabilities through the `auth` block — for example, opt-in UI surfaces (MCP Apps), relaxed data-handling policies, or client-specific feature flags. Such capabilities, where a client supports them, MUST be controlled by the client's own policy, not by publisher declaration.
- A header declared in a publisher's `AuthMethod` should be sent only to that publisher's MCP server, never to the Authorization Server or any third party.
- `endpoints` should be applied only to the Authorization Server resolved from the server's own RFC 9728 metadata, never to an unrelated origin.

### Configuration UI input validation

`pattern` and `maxLength` are publisher-supplied. Clients MUST treat them as hints, not security controls. Clients SHOULD bound the length and complexity of `pattern` values to mitigate ReDoS, and SHOULD enforce their own absolute caps on stored values regardless of `maxLength`.

## Reference Implementation

A reference implementation is required before this SEP can reach Final status. The plan:

- A JSON Schema fragment for the `Auth`, `AuthMethod`, `OAuthMethod`, `HeadersMethod`, `OAuthEndpoints` shapes, integrated into the [experimental Server Card schema](https://github.com/modelcontextprotocol/experimental-ext-server-card).
- A set of example documents covering each registration mode, credential type, and posture.
- A validator that enforces the `endpoints` constraints from [Security Implications](#security-implications).

## References

- [MCP Authorization specification](https://modelcontextprotocol.io/specification/draft/basic/authorization)
- [SEP-2127: MCP Server Cards](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127)
- [SEP-2633: Standard Client-Side Configuration Format - mcp.json](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2633)
- [MCP Registry `server.json` schema](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/server-json/draft/server.schema.json)
- [RFC 6749: The OAuth 2.0 Authorization Framework](https://datatracker.ietf.org/doc/html/rfc6749)
- [RFC 7591: OAuth 2.0 Dynamic Client Registration Protocol](https://datatracker.ietf.org/doc/html/rfc7591)
- [RFC 7523: JSON Web Token (JWT) Profile for OAuth 2.0 Client Authentication](https://datatracker.ietf.org/doc/html/rfc7523)
- [RFC 8414: OAuth 2.0 Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414)
- [RFC 8705: OAuth 2.0 Mutual-TLS Client Authentication and Certificate-Bound Access Tokens](https://datatracker.ietf.org/doc/html/rfc8705)
- [RFC 8707: Resource Indicators for OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc8707)
- [RFC 9207: OAuth 2.0 Authorization Server Issuer Identification](https://datatracker.ietf.org/doc/html/rfc9207)
- [RFC 9728: OAuth 2.0 Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728)
- [draft-ietf-oauth-client-id-metadata-document: OAuth Client ID Metadata Document](https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/)

## Copyright

This document is placed in the public domain or under the CC0-1.0-Universal license, whichever is more permissive.
