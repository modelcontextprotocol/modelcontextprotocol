# SEP-1336: User Agent Guidance for Client Implementations

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2025-08-11
- **Author(s)**: Luca Chang (@LucaButBoring)
- **Sponsor**: Nick Aldridge (@000-000-000-000-000)
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1336

# Abstract

This SEP proposes guidance for client implementations regarding the `User-Agent` header. The proposal defines a standard format for informative user agents including the host application name, operating system, and programming language; additional metadata is allowed, but is deliberately left unspecified by this proposal.

# Motivation

Service owners use HTTP request logs as a tool for debugging client/server incompatibilities and evaluating the impact of operational events, and the `User-Agent` header is often one data point informing response decisions. Today, the official MCP SDKs leave the user agent unspecified, relying on the default values provided by their respective HTTP request libraries. This makes it difficult to distinguish between requests originating from specific SDK versions, leaving service owners to directly ask users for relevant runtime information and delaying turnaround times when operational events occur. Encouraging client implementations to use descriptive user agents will remediate this in many cases.

# Specification

Client implementations **SHOULD** use the following format by default for their `User-Agent` header when sending HTTP requests:

```
APPLICATION_NAME[/APPLICATION_VERSION] [os/PLATFORM[#PLATFORM_RELEASE]] [lang/LANG[#LANG_VERSION]] [md/SDK_NAME[#SDK_VERSION]] [md/KEY[#VALUE]]
```

The first component of the user agent contains any applicable application name and version. Client implementations **MAY** use a different product name if necessary, to be compliant with [RFC 9110](https://httpwg.org/specs/rfc9110.html#rfc.section.10.1.5). The optional `os` component contains the current platform and optional platform version. The optional `lang` component contains the application's programming language and optional language version. The user agent **MAY** contain one or more `md` components for additional metadata, containing a key and an optional value. If available, implementations **SHOULD** include an `md` component containing an applicable SDK name and version.

For example, a version `v1.0.0` of `my-agent` running on Windows, using Java `21.0.7`, might have the following user agent:

```
my-agent/1.0.0 os/win32#10.0.22000 lang/java#21.0.7
```

As a more complex example, consider a version `v1.0.0` of `my-agent` running on MacOS, using `v1.25.3` of the official MCP SDK for TypeScript on Node.js `v22.13.1`. In that scenario, the client implementation might set the following user agent:

```
my-agent/1.0.0 os/darwin#24.5.0 lang/js md/nodejs#22.13.1 md/mcp-ts-sdk#1.25.3
```

Note that the language does not have a version component, as a version of JavaScript would be ambiguous; however, the runtime version is meaningful, and is included as an `md` component. Note also that the choice of SDK identifier does not match that of the true MCP SDK; in the case of TypeScript, the canonical identifier is `@modelcontextprotocol/sdk`. The characters `@` and `/` are not permitted in user agents, so a different identifier must be chosen for this purpose.

Server implementations **MUST NOT** make any assumptions or alter protocol behavior based on the user agent, as client implementations may diverge from this format in certain cases, such as when supporting overriding user agents with arbitrary values.

PR: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1336

# Rationale

The proposed solution is low-overhead and well-suited to existing reverse-proxies such as Nginx and Traefik, which already support logging user agents in request logs. It is also extensible to including additional metadata should SDK implementations determine such information is useful or necessary.

The proposed format does not include the MCP protocol version, as this is already provided in the `MCP-Protocol-Version` header.

# Backward Compatibility

This proposal is fully backwards-compatible, as no client implementations or protocol features currently rely on particular user agent representations, nor should they.

# Security Implications

As noted in [RFC 9110](https://httpwg.org/specs/rfc9110.html#field.user-agent), user agents with extremely detailed information put users at risk of fingerprinting. While the proposed default user agent does not include information that exposes users to any significant risk, client implementations that go beyond what is suggested in this proposal must be mindful of this possibility.

# Reference Implementation

A reference implementation is currently provided [here](https://github.com/modelcontextprotocol/typescript-sdk/pull/872).
