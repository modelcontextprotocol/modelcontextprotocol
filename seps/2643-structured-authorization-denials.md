# SEP-2643: Structured Authorization Denials

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-04-20
- **Author(s)**: Monmohan Singh (@monmohan)
- **Sponsor**: None (Will expect Nate Barbettini - WG Lead to update)
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2643

## Abstract

This SEP defines a transport-agnostic JSON-RPC authorization denial envelope for the Model Context Protocol. The envelope complements transport-level authorization challenges (HTTP `WWW-Authenticate` with Protected Resource Metadata), carrying failure classification, a retry correlation handle, and an extensible set of structured remediation hints for cases the transport cannot easily express. This SEP defines two initial remediation hint types and illustrates their use through two scenarios: URL-based approval composed with [MCP URL-mode elicitation](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation), and credential replacement using scopes and [OAuth Rich Authorization Requests (RFC 9396)](https://datatracker.ietf.org/doc/html/rfc9396). Further remediation hint types can be defined in follow-on SEPs without changes to the envelope. This SEP is fully backward compatible. Existing OAuth clients and libraries do not need to change as the envelope is additive.

## Motivation

1. **Stdio has no defined authorization challenge mechanism**: The MCP specification defines authorization procedures for the HTTP transport, including OAuth 2.1 flows, `WWW-Authenticate` challenges, and Protected Resource Metadata discovery. These mechanisms explicitly exclude stdio, which the specification directs to rely on credentials retrieved from the environment instead. As a result, a stdio MCP server that needs to reject a request on authorization grounds has no standard mechanism to communicate that the failure is an authorization problem, to indicate the nature of the required remediation, or to carry structured data the client can act on. Additionally, current guidance is that stdio servers that require OAuth remediation steps must handle the OAuth flow themselves and act as the OAuth client. This obscures the identity of the MCP client from other participants in the system.

2. **Support for signaling server-side state remediation**: Some authorization denials are not about the client's credential. The MCP server may deny a request because it has insufficient information to contact an external system, needs confirmation from the user, or another piece of server-side state must be established before the request can succeed. OAuth authorization challenges such as `insufficient_scope` or `invalid_token` are shaped around credential changes and do not cover this case. MCP has URL-mode elicitation as a primitive for out-of-band user interaction, but it is not itself an authorization denial signaling mechanism.

3. **Support for structured remediation data at denial**: OAuth 2.0 defines Rich Authorization Requests (RFC 9396) for conveying structured authorization requirements, but only as part of the authorization request flow. Adopted OAuth standards do not yet provide a way to carry such structured requirements back to the client at denial time. An IETF individual draft, `draft-zehavi-oauth-rar-metadata`, proposes a mechanism for HTTP by defining a new `WWW-Authenticate` error code, `insufficient_authorization_details`, with the structured data placed in a JSON response body. The draft is HTTP-specific, and this SEP proposes to adopt the same pattern at the JSON-RPC layer so it applies across MCP transports.

## Specification

### Authorization Denial Envelope

An MCP server that denies a JSON-RPC request on authorization grounds MAY return a JSON-RPC error whose `code` is `<AUTHORIZATION_DENIAL_TBD>` (integer value to be assigned, see Open Questions) and whose `data` contains an `authorization` object populated as defined in this section. The envelope is transport-agnostic.

The shape of the payload is:

```json
{
  "jsonrpc": "2.0",
  "id": 21,
  "error": {
    "code": "<AUTHORIZATION_DENIAL_TBD>",
    "message": "Authorization is required to continue.",
    "data": {
      "authorization": {
        "reason": "insufficient_authorization",
        "authorizationContextId": "authzctx_6f2b0d3e",
        "remediationHints": [
          {
            "type": "<remediation-type>"
            /* additional members determined by the remediation type */
          }
        ]
      }
    }
  }
}
```

The fields of the `authorization` object are defined as follows:

- `reason` (string, REQUIRED). Indicates that the failure is an authorization denial and classifies its general nature. This SEP defines a single value, `insufficient_authorization`. Additional values MAY be defined by future SEPs.
- `authorizationContextId` (string, OPTIONAL). A server-issued correlation handle. When the server includes this field, the client MUST echo it on retry as described in "Retry Echo via `_meta`". The handle is not authorization material, and the server MUST NOT rely on it for authorization decisions when the credential presented on retry is sufficient on its own.
- `remediationHints` (array of objects, OPTIONAL). Structured remediation hints carried at the JSON-RPC layer that complement any transport-level authorization challenge. Each hint is an object with:
  - a `type` field (string, REQUIRED), naming the remediation mechanism, and
  - zero or more additional members whose names and shapes are determined by the value of `type`.

  Clients MUST ignore remediation hints whose `type` they do not recognize.

The envelope is additive. When a transport-level authorization challenge is present, for example an HTTP `WWW-Authenticate` header, that challenge remains authoritative for driving the client's authorization flow. The envelope provides a transport-agnostic failure classification and, where applicable, structured data that the transport challenge cannot easily express. For stdio, where the MCP specification defines no transport-level authorization challenge mechanism, the envelope is the sole authorization denial signal.

### Retry Echo via `_meta`

When a server includes an `authorizationContextId` in the authorization denial envelope, the client MUST echo the value, verbatim, in the `_meta` block of the retry request under the key `io.modelcontextprotocol/authorization-context-id`.

Example retry after a denial carrying `authzctx_7c5d1d79`:

```json
{
  "jsonrpc": "2.0",
  "id": 18,
  "method": "tools/call",
  "params": {
    "name": "files.list_folder",
    "arguments": { "folderId": "fld_12345" },
    "_meta": {
      "io.modelcontextprotocol/authorization-context-id": "authzctx_7c5d1d79"
    }
  }
}
```

The `authorizationContextId` is a correlation handle. Servers MAY use it for state lookup (for example, a URL-elicitation outcome in Use Case 1) and for audit and telemetry. To preserve backward compatibility with clients that do not implement this SEP, servers MUST NOT reject a retry whose handle is absent or unresolvable. Authorization is always determined by the credential presented with the request.

### Use Case 1 — Server-side state remediation via URL approval

This use case covers denials where the client's credential is valid and does not need to change. Remediation requires an out-of-band user interaction at a URL, such as approving access or selecting resources, that changes server-side state. A representative example is a file picker in a cloud storage service, where the user's OAuth token is unchanged and the server records an approval tied to the user.

This use case composes with the MCP URL elicitation error (`URLElicitationRequiredError`, JSON-RPC error code `-32042`). The envelope MUST include a `remediationHints` entry of type `url`, and the URL elicitation remains in `data.elicitations` for backwards compatibility.

Example denial:

```json
{
  "jsonrpc": "2.0",
  "id": 17,
  "error": {
    "code": -32042,
    "message": "You need to approve access to the requested folder.",
    "data": {
      "authorization": {
        "reason": "insufficient_authorization",
        "authorizationContextId": "authzctx_7c5d1d79",
        "remediationHints": [{ "type": "url" }]
      },
      "elicitations": [
        {
          "mode": "url",
          "elicitationId": "el_550e8400-e29b-41d4-a716-446655440000",
          "url": "https://mcp.example.com/approve-folder-access?ctx=authzctx_7c5d1d79",
          "message": "Open this page to approve access to the requested folder."
        }
      ]
    }
  }
}
```

After the user completes the approval, the client retries the original request, echoing the `authorizationContextId` per "Retry Echo via `_meta`":

```json
{
  "jsonrpc": "2.0",
  "id": 18,
  "method": "tools/call",
  "params": {
    "name": "files.list_folder",
    "arguments": { "folderId": "fld_12345" },
    "_meta": {
      "io.modelcontextprotocol/authorization-context-id": "authzctx_7c5d1d79"
    }
  }
}
```

### Use Case 2 — Credential replacement with broader authorization

This use case covers denials where the client's existing credential carries insufficient authorization for the requested operation and remediation requires obtaining a new credential. The replacement may involve additional OAuth scopes, a Rich Authorization Requests `authorization_details` object (RFC 9396), or any other mechanism that yields a new credential. In contrast with Use Case 1, the failure cannot be resolved by server-side state changes alone.

The envelope and the transport challenge are complementary signals:

- The envelope always carries the `reason` classification, and additionally carries the `authorizationContextId` when the server issues one.
- The envelope MAY additionally carry `remediationHints` describing structured remediation data.
- When the transport declares its own remediation (for example, an HTTP `WWW-Authenticate` challenge), the transport-level signal is authoritative for driving reauthorization. The envelope is complementary metadata.

In UC2 on HTTP, this means: when the `WWW-Authenticate` challenge fully describes the remediation (Example 1, `insufficient_scope`), no `remediationHints` are included. When the challenge cannot fully describe the required authorization (Example 2, RAR), the envelope carries an `oauth_authorization_details` hint.

For the stdio transport, where the MCP specification defines no transport-level authorization challenge, the envelope is the sole authorization denial signal. The client or its hosting environment is responsible for acquiring or refreshing credentials out of band before the request is retried.

#### Example 1 — Scope challenge

Consider an MCP server where the `read` scope covers read-only tools (`files.list`, `files.get`) and the `write` scope is required for modifying tools (`files.update`). The client's access token holds only the `read` scope, and its call to `files.update` is denied:

```json
HTTP/1.1 403 Forbidden
WWW-Authenticate: Bearer error="insufficient_scope",
    scope="read write",
    resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 17,
  "error": {
    "code": "<AUTHORIZATION_DENIAL_TBD>",
    "message": "You must grant write access to proceed.",
    "data": {
      "authorization": {
        "reason": "insufficient_authorization",
        "authorizationContextId": "authzctx_8a3e1f4b"
      }
    }
  }
}
```

The client performs OAuth reauthorization using the transport challenge, obtains a new access token whose scope includes both `read` and `write`, and retries the original request with the new token in the `Authorization` header. The client echoes the `authorizationContextId` per "Retry Echo via `_meta`":

```http
POST /mcp HTTP/1.1
Host: mcp.example.com
Authorization: Bearer at_new
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 18,
  "method": "tools/call",
  "params": {
    "name": "files.update",
    "arguments": { "fileId": "fl_98765", "content": "..." },
    "_meta": {
      "io.modelcontextprotocol/authorization-context-id": "authzctx_8a3e1f4b"
    }
  }
}
```

#### Example 2 — Rich Authorization Requests remediation

When a denied request requires authorization beyond what OAuth scopes can express, the `WWW-Authenticate` challenge can signal that authorization is insufficient but cannot carry the structured requirements themselves. The server MAY supply those requirements inside the envelope so the client can construct its next authorization request directly, without additional metadata discovery. This approach mirrors the error-signaling pattern defined in [OAuth 2.0 RAR Metadata and Error Signaling](https://datatracker.ietf.org/doc/draft-zehavi-oauth-rar-metadata/02/) at the JSON-RPC layer.

An MCP server that denies a request because the access token lacks sufficient authorization details MAY return a `remediationHints` entry of type `oauth_authorization_details`. The entry's `authorization_details` member, when present, SHALL be an OAuth Rich Authorization Requests `authorization_details` array as defined in RFC 9396. On HTTP Transports, The server MUST still return an HTTP authorization challenge via `WWW-Authenticate`, which remains authoritative for remediation and discovery. The JSON-RPC remediation hint is supplemental and exists to carry an actionable `authorization_details` object inside the response body.

A client that recognizes the `oauth_authorization_details` hint MAY use the provided `authorization_details` directly in a subsequent OAuth authorization request. A client that does not recognize the hint SHOULD fall back to resource-metadata and authorization-server-metadata discovery to determine how to construct a valid authorization request.

Consider an MCP server that exposes a `payments.initiate` tool where initiating a payment requires authorization details bound to the payee and amount. The client's current access token does not carry such authorization details, and the call is denied:

```json
HTTP/1.1 403 Forbidden
WWW-Authenticate: Bearer error="insufficient_authorization_details",
    resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/payments",
    scope="payments:initiate"
Content-Type: application/json
Cache-Control: no-store

{
  "jsonrpc": "2.0",
  "id": 31,
  "error": {
    "code": "<AUTHORIZATION_DENIAL_TBD>",
    "message": "Current authorization is insufficient for this payment.",
    "data": {
      "authorization": {
        "reason": "insufficient_authorization",
        "authorizationContextId": "authzctx_pay_9f2c",
        "remediationHints": [
          {
            "type": "oauth_authorization_details",
            "authorization_details": [
              {
                "type": "payment_initiation",
                "actions": ["initiate", "status", "cancel"],
                "locations": ["https://mcp.example.com/payments"],
                "instructedAmount": {
                  "currency": "EUR",
                  "amount": "123.50"
                },
                "creditorName": "Merchant A",
                "creditorAccount": {
                  "iban": "DE02100100109307118603"
                },
                "remittanceInformationUnstructured": "Ref Number Merchant"
              }
            ]
          }
        ]
      }
    }
  }
}
```

The client uses the `authorization_details` from the remediation hint to construct an OAuth authorization request, per [RFC 9396#section-2](https://datatracker.ietf.org/doc/html/rfc9396#section-2):

```http
GET /authorize?
    response_type=code&
    client_id=client-123&
    redirect_uri=https%3A%2F%2Fclient.example.com%2Fcb&
    scope=payments%3Aapprove&
    authorization_details=%5B%7B...payment_initiation...%7D%5D HTTP/1.1
Host: as.example.com
```

After obtaining a new access token, the client retries the original request, echoing the `authorizationContextId`:

```json
POST /mcp HTTP/1.1
Host: mcp.example.com
Authorization: Bearer at_new
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 32,
  "method": "tools/call",
  "params": {
    "name": "payments.initiate",
    "arguments": {
      "amount": "123.50",
      "currency": "EUR",
      "creditorName": "Merchant A",
      "creditorAccount": "DE02100100109307118603",
      "remittanceInformationUnstructured": "Ref Number Merchant"
    },
    "_meta": {
      "io.modelcontextprotocol/authorization-context-id": "authzctx_pay_9f2c"
    }
  }
}
```

## Rationale

This SEP standardizes the smallest set of facts that an MCP client and server need to communicate after an authorization denial: what classification the failure has, how the retry is correlated, and what remediation posture the server can describe. Any further extensions, whether a new remediation type or a new transport binding, can be added additively for future needs without changing the envelope itself. For example, a future `remediationHints` type could describe a Client Initiated Backchannel Authentication (CIBA) flow, in which per-operation approvals occur on a separate channel such as a push notification rather than interrupting the foreground session.

The SEP composes with existing MCP primitives rather than inventing parallel shapes. Use Case 1 reuses MCP URL elicitation (`URLElicitationRequiredError`) and adds the envelope as sibling metadata inside the same error response. Clients that already understand URL elicitation continue to work unchanged, and clients that additionally understand the envelope receive transport-agnostic classification and a correlation handle.

### Future Extensions: Multi-Token Management

A class of authorization remediation is intentionally out of scope for this SEP. When remediation produces a credential intended to coexist with an existing credential rather than replace it, a generic MCP client needs additional facts that the OAuth surface does not yet provide. A stable reference identifying the authorization object would let the client compare and reuse credentials across requests, and an explicit usage-semantics signal would let the client retain or discard the resulting credential safely. A representative example is a banking client that holds a long-lived account-information credential and must obtain a separate short-lived authorization for each payment, while continuing to use the long-lived credential for other operations. A planned extension of [`draft-zehavi-oauth-rar-metadata`](https://datatracker.ietf.org/doc/draft-zehavi-oauth-rar-metadata/02/) introduces an `authorization_hint` member as the stable reference and a `usage_semantics` member to describe credential usage, and complementary work in the MCP Fine-Grained Authorization Working Group is exploring client-side strategies for managing multiple credentials. A follow-on SEP will address this additive-credential case and the associated client-side multi-credential semantics once that metadata and the client-side model converge. The envelope defined here is designed to accommodate the follow-on additively, through new remediation hint types or new envelope fields, without changing the structure introduced by this SEP.

### Alternatives Considered

**URL elicitation as the universal remediation primitive**

An alternative was considered in which all denial remediation would be modeled through MCP URL elicitation, so that every authorization denial surfaces as a URL the user opens in a browser. This was rejected as a universal primitive because URL elicitation's standardized follow-up is `notifications/elicitation/complete`, not the return of a credential to the client. URL elicitation therefore cannot safely model flows in which the remediation produces a new access token. The SEP adopts URL elicitation partially, for Use Case 1, where the remediation is server-side state set through user interaction and the client's credential does not change. Use Case 2, which produces a new credential, relies on OAuth rather than URL elicitation.

## Backward Compatibility

All changes introduced by this SEP are additive. The new JSON-RPC error code `<AUTHORIZATION_DENIAL_TBD>` is unknown to clients that do not implement this SEP, and such clients treat it as any other unrecognized error code and surface a generic failure to the caller. Members of `error.data` that a client does not recognize are ignored per common JSON-RPC practice.

Use Case 1 preserves the existing `-32042` URL elicitation error code and keeps `data.elicitations` at its existing location, so existing URL-elicitation clients process the error as they do today.

Transport-level authorization mechanisms are not modified, and existing OAuth libraries and resource-server configurations require no changes.

A client that does not implement this SEP does not echo `authorizationContextId` on retry. Per the Retry Echo requirement that servers not reject solely on handle absence, such a client continues to be evaluated on the credential it presents.

## Security Implications

### URL safe handling and phishing mitigation

The MCP URL elicitation specification's [safe URL handling](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation#safe-url-handling) and [phishing](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation#phishing) mitigation requirements apply to any URL carried in the denials with remediationHint of type `url`.

### Correlation handle is not authorization material

The `authorizationContextId` field is a correlation handle, not authorization material. The credential on the retry, not just the handle, is what determines whether the request is authorized.

### Information disclosure through remediation hints

Remediation hints describe what a client should do in response to a denial. They MUST NOT carry information that would itself require authorization to read, such as the identity of another user whose approval would be required or the contents of a resource the client cannot access.

### Client-side modification of `authorization_details`

A client MAY use the denial's `authorization_details` verbatim in a subsequent OAuth authorization request. The verbatim pattern is provided as a convenience.

Servers SHOULD structure `authorization_details` so that their contents are safe for the client to see.

Both the authorization server and the resource server are responsible for validating `authorization_details`. The authorization server validates against user consent and policy before issuing a token, and the resource server validates against the operation being requested on retry.

## Reference Implementation

TBD

## Open Questions

1. **JSON-RPC error code value**: The JSON-RPC error code introduced by this SEP is currently written as `<AUTHORIZATION_DENIAL_TBD>`. An integer value within the MCP error code range needs to be assigned before acceptance.

## Acknowledgments

This proposal was developed through discussion in the MCP Fine-Grained Authorization Working Group and refined across review cycles before being presented as a SEP, with input from:

- Nate Barbettini (MCP FGA Working Group lead)
- Yaron Zehavi (OAuth RAR/Payment Industry expertise; author of [OAuth 2.0 RAR Metadata and Error Signaling](https://datatracker.ietf.org/doc/draft-zehavi-oauth-rar-metadata/02/))
- Justin Richer (OAuth/RAR/GNAP expertise)
- Max Gerber (Design Reviews)
