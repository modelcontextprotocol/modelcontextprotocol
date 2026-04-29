# SEP-2468: Recommend Issuer (iss) Parameter in MCP Auth Responses

- **Status**: In-Review
- **Type**: Standards Track
- **Created**: 2026-03-25
- **Author(s)**: Emily Lauber (@EmLauber)
- **Sponsor**: @pcarleton
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2468

## Abstract

This SEP proposes recommending the inclusion and requiring the validation of an explicit issuer (iss) parameter in Model Context Protocol (MCP) authorization responses to mitigate authorization mix‑up attacks. By binding authorization responses to a specific authorization server identity, MCP clients can reliably detect and reject responses originating from an unexpected issuer, improving protocol robustness in multi‑identity provider (IdP) environments. This SEP follows the specifications defined in [RFC9207](https://datatracker.ietf.org/doc/rfc9207/).

## Motivation

The Model Context Protocol increasingly operates in environments where multiple authorization servers, identity providers, and intermediaries coexist. In such environments, OAuth mix‑up attacks become a realistic threat. Mix-up attacks are when an attacker causes a client to associate an authorization response with the wrong authorization server, potentially leading to token leakage or privilege escalation.

OAuth specifications describe two mitigations for mix‑up attacks: requiring issuer (_iss_) parameter or using a unique redirect_uri for each issuer a client interacts with. A unique redirect_uri per issuer is not possible with Client ID Metadata Documents (the recommended registration approach) and is operationally expensive with Dynamic Client Registration. As such, the recommendation is for MCP environments to leverage the issuer mitigation.

Requiring an explicit iss parameter in MCP authorization responses provides a simple, interoperable, and well‑understood mechanism to bind responses to the correct authorization server and prevent mix‑up attacks by construction. Since not every authorization server sends the issuer parameter though, this SEP proposes a MUST for clients to validate issuer if provided and a SHOULD for authorization servers supporting MCP scenarios. Future SEPs and releases may change the SHOULD to a MUST.

## Specification

### Issuer Parameter Requirement

MCP authorization servers SHOULD include an issuer (_iss_) parameter in authorization responses, including error responses, as defined in [RFC9207](https://datatracker.ietf.org/doc/html/rfc9207#section-2). Authorization servers that do so MUST advertise it by setting `authorization_response_iss_parameter_supported: true` in their authorization server metadata.

The `iss` parameter MUST:

- Exactly match the issuer identifier advertised via metadata discovery
- Be a URL that uses the `https` scheme without query or fragment components ([RFC 8414 Section 2](https://datatracker.ietf.org/doc/html/rfc8414#section-2))

### Client Validation Requirements

MCP clients MUST validate the _iss_ parameter in authorization responses by:

- Determining the expected issuer for the authorization request
- Comparing the received _iss_ value against the expected issuer
- Rejecting the authorization response if the values do not match exactly

If issuer validation fails, the client **MUST** treat the response as invalid and abort the authorization flow.

## Rationale

The iss value is already used in OpenID Connect and JWT‑based token validation. Extending its use to MCP authorization responses:

- Leverages existing ecosystem knowledge and tooling
- Avoids introducing MCP‑specific security mechanisms
- Provides a clear and auditable security for deployments

### Alternatives considered

Introducing MCP‑specific issuer binding fields

- Rejected in favor of reusing established OAuth/OIDC mechanisms.

Requiring unique redirect_uri per issuer

- CIMD metadata documents are static and cannot enumerate every issuer; with DCR it is technically possible but DCR has operational drawbacks in MCP deployments that make it undesirable to depend on for a security property. RFC 9207 works uniformly across registration approaches.

Discarding `iss` when the server does not advertise support (strict RFC 9207 §2.4 SHOULD)

- RFC 9207 §2.4 recommends that clients SHOULD discard responses carrying `iss` from servers that do not set `authorization_response_iss_parameter_supported`, but explicitly leaves the decision to local policy ("specific guidance is out of scope"). This SEP specifies comparison instead. The recorded issuer always comes from a metadata document the client has already validated per RFC 8414 §3.3, so a present `iss` can be checked against an authentic baseline; rejection on mismatch remains unconditional, so the only behavioral difference is accepting a response whose `iss` matches that baseline — which is not a relaxation. In practice, authorization servers often begin emitting `iss` before their metadata is updated, and discarding in that window would reject legitimate flows without security benefit.

## Backward Compatibility

The `iss` parameter is additive on the wire. Client validation introduces a behavioral change for hosts whose authorization server advertises `authorization_response_iss_parameter_supported: true` but whose callback handling does not yet pass `iss` to the SDK; those flows will be rejected until the host extracts `iss` from the redirect URI alongside `code`. SDKs are expected to widen callback signatures additively (e.g., an optional `iss` argument) so existing call sites continue to compile. Authorization servers that do not advertise support are unaffected. The accompanying RFC 8414 Section 3.3 metadata-validation requirement restates an existing RFC MUST; clients that were not already enforcing it may surface latent issuer misconfigurations on upgrade.

## Security Implications

This proposal is a mitigation against mix-up attacks; the security considerations for the mechanism itself are documented in [RFC9207 Section 4](https://datatracker.ietf.org/doc/html/rfc9207#section-4). In particular, the mitigation depends on clients establishing the expected issuer before redirecting and on the comparison being an exact simple string comparison. See also the MCP [security best practices](/docs/tutorials/security/security_best_practices).

## Reference Implementation

- Go SDK: [modelcontextprotocol/go-sdk#859](https://github.com/modelcontextprotocol/go-sdk/pull/859)
- TypeScript SDK: [modelcontextprotocol/typescript-sdk#1957](https://github.com/modelcontextprotocol/typescript-sdk/pull/1957)

Both record the expected issuer before redirect and compare any received `iss`, rejecting on absence only when the server advertises support.

---

### Acknowledgments

Thanks to Sam Morrow, Max Gerber, Aaron Parecki, Stephen Halter, Nate Barbettini, Karl McGuinness, and Den Delimarsky for reviews and discussion in the Auth Mix-Up Attack Prevention working group.
