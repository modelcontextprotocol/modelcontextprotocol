# SEP-0000: Tool Authorization Manifest for MCP Servers

## Preamble

|Field       |Value                                      |
|------------|-------------------------------------------|
|**Title**   |Tool Authorization Manifest for MCP Servers|
|**Author**  |Leon Cört                                  |
|**Status**  |Draft                                      |
|**Type**    |Standards Track                            |
|**Created** |2026-03-08                                 |
|**Requires**|SEP-990, SEP-1046                          |

-----

## Abstract

This SEP extends the MCP server capability model with a **Tool Authorization Manifest (TAM)**: a machine-readable declaration of the authorization requirements for each tool function exposed by a server. It also defines an optional **authorization checkpoint hint** that signals to the MCP host that tool calls SHOULD be evaluated against an external Policy Decision Point before execution.

-----

## Motivation

MCP’s existing authorization layer (OAuth, SEP-990, SEP-1046) establishes who may connect to a server. It does not express what a connected client may do within that session.

Today, once a client is authenticated, it has undifferentiated access to all tools a server exposes. There is no protocol-level mechanism to declare that one function requires elevated roles, that another requires human approval, or that a resource is classified as restricted. Hosts and clients must either hardcode these requirements or leave them unenforceable.

This SEP adds the minimal protocol surface needed to make tool-level authorization requirements machine-readable and interoperable — without mandating a specific policy engine or enforcement architecture.

-----

## Specification

### 1. Capability Advertisement

A server that implements this extension MUST advertise it during the MCP initialization handshake:

```json
{
  "capabilities": {
    "tools": {
      "listChanged": true,
      "authorizationManifest": true
    }
  }
}
```

### 2. Manifest Retrieval

Clients MAY request the TAM after initialization:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/authorizationManifest",
  "params": {}
}
```

### 3. Manifest Schema

The server responds with a manifest object:

```json
{
  "schemaVersion": "1.0",
  "serverId": "acme-database-server",
  "tools": {
    "database": {
      "functions": {
        "query": {
          "requiredRoles": ["data-reader"],
          "resourceClassification": "confidential",
          "requiresHumanApproval": false,
          "auditRequired": true
        },
        "delete": {
          "requiredRoles": ["data-admin"],
          "resourceClassification": "restricted",
          "requiresHumanApproval": true,
          "auditRequired": true
        }
      }
    }
  }
}
```

**Field definitions:**

|Field                   |Type    |Required|Description                                                                     |
|------------------------|--------|--------|--------------------------------------------------------------------------------|
|`requiredRoles`         |string[]|Yes     |Roles the calling agent must possess. All listed roles required (AND semantics).|
|`resourceClassification`|enum    |No      |`public`, `internal`, `confidential`, `restricted`                              |
|`requiresHumanApproval` |boolean |No      |Host SHOULD pause and request human confirmation before forwarding              |
|`auditRequired`         |boolean |No      |Host SHOULD emit an audit log entry for this call regardless of outcome         |

### 4. TAM Integrity and Scope

The TAM declares the **server’s own requirements**. It is a hint to the host and to external policy systems — not a substitute for them. A host or Policy Decision Point MAY enforce stricter requirements than the TAM declares. The TAM MUST NOT be surfaced to agent prompts, as it is infrastructure metadata that should remain invisible to the agent.

Parameter-level constraints (e.g. maximum values, allowed field values) are intentionally excluded from the TAM. These are organizational policy decisions that vary per deployment and belong in the external policy engine, not in the server declaration.

-----

## Relationship to Existing SEPs

|Layer                                    |Defined By             |
|-----------------------------------------|-----------------------|
|Client authentication (human)            |Existing MCP OAuth spec|
|Enterprise IdP, server-level policy      |SEP-990                |
|M2M agent authentication                 |SEP-1046               |
|Client-side install security             |SEP-1024               |
|**Tool-level authorization requirements**|**This SEP**           |

SEP-990 and SEP-1046 establish who may connect. This SEP declares what a connected agent requires to act. The two layers are complementary and non-overlapping.

-----

## Enforcement Architecture (Non-Normative)

This SEP does not mandate an enforcement architecture. The TAM is a declaration; enforcement is the responsibility of the host implementation.

A reference implementation demonstrating one enforcement pattern — an authorization checkpoint that evaluates the TAM against an external Policy Decision Point using a standardized agent identity document — is available at: `https://github.com/lececo/mcp-acp-reference-sep/tree/main`

Implementers may use OPA, Cedar, AWS Verified Permissions, or any other engine. The reference implementation is informative only.

-----

## Backwards Compatibility

This extension is fully backwards compatible. Servers that do not advertise `authorizationManifest` continue to work without change. Clients that do not request the TAM receive no TAM. No existing MCP messages are modified.

-----

## Security Considerations

**TAM must not be agent-visible.** Exposing authorization requirements to the agent allows a compromised or prompt-injected agent to reason about what it needs to claim in order to satisfy policy.

**TAM is advisory, not authoritative.** A malicious or misconfigured server could declare permissive requirements. Hosts and external policy systems MUST maintain their own authoritative policy and treat the TAM as a supplementary hint only.

**Human approval is a host responsibility.** When `requiresHumanApproval` is true, the mechanism for obtaining and recording that approval is left to the host implementation.

-----

## Open Questions

1. **TAM caching.** How long may a host cache a TAM before re-fetching? Should the manifest include a `maxAge` or `etag` field?
2. **Role namespace.** Should role strings be namespaced (e.g. `org.example/finance-reader`) to avoid collisions across organizations and deployments?
3. **Partial manifests.** May a server return a TAM that only covers a subset of its tools? How should the host treat tools not listed in the manifest?

-----

## References

- MCP Authorization Specification. https://spec.modelcontextprotocol.io/specification/2025-11-05/basic/authorization/
- SEP-990: Enable enterprise IdP policy controls during MCP OAuth flows
- SEP-1046: Support OAuth client credentials flow in authorization
- SEP-1024: MCP Client Security Requirements for Local Server Installation
- OWASP LLM Top 10 (2025) — LLM06 Excessive Agency. https://owasp.org/www-project-top-10-for-large-language-model-applications/
- OAuth 2.1. https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1
- SPIFFE/SPIRE Workload Identity. https://spiffe.io/
- OPA — Open Policy Agent. https://www.openpolicyagent.org/
- NIST AI RMF 1.0. https://airc.nist.gov/RMF
- RFC 8693 — OAuth 2.0 Token Exchange. https://datatracker.ietf.org/doc/html/rfc8693
