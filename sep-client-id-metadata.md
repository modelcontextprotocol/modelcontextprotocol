# SEP: OAuth Client ID Metadata Documents for MCP

**Title**: OAuth Client ID Metadata Documents for Model Context Protocol  
**Author**: Paul Carleton (pcarleton@anthropic.com)  
**Status**: Draft  
**Type**: Standards Track  
**Created**: 2025-07-28  

## Abstract

This SEP proposes adopting OAuth Client ID Metadata Documents as specified in draft-parecki-oauth-client-id-metadata-document-03 as an additional client registration mechanism for the Model Context Protocol (MCP). This approach allows OAuth clients to use HTTPS URLs as client identifiers, where the URL points to a JSON document containing client metadata. This specifically addresses the common MCP scenario where servers and clients have no pre-existing relationship, enabling servers to trust clients without pre-coordination while maintaining full control over access policies.

## Motivation

The Model Context Protocol currently supports two client registration approaches:

1. **Pre-registration**: Requires either client developers or users to manually register clients with each server
2. **Dynamic Client Registration (DCR)**: Allows just-in-time registration but creates significant implementation burden for servers

Both approaches have significant limitations for MCP's use case where clients frequently need to connect to servers they've never encountered before:

- Pre-registration by developers is impractical as servers may not exist when clients ship
- Pre-registration by users creates poor UX requiring manual credential management
- DCR requires servers to manage unbounded databases, handle expiration, and trust self-asserted metadata

### The Target Use Case: No Pre-existing Relationship

This proposal specifically targets the common MCP scenario where:
- A user wants to connect a client to a server they've discovered
- The client developer has never heard of this server
- The server operator has never heard of this client
- Both parties need to establish trust without prior coordination

For scenarios with pre-existing relationships, pre-registration remains the optimal solution. However, MCP's value comes from its ability to connect arbitrary clients and servers, making the "no pre-existing relationship" case critical to address.

### Key Innovation: Server-Controlled Trust Without Pre-Coordination

Client ID Metadata Documents enable a unique trust model where:

1. **Servers can trust clients they've never seen before** based on:
   - The HTTPS domain hosting the metadata
   - The metadata content itself
   - Domain reputation and security policies

2. **Servers maintain full control** through flexible policies:
   - **Open Servers**: Can accept any HTTPS client_id, enabling maximum interoperability
   - **Protected Servers**: Can restrict to trusted domains or specific clients
   - **Dynamic Policies**: Can adjust trust requirements based on resources accessed

3. **No client pre-coordination required**:
   - Clients don't need to know about servers in advance
   - Clients just need to host their metadata document
   - Trust flows from the client's domain, not prior registration

## Specification Changes

The change to the specification will be adding Client ID Metadata documents as a SHOULD, and changing DCR as a MAY, as we think that Client ID Metadata documents are a better default option for this scenario.

We will primarily rely on the text in the linked RFC.

Example metadata document:
```json
{
  "client_id": "https://app.example.com/oauth/client-metadata.json",
  "client_name": "Example MCP Client",
  "client_uri": "https://app.example.com",
  "logo_uri": "https://app.example.com/logo.png",
  "redirect_uris": [
    "http://127.0.0.1:3000/callback",
    "http://localhost:3000/callback"
  ],
  "grant_types": ["authorization_code"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none"
}
```



### Integration with Existing MCP Auth

This proposal adds Client ID Metadata Documents as a third registration option alongside pre-registration and DCR. Servers MAY support any combination of these approaches:

- Pre-registration remains unchanged
- DCR remains unchanged
- Client ID Metadata Documents are detected by URL-formatted client_ids

## Rationale

### Why This Solves the "No Pre-existing Relationship" Problem

Unlike pre-registration which requires coordination, or DCR which requires servers to manage a registration database, Client ID Metadata Documents provide:

1. **Verifiable Identity**: The HTTPS URL serves as both identifier and trust anchor
2. **No Coordination Needed**: Clients publish metadata, servers consume it
3. **Flexible Trust Policies**: Servers decide their own trust criteria without requiring client changes
4. **Stable Identifiers**: Unlike DCR's ephemeral IDs, URLs are stable and auditable

### Critical Security Property: Redirect URI Attestation

A key security benefit of Client ID Metadata Documents is attestation of redirect URIs:

1. **The metadata document cryptographically binds redirect URIs to the client identity** via HTTPS
2. **Servers can trust that redirect URIs in the metadata are controlled by the client** - not attacker-supplied
3. **This prevents redirect URI manipulation attacks** common with self-asserted registration

However, **localhost redirect URIs remain impersonatable**:
- Any application can bind to localhost ports
- Multiple clients may legitimately use `http://localhost:PORT/callback`
- Servers SHOULD display additional warnings for localhost-only clients
- Production deployments SHOULD use non-localhost redirect URIs when possible

### Alternatives Considered

1. **Enhanced DCR with Software Statements**: More complex, requires JWKS hosting and JWT signing
2. **Mandatory Pre-registration**: Poor developer and user experience for MCP's distributed ecosystem
3. **Status Quo**: Continues current pain points for server implementers
4. **Separate Protocols**: Could have different flows for open vs protected, but adds complexity

### Community Consensus

This proposal addresses feedback from multiple MCP server implementers struggling with DCR complexity while maintaining the ease of connection that makes MCP valuable.

## Backward Compatibility

This proposal is fully backward compatible:

- Existing pre-registered clients continue working unchanged
- Existing DCR implementations continue working unchanged
- Servers can adopt Client ID Metadata Documents incrementally
- Clients can detect support and fall back to other methods

## Reference Implementation

A reference implementation will be provided demonstrating:
(TODO: link typescript PR)

1. Client-side metadata document hosting
2. Server-side metadata fetching and validation
3. Integration with existing MCP OAuth flows
4. Proper error handling and fallback behavior

## Security Implications

### Trust Model

- Trust derives from the HTTPS domain hosting the metadata
- Servers SHOULD implement domain reputation/allowlisting
- Users SHOULD see the client's hostname during authorization
- Redirect URIs are attested by the domain

### Attack Mitigation

1. **Phishing Prevention**: Display client hostname prominently
2. **SSRF Protection**: Validate URLs, limit response size, timeout requests, rate limit outbound requests

### Best Practices

- Implement rate limiting on metadata fetches
- Consider additional warnings for new/unknown domains
- Log metadata fetch failures for monitoring

## Implementation Considerations

### For MCP Clients

- Host metadata at a stable HTTPS URL
- Include in documentation/distribution
- Implement fallback to DCR if needed
- Keep metadata document small (<5KB)

### For MCP Servers  

- Add URL validation for client_ids
- Implement secure HTTP fetching (e.g. prevent internal network scans)
- Add appropriate caching logic
- Update consent UI to show hostname
- Consider domain allowlisting options

### Migration Path

1. Authorization Servers add Client ID Metadata support, indicated in their OAuth metadata
2. Clients begin including metadata URLs
3. Gradual migration from DCR where appropriate
4. Pre-registration remains for high-trust scenarios

## References

- [draft-parecki-oauth-client-id-metadata-document-03](https://www.ietf.org/archive/id/draft-parecki-oauth-client-id-metadata-document-03.txt)
- [OAuth 2.1](https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/)
- [RFC 7591 - OAuth 2.0 Dynamic Client Registration](https://www.rfc-editor.org/rfc/rfc7591.html)
- [MCP Specification - Authorization](https://modelcontextprotocol.org/docs/spec/authorization)