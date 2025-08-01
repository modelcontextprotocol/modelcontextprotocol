+++
date = '2025-07-22T10:00:00Z'
draft = true
title = 'Evolving OAuth Client Registration in the Model Context Protocol'
author = 'Paul Carleton (Core Maintainer)'
tags = ['security', 'authorization', 'announcement]
+++


The Model Context Protocol (MCP) has adopted OAuth 2.1 as the basis for its authorization framework.  A key part of this flow is client registration.  In this post, I'll explore how we're looking to evolve client registration to address pain points for server implementers while providing better protections for users.

If you're familiar with OAuth and the current state of client registration in MCP, skip to "the options forward" section.

## Background on OAuth

A system implementing OAuth 2.1 should allow the user to grant a client access to a resource, and prevent attempts to trick the user into granting access to a client they didn't intend to (e.g. phishing).

The high level flow for OAuth is:
1. The client sends the user to an authorization server
2. The authorization server displays a consent screen to the user
3. If the user approves the clients access, the authorization server redirects the user back to the client with an access code
4. The client exchanges the access code for an access token, which it saves
5. The client uses the access token in subsequent requests to access the resource

As part of this flow, the server needs a few pieces of information about the client:
1. **Client name**: Human readable text to display in the consent screen to help the user decide whether they want to grant access.
2. **Redirect URL**: The destination to send the authorization code back to if the user consents.

It's important that the server trust the information that it has about the client in order to prevent a malicious client from tricking a user into consenting access it didn't intend to.  For instance, if a malicious client could claim to be 'Claude Desktop' on the consent screen while actually being 'attacker.com', users might grant access thinking they're authorizing the legitimate Claude application.

(Note: we're specifically calling out redirect URLS)

## Client Registration: The Story So Far

### Pre-registration, by client developer

The most common and traditional way to build trust in this client information is via pre-registration.  This happens before a client starts its authorization flow. The client developer coordinates with the server to provide it information about itself including its name and redirect URL, and receives a client ID (and sometimes a secret).  The server can do whatever additional checks on the client it wants (e.g. identity verification, source code submission, contract negotiation etc.)

Pre-registration of clients is supported by MCP. For clients that have pre-existing relationships with MCP servers, pre-registration and distributing a client id is the simplest approach and similar to how OAuth is deployed most frequently.

### Pre-registration, by user

However, with MCP, it's common for a user to want to connect an MCP client to an MCP server the client has never seen before.  In that scenario, a client developer can't practically pre-register for that server since it may not have existed the last time the client developer shipped a release.

One option is for the user to go through the server's registration flow on behalf of the client. This requires the client to have a mechanism for the user to supply a client id and secret along with the server URL when connecting.

This works, but ends up putting a lot of work on the user, and either requires each additional user to go through the same amount of work, or invest in some other way of sharing a registered client ID safely among users (e.g within the same enterprise).

It does have the nice property that the user almost certainly trusts the client and redirect URL, otherwise they wouldn't go through so much effort to go through the registration flow with it.

### Dynamic Client Registration (DCR)

Another option that the MCP specification supports today is Dynamic Client Registration (DCR). In DCR, the Authorization Server provides a `/register` endpoint that the client can use to register "just in time" for the authorization flow.

This takes work off the user, and off the client, but has other tradeoffs the server implementer to consider. A server implementation needs to:
* rate limiting requests to an unauthenticated registration endpoint
* handle expiry of these records (challenging without open redirect risks), or allow for unbounded growth of client records
* determine how to trust the metadata the client is providing
  * This could be by limiting redirect URLs (e.g. allowing localhost, but requiring pre-registration or allowlisting of non-localhost) 
  * This could alternatively involve signed software statements if clients implement this. (see [this section](https://www.rfc-editor.org/rfc/rfc7591.html#appendix-A.2) in the DCR spec.)
* display a sensible revocation UI for users to review authorized clients
* find a way to revoke malicious clients without them just immediately re-registering

For these reasons, server implementors often very reasonably ask about best practices for DCR.  However, some of these difficulties are inherent to DCR and not actually that helpful for MCP's use case.  For example, in a common implementation, each user gets their own client ID even if they're using the same client application (e.g. Cursor). That's space and complexity for no benefit.

## Client Registration: the options forward

Let's recap what we want out of a client registration process, specifically for when a server and client don't have a pre-existing relationship:
1. Client developers don't need to go through a pre-registration flow and distribute a client ID.
2. Users don't need to go through a pre-registration flow and paste in client id with the server URL.
3. Server developers:
  1. have a way to trust the metadata they associate with a client (e.g. name and redirect URL)
  2. can have a single client ID per client for users to revoke access or the server to revoke access
  3. can selectively allow or deny clients
  4. do not need to handle an unbounded database or expiration flows

There are a few candidates to improve this situation:

1. Applying software statements to DCR
2. Using Client ID metadata as URLs.


### Software Statements with DCR

Sticking with DCR for a minute, one way to improve the situation is to define a particular way of implementing software statements.  DCR already solves (1) and (2), so we're looking specificaly at solving (3.1): trusting the metadata and seeing if we can solve the other issues as well.

A software statement involves the client publishing a JSON Web Key Set (JWKS), and then using the private key to sign a JSON Web Token (JWT) that attests to the clients legitimacy.

This provides the servers with a way to trust the client by deciding which JWKS to trust (or more likely the domain that hosts the JWKS).  It also allows the server to issue the same client ID for the same client used in different places, since it can trust the request is from the same client application. This addresses all the server issues above.

The cost for this implementation is:
* The client must host a JWKS on a https URL somewhere that the server will trust (even if the client isn't on the web e.g. a native application)
* The client must craft and sign a software statement
  * If the client is a native application, this requires using client specific authentication to gate access to the signing key on a remote endpoint.
* The server must fetch the JWKS URI and verify the statement during registration.


This is discussed more in depth in this Specification Enhancement Proposal (SEP) (TODO: link to SEP)

### Client ID Metadata Documents

Another promising solution to this problem is called "Client ID Metadata Documents" (described in [this draft RFC](https://datatracker.ietf.org/doc/draft-parecki-oauth-client-id-metadata-document/) and implemented by Bluesky).

In this approach, we skip the registration step altogether, and provide an https metadata URL as the client ID directly.  The server then fetches the metadata from the URL and uses it as the client's metadata. 

```mermaid
sequenceDiagram
   participant Client
   participant User
   participant AuthServer
   participant MetadataURL

   Client->>User: Start OAuth flow
   User->>AuthServer: Authorization request<br/>(client_id=https://app.com/oauth.json)
   AuthServer->>MetadataURL: GET https://app.com/oauth.json
   MetadataURL-->>AuthServer: {name: "App", redirect_uris: [...]}
   AuthServer->>User: Show consent screen<br/>("App wants access...")
   User->>AuthServer: Approve
   AuthServer-->>Client: Authorization code
   Client->>AuthServer: Exchange code for token<br/>(client_id=https://app.com/oauth.json)
   AuthServer-->>Client: Access token
```

Checking against our goals:
* The servers can trust the client metadata by trusting the domain the metadata is hosted on
* Servers will have a single client ID per client (the metadata URL)
* Servers can allow or deny clients based on their metadata URL or metadata domain
* Servers don't need to handle any database by default, as they can fetch the metadata at authorization time.

The costs for this implementation are:
* Clients need to host a metadata document on an https URL
* Clients must provide the URL as their client ID (if they determine an authorization server supports this)
* Servers need to fetch the metadata, opening egress on their authorization request

Client ID metadata can also be extended to require a JWKS and signed attestation at request time if desired.

This is discussed more in this SEP: (TODO: link to SEP).


## Comparison of Client Registration Approaches

| Approach | Client Developer Effort | User Effort | Server Trust in Metadata | Single Client ID per App | Selective Allow/Deny | Database Management |
|----------|------------------------|-------------|-------------------------|-------------------------|---------------------|-------------------|
| **Pre-registration (by developer)** | ❌ Must coordinate with each server | ✅ None - just connects | ✅ Full trust via manual verification | ✅ Yes | ✅ Full control | ✅ Simple, bounded |
| **Pre-registration (by user)** | ✅ None | ❌ Must register & manage credentials | ✅ User explicitly registers | ❌ Each user gets own ID | ✅ Full control | ⚠️ Grows with users |
| **Basic DCR** | ✅ None | ✅ None | ❌ Must trust self-asserted data | ❌ New ID per user/session | ⚠️ Limited (blocklists) | ❌ Unbounded growth or complex expiry |
| **DCR + Software Statements** | ⚠️ Must host JWKS & sign statements | ✅ None | ✅ Trust via domain/signature | ✅ Possible (via key identity) | ✅ Via trusted domains | ⚠️ Better but still needs storage |
| **Client ID Metadata** | ⚠️ Must host metadata document | ✅ None | ✅ Trust via domain | ✅ Yes (URL is ID) | ✅ Via domains | ✅ No storage needed* |

\* Servers may choose to cache for performance but aren't required to maintain a registration database

### Legend:
- ✅ Fully meets requirement
- ⚠️ Partially meets requirement / has caveats  
- ❌ Does not meet requirement


## Choosing a path forward

Over the next few weeks, we'll be discussing both SEP's in the links above, and intending to make a decision by the end of August.

Some notes worth knowing regardless of the SEP discussions above:
* It's **very unlikely** we'll remove DCR from the spec (e.g. in favor of Client ID Metadata Documents), as DCR already has adoption and removing it would cause a lot of churn.
* These proposals are not mutually exclusive, as we could keep DCR and recommend software statements while also adding support for client ID metadata documents.
* Both of these proposals require the Authorization server to open up potentially unbounded egress, so establishing patterns for doing this safely (e.g. avoiding internal network scans, SSRF, reflection attacks) will be important