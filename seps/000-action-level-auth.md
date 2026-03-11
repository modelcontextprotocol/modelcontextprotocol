# SEP-0000: Action-Level Authorization for MCP Tool Calls

## Preamble

|Field       |Value                                                        |
|------------|-------------------------------------------------------------|
|**Title**   |Action-Level Authorization for MCP Tool Calls                |
|**Author**  |Leon Cört                                              |
|**Status**  |Draft                                                        |
|**Type**    |Standards Track                                              |
|**Created** |2026-03-11                                                |
|**Requires**|SEP-990 (Enterprise IdP), SEP-1046 (Client Credentials / M2M)|

-----

## Abstract

This SEP proposes a standardized extension to the Model Context Protocol that enables **action-level authorization** of tool calls — beyond the connection-level authentication already defined in MCP’s OAuth spec. It introduces an optional **Authorization Gateway** layer that intercepts tool calls before execution, evaluates them against external policy engines, and enforces least-privilege constraints at the level of individual functions and parameters. It further defines a **Tool Authorization Manifest** (TAM): a machine-readable declaration of required permissions per tool function, served alongside existing MCP tool schemas.

-----

## Motivation

### The Gap Between Connection Auth and Action Auth

MCP’s current authorization story covers one layer: **who can connect to an MCP server**. The OAuth 2.1 integration authenticates the client, establishes a session, and scopes access at the server level. This is necessary but insufficient for enterprise deployments.

What is missing: **who can call which tool, with which parameters, under which conditions** — evaluated dynamically at runtime, per tool call, per agent identity, per context.

Today, once a client is authenticated, it has undifferentiated access to all tools exposed by the MCP server. An agent with legitimate access to a `database` server can call both `query` and `delete`. A sub-agent spawned with a narrow task inherits the full tool surface of its parent. There is no protocol-level mechanism to express or enforce the difference.

### Why This Matters for Multi-Agent Systems

In single-agent deployments this gap is manageable — the agent is a known, controlled process. In multi-agent systems it becomes a critical surface:

- **Agent A spawns Agent B** for a subtask. What permissions does B inherit? The protocol has no answer.
- **Prompt injection** causes an agent to attempt unauthorized tool calls. The MCP server has no protocol-level mechanism to reject at the function level.
- **Parameter-level constraints** — e.g. a finance agent may query transactions but only below a threshold — are inexpressible in current MCP schemas.
- **Compliance requirements** (SOC 2, HIPAA, GDPR) demand that every tool invocation is authorized against a policy and logged with the authorization decision. This is impossible without a defined authorization layer.

### What Exists Today — and Where It Falls Short

SEP-990 enables enterprise IdPs to control which MCP servers an organization permits — a connection-level policy evaluated once at session setup. SEP-1046 enables machine-to-machine authentication via OAuth client credentials and JWT Assertions. SEP-1024 protects against malicious server installation. Together these define who can connect and to what.

None of them address what a connected agent may do within an established session. Red Hat, IBM, and others have built proprietary MCP Gateways that aggregate multiple MCP servers, but each implements authorization differently and none defines a protocol-level contract for policy delegation.

This SEP does not replace any of that work. It defines the missing **authorization contract** at the call level.

-----

## Specification

### 1. Overview

The extension introduces two components:

1. **Tool Authorization Manifest (TAM):** An optional metadata document served by MCP servers that declares, per tool and per function, the required roles and parameter constraints.
1. **Authorization Checkpoint Protocol (ACP):** A lightweight protocol extension that, when enabled, causes the MCP host to evaluate each tool call against an external Policy Decision Point (PDP) before forwarding it to the MCP server.

Both components are optional and fully backwards compatible. Servers and clients that do not implement this extension continue to operate normally.

-----

### 2. Tool Authorization Manifest (TAM)

#### 2.1 Discovery

A server that implements this extension MUST advertise support during the MCP initialization handshake:

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

#### 2.2 Retrieval

Clients MAY request the TAM via a new method:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/authorizationManifest",
  "params": {}
}
```

#### 2.3 Manifest Schema

The server responds with a manifest object:

```json
{
  "schemaVersion": "1.0",
  "serverId": "acme-database-server",
  "tools": {
    "database": {
      "functions": {
        "query": {
          "requiredRoles": ["data-reader", "finance-analyst"],
          "parameterConstraints": {
            "allowedTables": ["transactions", "reports"],
            "maxLimit": 1000
          },
          "resourceClassification": "confidential",
          "requiresHumanApproval": false,
          "auditRequired": true
        },
        "delete": {
          "requiredRoles": ["data-admin"],
          "parameterConstraints": {},
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

|Field                   |Type    |Required|Description                                                                         |
|------------------------|--------|--------|------------------------------------------------------------------------------------|
|`requiredRoles`         |string[]|Yes     |Roles the calling agent must possess. All listed roles are required (AND semantics).|
|`parameterConstraints`  |object  |No      |Key-value constraints applied to call parameters. Structure is tool-defined.        |
|`resourceClassification`|enum    |No      |`public`, `internal`, `confidential`, `restricted`                                  |
|`requiresHumanApproval` |boolean |No      |If true, host MUST pause and request human confirmation before forwarding           |
|`auditRequired`         |boolean |No      |If true, PDP MUST emit a decision log entry regardless of allow/deny                |

#### 2.4 TAM Integrity

The TAM MUST NOT be used as the sole source of authorization truth by the PDP. It is a **hint** from the server about its own requirements. The PDP MAY enforce stricter policies than the TAM declares. Clients MUST NOT expose the TAM contents to agent prompts — it is infrastructure metadata, not agent-facing information.

-----

### 3. Authorization Checkpoint Protocol (ACP)

#### 3.1 Agent Identity

This extension requires that agents present a verifiable identity credential — a signed JWT issued by an external Identity Provider — not a self-declared identity. The JWT MUST contain:

- `sub`: unique agent identifier
- `roles`: array of role strings
- `parent_agent_id`: identifier of spawning agent, or null
- `session_id`: current session scope
- `exp`: short-lived expiry (RECOMMENDED: ≤ 300 seconds)

The MCP host is responsible for obtaining and validating this credential before constructing the authorization input. Agent identity is never self-declared.

This implies that agents are treated as **Non-Human Identities (NHI)** — first-class principals in the organization’s identity infrastructure, analogous to service accounts or workload identities (e.g. SPIFFE/SPIRE). Deployments that do not yet have NHI infrastructure may use static, pre-issued JWTs as a transitional measure.

#### 3.2 Tool Call Interception

When ACP is enabled, the MCP host MUST intercept each `tools/call` request before forwarding it to the MCP server, and construct a standardized authorization input document:

```json
{
  "agent": {
    "id": "agent-finance-001",
    "roles": ["finance-analyst"],
    "trustLevel": "internal",
    "parentAgentId": null,
    "sessionId": "sess-abc-123"
  },
  "action": {
    "tool": "database",
    "function": "query",
    "parameters": {
      "table": "transactions",
      "limit": 500
    }
  },
  "resource": {
    "serverId": "acme-database-server",
    "classification": "confidential"
  },
  "context": {
    "workflowId": "wf-quarterly-report",
    "delegationChain": [],
    "timestampUtc": "2026-03-08T10:01:45Z"
  }
}
```

#### 3.3 Policy Decision Point Interface

The host submits the authorization input to the configured PDP via HTTP POST:

```
POST /v1/authorize
Content-Type: application/json

{ ...input document above... }
```

The PDP responds with:

```json
{
  "decision": "allow",
  "reasons": [],
  "requiresHumanApproval": false,
  "auditId": "aud-xyz-789"
}
```

Or on denial:

```json
{
  "decision": "deny",
  "reasons": ["missing required role: data-reader"],
  "auditId": "aud-xyz-790"
}
```

**This SEP is intentionally policy-engine agnostic.** The PDP interface is a simple HTTP contract. Implementations MAY use OPA, Cedar, AWS Verified Permissions, or any other engine. The authorization input schema is fixed; the policy evaluation is not.

#### 3.4 Fail Behavior

Deployments MUST explicitly configure fail behavior. There is no safe default:

- **Fail-closed:** If the PDP is unreachable, all tool calls are denied. Required for `restricted` classified resources.
- **Fail-open:** If the PDP is unreachable, tool calls proceed. Acceptable only for `public` classified resources.
- **Fail-queue:** If the PDP is unreachable, tool calls are queued until PDP recovers or a timeout is reached.

The fail behavior MUST be declared per server in the host configuration and SHOULD be logged.

#### 3.5 Human-in-the-Loop

If the TAM declares `requiresHumanApproval: true` for a function, or the PDP response contains `requiresHumanApproval: true`, the host MUST:

1. Pause execution
1. Surface the pending tool call to a human approver via the host’s configured notification channel
1. Resume or abort based on the human decision
1. Log the human decision alongside the PDP decision in the audit trail

The mechanism for human notification is out of scope for this SEP and left to host implementations.

-----

### 4. Relationship to Existing MCP Authorization SEPs

The existing authorization SEPs collectively define the **identity and connection layer** of MCP security. This SEP adds the **enforcement layer** that sits above them. None of the existing SEPs are modified or replaced.

#### SEP-990: Enterprise IdP Policy Controls (Aaron Parecki)

SEP-990 introduces an enterprise-grade OAuth flow where the IdP evaluates organizational policy before issuing an MCP Access Token. This solves **which MCP servers an organization allows a client to connect to** — a connection-level decision made once at session establishment.

Our SEP operates after SEP-990 has completed. Once a session is established with a valid token, SEP-990 has no further influence on what the agent does within that session. A client with a valid MCP Access Token can call any tool the server exposes. Our SEP addresses exactly this gap: **per-call authorization within an established session**.

SEP-990’s ID-JAG token is a candidate input to our agent identity document — the verified identity claims from the IdP can populate `agent.roles` and `agent.id` in the ACP input, making both SEPs complementary by design.

#### SEP-1046: OAuth Client Credentials Flow (Darin McAdams)

SEP-1046 enables machine-to-machine scenarios by adding the OAuth client credentials flow — specifically JWT Assertions per RFC 7523 and client secrets. This directly underpins the **Non-Human Identity** model our SEP requires: agents authenticating without a human present, using asymmetric credentials.

SEP-1046 explicitly notes that JWT contents and JWKS discovery are left unspecified pending maturity of WIMSE Headless JWT Authentication. Our SEP depends on a populated and verified JWT at runtime — we inherit this open question and note it as a dependency in our identity model.

Critically, SEP-1046 does not define what the agent is authorized to *do* after authentication. It authenticates the agent identity; our SEP enforces what that identity may execute.

#### SEP-1024: Client Security Requirements for Local Server Installation (Denis Delimarsky)

SEP-1024 addresses a different threat surface entirely: malicious MCP server configurations distributed via social engineering and one-click install flows. It mandates explicit user consent dialogs before executing local server commands.

This SEP and ours address orthogonal attack vectors. SEP-1024 protects against **malicious servers entering the environment**. Our SEP protects against **legitimate agents within the environment taking unauthorized actions**. A deployment may need both.

#### Summary: The Authorization Stack

```
┌─────────────────────────────────────────────────────┐
│  SEP-1024   Client-side install consent             │  Pre-connection
├─────────────────────────────────────────────────────┤
│  SEP-990    Enterprise IdP: which servers allowed   │  Connection setup
│  SEP-1046   M2M auth: agent identity credential     │  Connection setup
├─────────────────────────────────────────────────────┤
│  This SEP   Per-call tool authorization             │  Runtime enforcement  ◄
│             Parameter-level constraints             │
│             Cross-agent delegation                  │
└─────────────────────────────────────────────────────┘
```

The existing SEPs establish **who can connect and to what**. This SEP establishes **what a connected agent may do, call by call**.

### Why an External PDP, Not Inline Policy?

Embedding policy evaluation inside the MCP host couples authorization logic to the protocol implementation. This means policy changes require host updates, compliance teams cannot audit or modify policy without code access, and policy cannot be shared or versioned across multiple hosts. Delegating to an external PDP — via a simple HTTP interface — decouples these concerns completely.

### Why a Standardized Input Schema?

Without a standardized input schema, every PDP integration is bespoke. Tool owners, compliance teams, and host implementers all need to agree on field semantics for the system to work. A standard schema makes PDP implementations portable across hosts and frameworks.

### Why TAM as Server-Declared Hints?

Tool owners understand their own access requirements better than a central policy team. Allowing servers to declare their own requirements via TAM enables self-service governance: tool owners submit a PR to update their manifest, compliance teams review it, policy teams enforce it via the PDP. No one needs to touch the host or the policy engine to add a new tool permission requirement.

### Why Not Cedar or OPA Specifically?

Different organizations have different policy infrastructure. Mandating a specific engine would exclude valid existing deployments. The HTTP interface is minimal and well-understood. Any engine that can evaluate the input document and return a decision qualifies.

-----

## Backwards Compatibility

This extension is fully backwards compatible:

- Servers that do not implement `authorizationManifest` capability continue to work without change
- Hosts that do not enable ACP continue to forward tool calls directly
- Clients that do not request the TAM receive no TAM
- No existing MCP messages are modified

Implementations that wish to adopt this extension incrementally may do so per-server, starting with their highest-risk tools.

-----

## Security Considerations

**TAM must not be agent-visible.** If the TAM is surfaced to agent prompts, an adversary could use knowledge of required roles to craft prompt injections that attempt to satisfy policy constraints. The TAM is infrastructure metadata consumed only by the host.

**Agent identity must be externally issued.** Self-declared agent identities in the authorization input document are trivially forgeable. Deployments must ensure the JWT is issued and signed by a trusted external identity provider, not generated by the agent itself.

**Delegation chain depth.** Unbounded agent spawning with delegation chains creates risk of permission laundering — where a low-privilege agent spawns a chain of agents that cumulatively acquire broad permissions. Hosts SHOULD enforce a maximum delegation chain depth (RECOMMENDED: 5) and SHOULD enforce that each agent in the chain possesses all roles it delegates.

**Fail behavior is a security-critical configuration.** Fail-open on a `restricted` resource effectively disables authorization during PDP outages. Operators must consciously configure fail behavior per resource classification, not accept a system default.

**TAM integrity.** The TAM is served by the MCP server itself and could be manipulated by a compromised server to declare permissive policies. The PDP SHOULD maintain its own authoritative policy store and treat the TAM as advisory input only.

-----

## Open Questions

1. **TAM versioning and caching.** How long may a host cache a TAM before re-fetching? Should the TAM include an ETag or version field? If a TAM changes mid-session, should existing sessions be invalidated?
1. **Agent identity issuance for dynamically spawned agents.** When Agent A spawns Agent B at runtime, B needs a signed JWT immediately. What is the recommended identity issuance flow for ephemeral sub-agents? SPIFFE/SPIRE workload attestation is one candidate but requires infrastructure most organizations do not yet have deployed.
1. **PDP latency and availability SLAs.** High-frequency agent workflows may call tools dozens of times per second. What is the recommended PDP deployment topology — sidecar, in-process WASM, or centralized with local caching — and what latency budget is acceptable? Initial benchmarks from reference implementations are needed.
1. **Human-in-the-loop notification channel.** This SEP defers the human approval mechanism to host implementations. Should a future SEP standardize a notification interface, or is this appropriately left to hosts?
1. **Policy engine certification.** Should the MCP project maintain a list of certified PDP implementations that conform to the ACP interface? Or is the HTTP contract sufficient for interoperability?

-----

## Reference Implementation

A reference implementation is being developed at: `[repository link]`

It includes:

- A Python MCP host middleware that implements ACP interception
- An OPA-based PDP with the standardized input schema
- A LangChain thin wrapper as proof-of-concept framework integration
- Example TAM definitions for common tool types (database, filesystem, HTTP, payment)
- Example Rego policies covering RBAC, ABAC, delegation chain validation, and human-in-the-loop escalation

-----

## Acknowledgements

This proposal builds on the existing MCP OAuth specification and the SEPs for M2M authentication and Enterprise IdP integration. It is informed by production experience with OPA-based authorization in Kubernetes and Envoy deployments, and by the architectural work in the open-source agent governance community.

-----

## References

- MCP Authorization Specification. https://spec.modelcontextprotocol.io/specification/2025-11-05/basic/authorization/
- OAuth 2.1. https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1
- SPIFFE/SPIRE Workload Identity. https://spiffe.io/
- OPA — Open Policy Agent. https://www.openpolicyagent.org/
- OWASP LLM Top 10 (2025) — LLM06 Excessive Agency. https://owasp.org/www-project-top-10-for-large-language-model-applications/
- NIST AI RMF 1.0. https://airc.nist.gov/RMF
- RFC 8693 — OAuth 2.0 Token Exchange. https://datatracker.ietf.org/doc/html/rfc8693
