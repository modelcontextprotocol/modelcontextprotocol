# SEP-NNNN: MCP Client Silent Refresh on 401 Invalid Token

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-05-08
- **Author(s)**: Waddah Alhajar (@waddah12alhajar)
- **Sponsor**: TBD
- **PR**: TBD
- **Builds on**: [SEP-2207 (OIDC-Flavored Refresh Token Guidance)](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/2207-oidc-refresh-token-guidance.md)

> **Note for filers:** When the PR is opened, GitHub assigns a number — replace `NNNN` in the filename and title with that number, and replace `TBD` for `PR` with the PR number. Per [SEP-1850 (PR-based SEP workflow)](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/1850-pr-based-sep-workflow.md), the SEP is submitted as a PR adding `seps/NNNN-mcp-client-silent-refresh-on-401.md`.

## Abstract

This proposal specifies the expected behavior of MCP HTTP clients when a remote MCP server returns `HTTP 401` with a `WWW-Authenticate: Bearer error="invalid_token"` challenge and the client holds a usable refresh token for that authorization server. The proposal complements [SEP-2207 (OIDC-Flavored Refresh Token Guidance)](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/2207-oidc-refresh-token-guidance.md), which standardized how clients _request_ refresh tokens via `offline_access`, by specifying how clients should _use_ those refresh tokens to recover transparently from token expiry — without surfacing the failure to the model or requiring user reauthentication.

## Motivation

SEP-2207 closed a real interoperability gap by standardizing client-side use of `offline_access` so refresh tokens are reliably issued. It did not, however, specify what the client should do with the refresh token when an access token aged out mid-session. As a result:

1. **Refresh tokens are issued but unused.** Connector authors who comply with SEP-2207's resource-server side (publishing Protected Resource Metadata, returning the right `WWW-Authenticate` challenge per RFC 6750 §3) and whose authorization servers issue refresh tokens per SEP-2207's client-side guidance still see end users surfaced with raw 401 errors mid-session — because the client did not perform a refresh-token grant on receipt of the 401.

2. **User experience regression vs the local stdio path.** stdio MCP servers using local credential providers (`InteractiveBrowserCredential`, MSAL, Azure CLI) refresh transparently — the user never sees the lifecycle event. Remote MCP via HTTP+OAuth should reach feature parity, otherwise remote MCP looks less reliable than its local counterpart.

3. **Operational impact for B2B / long-running sessions.** Enterprise users running multi-hour analytics or BI sessions hit access-token expiry routinely (e.g. Entra defaults around 60 minutes). Each one becoming a manual reauth is operational noise, not a security event. A documented client-side recovery is essential for production deployments.

4. **Inconsistent behavior across MCP clients.** Different clients today either (a) refresh silently, (b) surface the 401 to the model as a tool error, or (c) prompt the user to reauthenticate. Neither connector authors nor end users can reason about behavior portably across clients without a normative spec.

## Specification

### MCP Client Requirements

When an MCP HTTP client receives an `HTTP 401` response from a remote MCP server, the client **MUST** parse the `WWW-Authenticate` response header per RFC 6750 §3.

If, and only if, **all** of the following conditions hold, the client **SHOULD** perform a silent refresh-token grant before surfacing the failure to the model:

1. The `WWW-Authenticate` header includes `Bearer` and a parameter `error="invalid_token"`.
2. The client holds a refresh token issued by the authorization server bound to that connector (typically via SEP-2207's `offline_access` flow at sign-in).
3. The client has not already performed a refresh-token grant for the same logical request within this attempt cycle (see "Retry cap" below).

Silent refresh procedure:

1. Resolve the authorization server's `token_endpoint` from the AS Authorization Server Metadata (RFC 8414), which the client already discovered as part of the original authorization flow.
2. POST to the `token_endpoint` with at minimum:
   - `grant_type=refresh_token`
   - `refresh_token=<stored>`
   - `client_id=<from registration>`
   - The same authentication mechanism the client uses for its other token-endpoint requests (none for public clients, `client_secret`/`client_assertion` for confidential clients).
3. On HTTP 200 from the AS:
   - Replace stored `access_token` with the newly issued one.
   - If the AS rotated the refresh token (RFC 6749 §10.4), replace stored `refresh_token` as well.
   - Re-issue the original tool call with the new `access_token` in the `Authorization: Bearer` header.
   - The retried tool call **MUST** preserve the original `tool_use_id` and any model-visible identifiers so the model sees a coherent tool result, not a synthetic retry message.
4. On HTTP 4xx from the AS (refresh token expired, revoked, or otherwise invalid):
   - Discard the stored refresh token.
   - Surface a structured `needs_reauth` error to the model and trigger any client-specific UI affordance (e.g. a Connectors panel notification) prompting the user to reauthenticate.
5. On HTTP 5xx or transport failure:
   - Surface the original 401 (or a transport error) to the model. Do not loop.

### Retry cap

The client **MUST NOT** perform more than one silent refresh attempt per logical request. If the retried request itself returns `401 invalid_token`, the client **MUST** surface a `needs_reauth` error rather than recurse.

### Conditions under which silent refresh MUST NOT occur

- `WWW-Authenticate` indicates `error="insufficient_scope"` or any value other than `invalid_token`. Those errors indicate a different remediation (step-up auth, user consent) and **MUST** be surfaced to the model and/or user, not silently retried.
- The client has no refresh token for the connector. The client **MUST** surface a `needs_reauth` error.
- The HTTP response is not `401`. (Servers should not use `403` or `200`-with-error-envelope for token expiry; if they do, this SEP does not apply.)

### Server-side prerequisites (informative, not normative for this SEP)

For silent refresh to be possible end-to-end, the server side must already comply with existing specifications:

- Server returns `HTTP 401` (not 403, not 200-with-error-envelope) when the access token is invalid or expired.
- Server includes `WWW-Authenticate: Bearer error="invalid_token"` per RFC 6750 §3.
- Server publishes RFC 9728 Protected Resource Metadata at the documented well-known URL.
- The OAuth flow at sign-in requested `offline_access` per SEP-2207 (so a refresh token was actually issued).

These are existing requirements from RFC 6750, RFC 9728, and SEP-2207. They are listed here only as a deployment checklist for connector authors who want to maximize the chance of silent refresh succeeding in compliant clients.

## Rationale

### Why this complements SEP-2207 rather than amending it

SEP-2207 is exclusively concerned with refresh token _issuance_ — establishing a contract between the client and the authorization server about when and how refresh tokens are produced. The current proposal is exclusively concerned with refresh token _use_ on 401 — establishing a contract between the client and the resource server (via the standardized 401 challenge) about how the client should recover. The two concerns are independent and merit separate normative treatment, while sharing the underlying assumption that `offline_access` has been requested.

### Why "SHOULD" rather than "MUST"

Some clients legitimately cannot perform silent refresh — for example, clients without secure refresh-token storage, clients embedded in restricted runtimes, or clients whose policy is to require explicit user interaction on every token lifecycle event for security reasons. Mandating silent refresh would either force these clients into non-compliance or force them into insecure practices. `SHOULD` allows the path while leaving room for justified opt-out.

### Why the retry cap is exactly 1

A retry cap of 1 is sufficient to handle the realistic failure mode (access token aged past `exp`, refresh token still valid) while preventing pathological loops if the AS persistently rejects (e.g., AS clock skew, revocation, or malformed grant). A retry cap of 0 would defeat the purpose. A retry cap >1 introduces failure-amplification risk during AS outages.

### Why preserve the original `tool_use_id`

Models reasoning over tool calls treat `tool_use_id` as the join key between request and result. If the retry is presented as a separate tool call, the model may interpret it as a state change (e.g. side effects executed twice). Transparent retry — same `tool_use_id`, model sees the eventual success or failure — preserves the model's mental model and avoids subtle correctness issues for tools with side effects.

### Alternatives considered

1. **Mandate silent refresh as MUST.** Rejected. Some clients legitimately cannot or should not perform automatic refresh (see "Why SHOULD" above). Hard mandate excludes these without benefit.

2. **Specify a server-side proxy refresh.** Rejected. Resource servers should not store user refresh tokens; doing so would expand the blast radius of a server breach and break OBO patterns where the resource server intentionally never holds long-lived user credentials. SEP-2207's design also explicitly assumes refresh tokens are client-stored.

3. **Define a new `WWW-Authenticate` parameter to signal "refresh needed".** Rejected. RFC 6750 §3 already provides `error="invalid_token"`, and overloading the response with bespoke MCP-specific parameters would harm interoperability with general-purpose OAuth tooling.

4. **Defer to client implementation entirely (status quo).** Rejected. The status quo is exactly the inconsistency described in the Motivation. Without a normative spec, connector authors cannot reason about expected client behavior portably.

5. **Mandate a long retry-and-backoff loop.** Rejected. Multi-attempt retry conflates "expired token" with "AS outage" and amplifies failure during incidents. A single retry handles the lifecycle case; everything beyond that is an outage and should surface as such.

## Backward Compatibility

This proposal is fully backward-compatible:

- Clients that currently perform silent refresh (apparent in some Claude Desktop sessions, observed in production) continue to comply.
- Clients that currently do not perform silent refresh continue to function — they will surface a `needs_reauth` error (or the original 401), as they do today, until they implement this guidance.
- Servers are not required to make any changes. Their existing RFC 6750 §3 + RFC 9728 + SEP-2207 compliance is the prerequisite, not a new burden.
- No new endpoints, no new headers, no schema changes. The proposal is purely about client behavior on receipt of an existing standardized response.

## Security Implications

### Positive security implications

1. **Reduced incentive for sticky / overlong access tokens.** When silent refresh is reliable, authorization servers can safely issue short-lived access tokens (e.g. 60 minutes or less) without UX penalty. This shrinks the lifetime window of a leaked or compromised access token.

2. **Reduced incentive for sticky / overlong sessions.** When silent refresh is reliable, users have less reason to abandon multi-step flows out of frustration with reauthentication, which reduces context-switching errors that often lead to credential reuse or phishing susceptibility.

3. **Clear failure mode.** A `needs_reauth` error after a failed refresh is a precise signal — the refresh token itself is invalid (revoked, expired, or admin-disabled). Users and operators can interpret it without ambiguity, unlike the current variability where a 401 could mean expired access token, expired refresh token, or both.

### Considerations and mitigations

1. **Refresh token theft amplifies exposure.** A client storing refresh tokens makes them a higher-value target. This is a pre-existing concern from SEP-2207 (and OAuth 2.1 generally), not introduced by this SEP. The standard mitigations apply: secure storage at rest (OS keychain, DPAPI), refresh token rotation per RFC 6749 §10.4, and prompt revocation on suspicious activity.

2. **Silent refresh hides a security-relevant event.** By design — that's the intent. However, clients **SHOULD** log the refresh internally (with no token material) so operational telemetry retains visibility for incident review. Servers logging the 401 + subsequent successful retry on the same `tool_use_id` provides a complete audit trail.

3. **Conditional Access bypass concerns.** If an authorization server enforces step-up authentication (MFA, compliant device, named locations) at sign-in, those policies are evaluated when the refresh-token grant runs. Conditional Access policies that require re-prompting on each access-token issuance can return a `400 invalid_grant` with `error_description` indicating step-up required, at which point the client falls through to the "surface `needs_reauth`" path. This SEP does not weaken Conditional Access; the AS retains full enforcement authority via the refresh-token grant evaluation.

4. **Tool side-effect duplication.** If a tool call triggered a non-idempotent server-side side effect _before_ the 401 was returned (rare, since the 401 is typically returned at the auth boundary before tool execution), the silent retry would invoke the tool twice. Mitigation: servers should perform auth at the entry of the request handler, before any side-effecting code runs. If a deployment cannot guarantee this, the server-side response should be `403` or `409` rather than `401 invalid_token` to keep silent refresh out of the path.

## Reference Implementation

Reference implementations should be added in the official MCP SDKs once the SEP is accepted:

- **TypeScript SDK** (`modelcontextprotocol/typescript-sdk`): silent refresh in the HTTP transport layer; coverage in the existing OAuth conformance test suite.
- **Python SDK** (`modelcontextprotocol/python-sdk`): same.
- **Conformance test fixture**: a server fixture that returns `401 invalid_token` deterministically on the second request after sign-in, validating that conformant clients perform a single refresh + retry and produce the success response, and that non-conformant clients produce a `needs_reauth` error visible to the test harness.

## Acknowledgments

This proposal builds directly on SEP-2207 by Wils Dawson (@wdawson) and Paul Carleton (@pcarleton). It also draws on the OAuth 2.1 (draft-ietf-oauth-v2-1-13) and RFC 6750 / RFC 8414 / RFC 9728 prior art for the underlying mechanics.

The motivating production scenario was a remote MCP connector serving Power BI / Azure Data Factory analytics for an enterprise customer base. The connector is fully spec-compliant on the resource-server side (RFC 6750 §3 challenge, RFC 9728 metadata, SEP-2207 `offline_access`); the gap surfaced was downstream of issuance, in the client's handling of the 401 + refresh-token-in-hand case.
