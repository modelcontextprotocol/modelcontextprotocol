# SEP-2207: OIDC-Flavored Refresh Token Guidance

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-02-04
- **Author(s)**: Wils Dawson (@wdawson)
- **Sponsor**: Den Delimarsky (@localden)
- **PR**: #2207

## Abstract

This proposal provides guidance for MCP implementations that use OIDC-flavored
Authorization Servers regarding refresh token issuance and requests. The
`offline_access` scope is an OIDC concept that doesn't exist in pure OAuth 2.1,
creating ambiguity for clients and authorization servers about when to issue or
request refresh tokens. This SEP clarifies the expected behavior for both
Authorization Servers and MCP Clients when working with OIDC-based
authorization.

## Motivation

MCP's authorization mechanism is based on OAuth 2.1, but many real-world
deployments use Authorization Servers that implement OpenID Connect (OIDC). A
key difference between pure OAuth and OIDC is how refresh tokens are handled:

- In **pure OAuth 2.1**, there is no standard mechanism for a client to
  explicitly request a refresh token. The Authorization Server determines
  whether to issue one based on the client's capabilities (e.g., the
  `refresh_token` grant type in client metadata) and its own policies.
- In **OIDC**, the `offline_access` scope exists to allow clients to explicitly
  request refresh tokens, in addition to the OAuth logic.

This creates several problems in the MCP ecosystem:

1. **Clients aren't requesting refresh tokens**: Major MCP clients (Cursor,
   Claude, VS Code, etc.) aren't explicitly asking for refresh tokens via the
   `offline_access` scope because they don't know whether the Authorization
   Server supports, expects, or requires it.

2. **Resource servers shouldn't specify `offline_access`**: The `offline_access`
   scope is not a resource-specific scope—it's a concern between the client and
   Authorization Server. Including it in the `WWW-Authenticate` header's `scope`
   parameter or in the Protected Resource Metadata's `scopes_supported` would be
   semantically incorrect since it implies the resource _requires_ refresh
   tokens, which it never would.

3. **Authorization Servers need guidance**: When processing an authorization
   code grant, Authorization Servers need clear guidance on when to issue
   refresh tokens, especially when the client hasn't explicitly requested
   `offline_access`.

4. **Interoperability gap**: Without this guidance, implementations may behave
   inconsistently, leading to poor user experience (frequent re-authentication)
   or security issues (issuing refresh tokens to clients that can't securely
   store them).

## Specification

### Authorization Server Guidelines

1. **Client capability check**: The Authorization Server **SHOULD** check the
   client metadata for `refresh_token` in the `grant_types` field. If the client
   does not advertise support for the `refresh_token` grant, the Authorization
   Server **SHOULD NOT** issue a refresh token.

2. **Risk-based assessment**: The Authorization Server **SHOULD** determine
   based on its own risk assessment whether to issue a refresh token to clients
   that support them. This enables security policies such as:
   - Not issuing refresh tokens to newly-registered client domains until
     reputation is established
   - Requiring additional verification for high-risk clients
   - Implementing domain allowlists for refresh token issuance

3. **`offline_access` scope handling**: If the client requests the
   `offline_access` scope, the Authorization Server **MAY** treat this as
   equivalent to the client advertising `refresh_token` grant support in its
   client metadata. However, the risk-based assessment (point 2) still applies—
   requesting `offline_access` does not guarantee a refresh token will be
   issued.

### MCP Client Requirements

MCP Clients that desire refresh tokens **SHOULD** follow these guidelines:

1. **Advertise capability**: Clients **SHOULD** include `refresh_token` in their
   `grant_types` client metadata to indicate they support refresh tokens.

2. **Scope augmentation for OIDC Authorization Servers**: When the client
   desires a refresh token and the Authorization Server metadata contains
   `offline_access` in its `scopes_supported` field, the client **MAY** add the
   `offline_access` scope to the list of scopes from the resource server before
   making authorization requests to the Authorization Server.

3. **No guarantee**: Clients **MUST NOT** assume that advertising support or
   requesting `offline_access` guarantees they will receive a refresh token. The
   Authorization Server retains discretion based on its policies.

### MCP Server (Resource Server) Requirements

MCP Servers acting as OAuth 2.0 Protected Resources:

1. **SHOULD NOT** include `offline_access` in the `scope` parameter of
   `WWW-Authenticate` headers, as refresh tokens are not a resource requirement.

2. **SHOULD NOT** include `offline_access` in `scopes_supported` in Protected
   Resource Metadata, as it is not a resource-specific scope.

## Rationale

### Why not require `offline_access` in the 401 response?

The `offline_access` scope is fundamentally different from resource-specific
scopes. It represents a client's desire for long-lived access, not a
requirement of the resource. Per
[OAuth 2.1 Section 5.3.1](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-13#section-5.3.1),
the `scope` attribute in `WWW-Authenticate` indicates "the required scope of the
access token for accessing the requested resource." Since the resource doesn't
require `offline_access`, including it would be semantically incorrect.

### Why check client metadata for grant types?

OAuth 2.1 requires clients to register their supported grant types. A client
that doesn't support the `refresh_token` grant either:

- Cannot securely store refresh tokens
- Has no mechanism to use them

Issuing refresh tokens to such clients wastes Authorization Server resources
(tracking tokens that will never be used) and may pose security risks if the
tokens are leaked.

### Why allow `offline_access` as an alternative signal?

For deployments using strict OIDC Authorization Servers that only issue refresh
tokens when `offline_access` is requested, this provides a compatible path.
Clients can detect OIDC Authorization Servers by checking for `offline_access`
in `scopes_supported` and adapt their behavior accordingly.

### Alternative approaches considered

1. **Mandate `offline_access` in resource responses**: Rejected because it
   misrepresents the resource's requirements and creates an anti-pattern.

2. **Always issue refresh tokens**: Rejected because it ignores client
   capabilities and Authorization Server security policies.

3. **Separate OIDC-specific specification**: Rejected in favor of a unified
   approach that works for both pure OAuth and OIDC deployments.

## Backward Compatibility

This proposal is fully backward-compatible:

- Clients that already request `offline_access` continue to work
- Authorization Servers that already check client capabilities continue to work
- MCP Servers are not required to make any changes
- The guidance is additive and does not change existing required behavior

Implementations that don't follow this guidance may experience suboptimal
behavior (missing refresh tokens or unnecessary token issuance) but will remain
functional.

## Security Implications

### Positive security implications

1. **Reduced token leakage risk**: By not issuing refresh tokens to clients that
   don't advertise support, we reduce the risk of long-lived tokens being stored
   insecurely.

2. **Defense in depth**: The risk-based assessment gives Authorization Servers
   flexibility to implement additional security controls.

### Considerations

1. **Client metadata trust**: Authorization Servers should validate client
   metadata claims through appropriate mechanisms (Client ID Metadata Documents,
   pre-registration, etc.) rather than blindly trusting self-reported
   capabilities.

2. **Scope injection**: Clients adding `offline_access` should ensure this
   doesn't interfere with other scope-related logic or create unexpected
   authorization prompts.

## Reference Implementation

Reference implementations demonstrating this guidance will be provided in the
official MCP SDKs:

- **TypeScript SDK**: Client-side `offline_access` scope handling
- **Python SDK**: Client-side `offline_access` scope handling
- **Authorization Server example**: Demonstration of client capability checking

Links to implementations will be added once the SEP is accepted.

## Acknowledgments

This proposal was developed through discussion in the MCP Discord's
authorization channel, with input from:

- Aaron Parecki (OAuth/OIDC expertise)
- Paul Carleton (MCP authorization guidance)
- Simon Russell (OIDC deployment experience)
