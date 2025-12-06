# SEP-990: Enable enterprise IdP policy controls during MCP OAuth flows

- **Status**: Final
- **Type**: Standards Track
- **Created**: 2025-06-04
- **Author(s)**: Aaron Parecki (@aaronpk)
- **PR**: #646
- **Issue**: #990

## Abstract

This extension is designed to facilitate secure and interoperable authorization of MCP clients within corporate environments, leveraging existing enterprise identity infrastructure.

- For end users, this removes the need to manually connect and authorize the MCP Client to individual services within the organization.
- For enterprise admins, this enables visibility and control over which MCP Servers are able to be used within the organization.

## How Has This Been Tested?

We have an end to end implementation of this [here](https://github.com/oktadev/okta-cross-app-access-mcp), and in-progress MCP implementations with some partners.

## Breaking Changes

This is designed to augment the existing OAuth profile by providing an alternative when used under an enterprise IdP. MCP clients can opt in to this profile when necessary.

## Additional Context

For more background on this problem, you can refer to my blog post about this here:

[Enterprise-Ready MCP](https://aaronparecki.com/2025/05/12/27/enterprise-ready-mcp)

I also presented this at the MCP Dev Summit in May.

A high level overview of the flow is below:

```mermaid
sequenceDiagram
    participant UA as Browser
    participant C as MCP Client
    participant MAS as MCP Authorization Server
    participant MRS as MCP Resource Server
    participant IdP as Identity Provider

    rect rgb(255,255,225)
    C-->>UA: Redirect to IdP
    UA->>+IdP: Redirect to IdP
    Note over IdP: User Logs In
    IdP-->>-UA: IdP Authorization Code
    UA->>C: IdP Authorization Code
    C->>+IdP: Token Request with IdP Authorization Code
    IdP-->-C: ID Token
    end

    note over C: User is logged<br>in to MCP Client.<br>Client stores ID Token.

    C->+IdP: Exchange ID Token for ID-JAG
    note over IdP: Evaluate Policy
    IdP-->-C: Responds with ID-JAG
    C->+MAS: Token Request with ID-JAG
    note over MAS: Validate ID-JAG
    MAS-->-C: MCP Access Token

    loop
    C->>+MRS: Call MCP API with Access Token
    MRS-->>-C: MCP Response with Data
    end
```

> [!IMPORTANT]
> **State:** Ready to Review
