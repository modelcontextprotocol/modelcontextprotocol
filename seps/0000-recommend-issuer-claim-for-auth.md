# SEP-2468: Recommend Issuer (iss) Claim in MCP Auth Responses

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-03-25
- **Author(s)**: Emily Lauber <emilylauber@microsoft.com> (@EmLauber)
- **Sponsor**: @pcarleton
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2468

## Abstract

This SEP proposes requiring the inclusion and validation of an explicit issuer (iss) claim in Model Context Protocol (MCP) authorization responses to mitigate authorization mix‑up attacks. By binding authorization responses to a specific authorization server identity, MCP clients can reliably detect and reject responses originating from an unexpected issuer, improving protocol robustness in multi‑identity provider (IdP) environments. This SEP follows the specifications defined in [RFC9207](https://datatracker.ietf.org/doc/rfc9207/)

## Motivation

The Model Context Protocol increasingly operates in environments where multiple authorization servers, identity providers, and intermediaries coexist. In such environments, OAuth 2.0 mix‑up attacks become a realistic threat. Mix-up attacks are when an attacker causes a client to associate an authorization response with the wrong authorization server, potentially leading to token leakage or privilege escalation.

OAuth specifications describes two mitigations for mix‑up attacks: requiring issuer (_iss_) claim or using a unique redirect_uri for each client. A unique redirect_uri is not viable in an MCP environment where dynamic registration is possible. As such, the recommendation is for MCP environments to leverage the issuer mitigation.

Requiring an explicit iss claim in MCP authorization responses provides a simple, interoperable, and well‑understood mechanism to bind responses to the correct authorization server and prevent mix‑up attacks by construction. Since not every authorization server sends the issuer claim though, this SEP proposes a MUST for clients to validate issuer if provided and a SHOULD for authorization servers supporting MCP scenarios. Future SEPs and releases may change the SHOULD to a MUST.

## Specification

### Issuer Claim Requirement

MCP authorization servers SHOULD include an issuer (_iss_) claim in authorization responses that result in the issuance of access tokens or authorization codes.

The _iss_ claim MUST:

- Exactly match the issuer identifier advertised via discovery or configuration
- Its value MUST be a URL that uses the "https" scheme without any query or fragment components.

### Client Validation Requirements

MCP clients MUST validate the _iss_ claim in authorization responses by:

- Determining the expected issuer for the authorization request
- Comparing the received _iss_ value against the expected issuer
- Rejecting the authorization response if the values do not match exactly

If issuer validation fails, the client MUST treat the response as invalid and abort the authorization flow.

Clients SHOULD continue to apply all existing OAuth security checks in addition to issuer validation.

## Rationale

The iss claim is already used in OpenID Connect and JWT‑based token validation. Extending its use to MCP authorization responses:

- Leverages existing ecosystem knowledge and tooling
- Avoids introducing MCP‑specific security mechanisms
- Provides a clear and auditable security for deployments

### Alternatives considered

Introducing MCP‑specific issuer binding fields

- Rejected in favor of reusing established OAuth/OIDC mechanisms.
  Requiring unique redirect_URI for each client
- Not feasible in MCP environments with dynamic or CIMD client registrations

## Backward Compatibility

This is additive security and does not impact backwards incompatibilities.

## TODO: Security Implications

Describe any security concerns related to this proposal, including:

- New attack surfaces
- Privacy considerations
- Authentication or authorization changes
- Data validation requirements

If there are no security implications, state that explicitly.

## TODO: Reference Implementation

Link to or describe a reference implementation. A reference implementation is required before any SEP can be given "Final" status.

The principle of "rough consensus and running code" is useful when resolving discussions of protocol details.

Include:

- Links to prototype code or pull requests
- Pointers to example usage
- Test results or validation

---

### TODO: Open Questions

Unresolved issues that need community input or further discussion.

### TODO: Acknowledgments

Credit to people who contributed ideas, feedback, or reviews.
