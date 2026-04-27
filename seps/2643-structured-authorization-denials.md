# SEP-2643: Structured Authorization Denials

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-04-20
- **Author(s)**: Monmohan Singh (@monmohan)
- **Sponsor**: None (Will expect Nate Barbettini - WG Lead to update)
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2643

## Abstract

This SEP defines a transport-agnostic JSON-RPC authorization denial envelope for the Model Context Protocol. The envelope complements transport-level authorization challenges (HTTP `WWW-Authenticate` with Protected Resource Metadata), carrying failure classification, a retry correlation handle, and an extensible set of structured remediation hints for cases the transport cannot easily express. This SEP defines two initial remediation hint types and illustrates their use through three scenarios: URL-based approval composed with [MCP URL-mode elicitation](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation), credential replacement using scopes and [OAuth Rich Authorization Requests (RFC 9396)](https://datatracker.ietf.org/doc/html/rfc9396), and additional short-lived credentials for per-transaction operations like payment initiation in banking. Further remediation hint types can be defined in follow-on SEPs without changes to the envelope. This SEP is fully backward compatible. Existing OAuth clients and libraries do not need to change as the envelope is additive.

## Motivation

1. **Stdio has no defined authorization challenge mechanism**: The MCP specification defines authorization procedures for the HTTP transport, including OAuth 2.1 flows, `WWW-Authenticate` challenges, and Protected Resource Metadata discovery. These mechanisms explicitly exclude stdio, which the specification directs to rely on credentials retrieved from the environment instead. As a result, a stdio MCP server that needs to reject a request on authorization grounds has no standard mechanism to communicate that the failure is an authorization problem, to indicate the nature of the required remediation, or to carry structured data the client can act on.

2. **Support for signaling server-side state remediation**: Some authorization denials are not about the client's credential. The server may deny a request because user approval, resource selection, or another server-side state must be established through direct user interaction. OAuth authorization challenges such as `insufficient_scope` or `invalid_token` are shaped around credential changes and do not cover this case. MCP has URL-mode elicitation as a primitive for out-of-band user interaction, but it is not itself an authorization denial signaling mechanism.

3. **Support for structured remediation data at denial**: OAuth 2.0 defines Rich Authorization Requests (RFC 9396) for conveying structured authorization requirements, but only as part of the authorization request flow. Adopted OAuth standards do not yet provide a way to carry such structured requirements back to the client at denial time. An IETF individual draft, `draft-zehavi-oauth-rar-metadata`, proposes a mechanism for HTTP by defining a new `WWW-Authenticate` error code, `insufficient_authorization_details`, with the structured data placed in a JSON response body. The draft is HTTP-specific, and this SEP proposes to adopt the same pattern at the JSON-RPC layer so it applies across MCP transports.

4. **Support for additive credential flows**: OAuth 2.0 defines token lifetime through the `expires_in` parameter but does not define the lifecycle relationship between a newly-issued credential and any existing credential the client already holds. General-purpose clients therefore typically default to replacing the bearer token on new issuance, which does not support use cases where a short-lived credential for a specific operation is issued in addition to a long-lived credential held by the client. An example is a banking client that holds a long-lived account-information token and must obtain a separate short-lived per-payment authorization for each transaction, while continuing to use the long-lived token for other operations.

## Specification

### Authorization Denial Envelope

An MCP server that denies a JSON-RPC request on authorization grounds MAY return a JSON-RPC error whose `code` is `<AUTHORIZATION_DENIAL_TBD>` (integer value to be assigned, see Open Questions) and whose `data` contains an `authorization` object populated as defined in this section. The envelope is transport-agnostic and applies to both HTTP and stdio transports.

The conceptual shape is:

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
        "credentialDisposition": "<replacement | additional>",
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
- `credentialDisposition` (string, OPTIONAL). Describes the lifecycle relationship between a credential newly issued through the remediation flow and any existing credential held by the client. Defined values:
  - `replacement` (default). The newly-issued credential supersedes any existing credential for the same grant context. This matches current OAuth behavior and is the implicit default when `credentialDisposition` is absent.
  - `additional`. The newly-issued credential coexists with the existing credential. The client MUST retain the existing credential for its original purpose. The newly-issued credential's usable scope is determined by its grant, and the client selects the appropriate credential per request.

  The lifetime of an additional credential is governed by its OAuth `expires_in` value. Client-side management of additional credentials (storage, selection per request, cleanup after expiry) is an implementation concern outside the scope of this SEP. Servers that require single-use semantics for an additional credential SHOULD enforce single-use at the resource server.

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

Authorization of the retry is determined by the credential presented with the request, and the server MUST NOT reject a retry solely because the handle is absent or cannot be resolved.

### Use Case 1 — Server-side state remediation via URL approval

This use case covers denials where the client's credential is valid and does not need to change. Remediation requires an out-of-band user interaction at a URL, such as approving access or selecting resources, that changes server-side state. A representative example is a file picker in a cloud storage service, where the user's OAuth token is unchanged and the server records an approval tied to the user.

This use case composes with the MCP URL elicitation error (`URLElicitationRequiredError`, JSON-RPC error code `-32042`). The envelope MUST include a `remediationHints` entry of type `url`, and the URL elicitation remains in `data.elicitations`.

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

On the HTTP transport, the `WWW-Authenticate` challenge remains authoritative for driving the client's reauthorization. When the challenge fully describes the required remediation (for example `insufficient_scope` with the required scopes), the envelope functions as pure classification metadata carrying `reason` and an optional `authorizationContextId`. When the required authorization cannot be fully described at the transport layer, the envelope MAY carry a structured remediation hint as described in Example 2 below.

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

When a denied request requires authorization beyond what OAuth scopes can express, the `WWW-Authenticate` challenge can signal that authorization is insufficient but cannot carry the structured requirements themselves. The server MAY supply those requirements inside the envelope so the client can construct its next authorization request directly, without navigating the metadata discovery chain. This approach mirrors the error-signaling pattern defined in [OAuth 2.0 RAR Metadata and Error Signaling](https://datatracker.ietf.org/doc/draft-zehavi-oauth-rar-metadata/02/) at the JSON-RPC layer.

An HTTP MCP server that denies a request because the access token lacks sufficient authorization details MAY return a `remediationHints` entry of type `oauth_authorization_details`. The entry's `authorization_details` member, when present, SHALL be an OAuth Rich Authorization Requests `authorization_details` array as defined in RFC 9396. The server MUST still return an HTTP authorization challenge via `WWW-Authenticate`, which remains authoritative for remediation and discovery. The JSON-RPC remediation hint is supplemental and exists to carry an actionable `authorization_details` object inside the response body.

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

The client uses the `authorization_details` from the remediation hint to construct an OAuth authorization request:

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
      "remittanceInformation": "Ref Number Merchant"
    },
    "_meta": {
      "io.modelcontextprotocol/authorization-context-id": "authzctx_pay_9f2c"
    }
  }
}
```

### Use Case 3 — Additional short-lived credential

This use case covers denials where the client's existing credential remains valid for its original purpose but is not sufficient for a specific, typically sensitive operation. Unlike Use Case 2, the remediation does not replace the existing credential. The client obtains a new short-lived credential scoped to the operation and continues to use the original credential for other requests. A representative example is a banking client that holds a long-lived account-information token and must obtain a separate short-lived authorization for each payment, typically bound to transaction-specific details such as the payment's amount and payee.

This use case differs from Use Case 2 by credential lifecycle rather than by remediation mechanism. The structured remediation payload MAY be identical to the Rich Authorization Requests remediation shown in Use Case 2 Example 2 (for example an `oauth_authorization_details` hint carrying an RFC 9396 `authorization_details` array). What distinguishes Use Case 3 is that the resulting credential coexists with the existing one, which the server signals by setting `credentialDisposition` to `additional` in the envelope.

#### Example

Consider an MCP server that exposes both account-information tools requiring a long-lived `accounts:read` credential and a `payments.initiate` tool that requires per-transaction authorization. The client's current token is valid for `accounts:read` but does not carry authorization for the specific payment, and the call is denied:

```json
HTTP/1.1 403 Forbidden
WWW-Authenticate: Bearer error="insufficient_authorization_details",
    resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/payments",
    scope="payments:initiate"
Content-Type: application/json
Cache-Control: no-store

{
  "jsonrpc": "2.0",
  "id": 45,
  "error": {
    "code": "<AUTHORIZATION_DENIAL_TBD>",
    "message": "This payment requires an additional transaction-specific authorization.",
    "data": {
      "authorization": {
        "reason": "insufficient_authorization",
        "credentialDisposition": "additional",
        "authorizationContextId": "authzctx_pay_ab7c",
        "remediationHints": [
          {
            "type": "oauth_authorization_details",
            "authorization_details": [
              {
                "type": "payment_initiation",
                "actions": ["initiate"],
                "locations": ["https://mcp.example.com/payments"],
                "instructedAmount": {
                  "currency": "EUR",
                  "amount": "123.50"
                },
                "creditorName": "Merchant A",
                "creditorAccount": {
                  "iban": "DE02100100109307118603"
                },
                "remittanceInformationUnstructured": "Invoice 4711"
              }
            ]
          }
        ]
      }
    }
  }
}
```

The client uses the `authorization_details` from the remediation hint to obtain a new access token scoped to the specific payment. It retains its existing `accounts:read` token for subsequent account-information calls and retries the `payments.initiate` request with the newly-issued token:

```http
POST /mcp HTTP/1.1
Host: mcp.example.com
Authorization: Bearer at_pay_new
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 46,
  "method": "tools/call",
  "params": {
    "name": "payments.initiate",
    "arguments": {
      "amount": "123.50",
      "currency": "EUR",
      "creditorName": "Merchant A",
      "creditorAccount": "DE02100100109307118603",
      "remittanceInformation": "Invoice 4711"
    },
    "_meta": {
      "io.modelcontextprotocol/authorization-context-id": "authzctx_pay_ab7c"
    }
  }
}
```

Subsequent account-information calls from the same client continue to use the original `accounts:read` token.

## Rationale

This SEP standardizes the smallest set of facts that an MCP client and server need to communicate after an authorization denial: what classification the failure has, how the retry is correlated, and what remediation posture the server can describe. Any further extensions, whether a new remediation type or a new transport binding, can be added additively for future needs without changing the envelope itself. For example, a future `remediationHints` type could describe a Client Initiated Backchannel Authentication (CIBA) flow, in which per-operation approvals occur on a separate channel such as a push notification rather than interrupting the foreground session.

The SEP composes with existing MCP primitives rather than inventing parallel shapes. Use Case 1 reuses MCP URL elicitation (`URLElicitationRequiredError`) and adds the envelope as sibling metadata inside the same error response. Clients that already understand URL elicitation continue to work unchanged, and clients that additionally understand the envelope receive transport-agnostic classification and a correlation handle.

### Alternatives Considered

**URL elicitation as the universal remediation primitive**

An alternative was considered in which all denial remediation would be modeled through MCP URL elicitation, so that every authorization denial surfaces as a URL the user opens in a browser. This was rejected as a universal primitive because URL elicitation's standardized follow-up is `notifications/elicitation/complete`, not the return of a credential to the client. URL elicitation therefore cannot safely model flows in which the remediation produces a new access token. The SEP adopts URL elicitation partially, for Use Case 1, where the remediation is server-side state set through user interaction and the client's credential does not change. Use Cases 2 and 3, which produce new credentials, rely on OAuth rather than URL elicitation.

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

### Single-use enforcement for `credentialDisposition: additional`

For `credentialDisposition: additional`, single-use or per-operation constraints on the additional credential are not security boundaries when expressed client-side. Servers that require them SHOULD enforce them at the resource server.

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
