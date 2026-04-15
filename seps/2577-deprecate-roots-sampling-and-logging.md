# SEP-2577: Deprecate Roots, Sampling, and Logging

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-04-14
- **Author(s)**: Kurtis Van Gent (@kurtisvg)
- **Sponsor**: @kurtisvg
- **PR**: #2577

> **Note**: This SEP is predicated on a hypothetical SEP where MCP considers a
> specification version supported for one year past its original release date.
> The deprecation timeline described here assumes that policy is in place.

## Abstract

This SEP deprecates the following core protocol features:

- **Roots** (`roots/list`, `notifications/roots/list_changed`)
- **Sampling** (`sampling/createMessage`,
  `ClientCapabilities.tasks.requests.sampling`)
- **Logging** (`logging/setLevel`, `notifications/message`)

These features are deprecated starting in the specification version that
includes this SEP (expected June 2026). They will continue to be fully
functional in all specification versions released within one year of that
version's release.

Each of those subsequent versions will in turn support the features for one year
after its own release, assuming the one-year-per-version support policy proposed
in a separate SEP. This provides implementations with an extended migration
window before the features are fully removed.

During the deprecation period, wire-level behavior is unchanged. No types are
removed, no capability negotiation changes, and no existing implementations
break. The deprecation serves as a signal to the ecosystem to stop building on
these features and to plan for their eventual removal.

## Motivation

The MCP specification aims to remain minimal and focused. Features that see low
adoption, overlap with existing alternatives, or impose disproportionate
implementation burden relative to their value are candidates for removal.
Keeping such features in the core specification increases the burden for every
client and server, slows protocol evolution, and makes the specification harder
to learn. The following three features meet these criteria.

Deprecating these features was proposed during a recent core contributor
meeting. This SEP formalizes that proposal with a concrete implementation plan.
See [discussion #2536][discussion-2536].

### Roots

Roots provides "informational guidance" about which directories or files a
server should operate on. In practice:

- **Low adoption**: Few clients implement roots support, and few servers rely on
  it. The [feature support matrix][feature-matrix] shows limited client
  coverage.
- **Vague semantics**: The specification describes roots as informational —
  servers are not required to respect them, which reduces their utility.
- **Overlapping alternatives**: Working directory context can be provided
  through tool parameters, resource URIs, server configuration, or environment
  variables — all of which are more explicit.

### Sampling

Sampling allows servers to request LLM completions from the client. While
conceptually powerful, it has struggled with adoption:

- **Complex to implement**: Correct sampling implementation requires
  human-in-the-loop approval, model selection logic, security considerations,
  and (since SEP-1577) tool loop support. This complexity has contributed to low
  client adoption.
- **Low adoption**: The [feature support matrix][feature-matrix] shows that few
  clients support sampling, despite the feature being available since the
  November 2024 specification.
- **Direct alternatives**: Servers that need LLM capabilities can integrate
  directly with LLM provider APIs, giving them full control over model
  selection, parameters, and streaming.

### Logging

Logging allows servers to send structured log messages to clients via the
protocol:

- **Overlapping infrastructure**: Standard logging mechanisms (stderr for stdio
  transports, OpenTelemetry for structured observability) are mature, widely
  adopted, and better suited to logging than an application-protocol channel.
- **Low value relative to complexity**: Adding log message types, severity
  levels, and the `logging/setLevel` request to the core specification increases
  the implementation surface for all clients and servers.

[discussion-2536]: https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/2536
[feature-matrix]: https://modelcontextprotocol.io/clients#feature-support-matrix

## Specification

### Overview of changes

1. Mark deprecated features with `@deprecated` annotations in the schema
2. Add deprecation notices to feature documentation pages
3. No wire-level protocol changes during the deprecation period

### Schema changes

Add `@deprecated` JSDoc annotations to the following items in
`schema/draft/schema.ts`. No types, interfaces, or union members are removed.

#### Deprecated capabilities

| Capability                                   | Location                               |
| -------------------------------------------- | -------------------------------------- |
| `ClientCapabilities.roots`                   | Client capability for listing roots    |
| `ClientCapabilities.sampling`                | Client capability for LLM sampling     |
| `ClientCapabilities.tasks.requests.sampling` | Task-augmented sampling sub-capability |
| `ServerCapabilities.logging`                 | Server capability for log messages     |

#### Deprecated types — Roots

| Type                           | Description                               |
| ------------------------------ | ----------------------------------------- |
| `Root`                         | Represents a root directory or file       |
| `ListRootsRequest`             | Server-to-client request for `roots/list` |
| `ListRootsResult`              | Result containing roots array             |
| `ListRootsResultResponse`      | JSON-RPC response wrapper                 |
| `RootsListChangedNotification` | Client notification when roots change     |

#### Deprecated types — Sampling

| Type                          | Description                                    |
| ----------------------------- | ---------------------------------------------- |
| `CreateMessageRequestParams`  | Parameters for `sampling/createMessage`        |
| `CreateMessageRequest`        | Server-to-client request for sampling          |
| `CreateMessageResult`         | Result from a sampling request                 |
| `CreateMessageResultResponse` | JSON-RPC response wrapper                      |
| `SamplingMessage`             | A message in a sampling conversation           |
| `SamplingMessageContentBlock` | Content block union for sampling messages      |
| `ToolChoice`                  | Controls model tool selection during sampling  |
| `ToolUseContent`              | Tool use content block in sampling messages    |
| `ToolResultContent`           | Tool result content block in sampling messages |
| `ModelPreferences`            | Server preferences for model selection         |
| `ModelHint`                   | Hints for model selection                      |

#### Deprecated types — Logging

| Type                               | Description                             |
| ---------------------------------- | --------------------------------------- |
| `LoggingLevel`                     | Syslog severity level enum              |
| `SetLevelRequestParams`            | Parameters for `logging/setLevel`       |
| `SetLevelRequest`                  | Client-to-server request to set level   |
| `SetLevelResultResponse`           | JSON-RPC response wrapper               |
| `LoggingMessageNotificationParams` | Parameters for log message notification |
| `LoggingMessageNotification`       | Server-to-client log message            |

#### Annotation format

Each deprecated item SHOULD receive a JSDoc `@deprecated` tag with a brief
explanation:

```typescript
/**
 * Present if the client supports listing roots.
 *
 * @deprecated Deprecated as of this specification version. Will be included
 * in all versions released within one year, then may be removed.
 */
roots?: {
  listChanged?: boolean;
};
```

#### Union types

The following union types reference deprecated types but MUST NOT be modified
during the deprecation period. They will be updated when the deprecated types
are removed:

- `ClientNotification` (includes `RootsListChangedNotification`)
- `ClientResult` (includes `CreateMessageResult`, `ListRootsResult`)
- `ServerRequest` (includes `CreateMessageRequest`, `ListRootsRequest`)
- `ServerNotification` (includes `LoggingMessageNotification`)

### Documentation changes

Add a deprecation warning block at the top of each feature's documentation page,
after the title:

**`docs/specification/draft/client/roots.mdx`:**

```mdx
<Warning>
**Deprecated**: The Roots feature is deprecated as of this specification
version. It will remain fully functional in all specification versions released
within one year of the <YYYY-MM-DD> release. Each of those versions will
continue to support it for one year after its own release.
</Warning>
```

**`docs/specification/draft/client/sampling.mdx`:**

```mdx
<Warning>
**Deprecated**: The Sampling feature is deprecated as of this specification
version. It will remain fully functional in all specification versions released
within one year of the <YYYY-MM-DD> release. Each of those versions will
continue to support it for one year after its own release.
</Warning>
```

**`docs/specification/draft/server/utilities/logging.mdx`:**

```mdx
<Warning>
**Deprecated**: The Logging feature is deprecated as of this specification
version. It will remain fully functional in all specification versions released
within one year of the <YYYY-MM-DD> release. Each of those versions will
continue to support it for one year after its own release.
</Warning>
```

### Capability negotiation

During the deprecation period, capability negotiation is **unchanged**:

- Clients and servers that support deprecated features SHOULD continue to
  declare the corresponding capabilities.
- Implementations that encounter deprecated capabilities MUST still handle them
  correctly.
- Implementations SHOULD emit a warning (e.g., in logs or developer tooling)
  when deprecated capabilities are negotiated.
- New implementations SHOULD NOT add support for deprecated features unless
  needed for backward compatibility with existing counterparts.

### Timeline

- **Deprecated**: In the next specification release (currently planned for June
  2026).
- **Included in subsequent releases**: All specification versions released
  within one year of this version's release MUST continue to include these
  features as deprecated.
- **Per-version support**: Each version that includes these features will
  support them for one year after that version's release, per the
  one-year-per-version support policy proposed in a separate SEP.
- **Removal**: Specification versions released more than one year after this
  version's release MAY remove these features entirely.

## Rationale

### Why deprecate rather than move to extensions?

These features are already implemented in many clients and servers. The
extensions mechanism (SEP-2133) specifies that unless an extension is provided,
implementations must behave as if the extension is not present. Retrofitting
this logic into existing SDKs — especially across multiple protocol versions —
would be complex and error-prone. Deprecation followed by removal is less
disruptive: implementations can continue using the features as-is during the
transition period, then simply stop when the features are removed.

### Why deprecate rather than remove immediately?

While adoption of these features is low, they are still in use. Removing them
immediately would cause unnecessary churn and disruption for users, client and
server owners, and SDK builders. A deprecation window minimizes this impact by
giving the ecosystem time to migrate at its own pace.

### Why these three features specifically?

These were identified during a core contributor meeting as the features with the
weakest adoption-to-complexity ratio. Each has viable alternatives outside the
protocol, and none are critical to the core resource/tool/prompt interaction
model that defines MCP. See [discussion #2536][discussion-2536].

## Backward Compatibility

During the deprecation period, there are **no backward compatibility issues**.
All deprecated features continue to work identically. No wire-level changes are
introduced.

After removal (in specification versions released more than one year after this
version):

- Implementations negotiating an older protocol version that includes these
  features will still have access to them through that version's schema.
- Implementations negotiating a version that has removed these features will no
  longer have access to them.

## Security Implications

Deprecating these features has a **net positive** effect on security:

- **Sampling** is the most security-sensitive of the three. It allows servers to
  request LLM completions through the client, which creates attack surface for
  prompt injection and data exfiltration. Removing it reduces this risk.
- **Roots** exposes information about the client's filesystem to servers.
  Removing it reduces the risk of servers using root information to attempt
  directory traversal or access files outside intended boundaries.
- **Logging** has minimal security implications, but removing it simplifies the
  protocol surface area.

No new security concerns are introduced by deprecation.

## Reference Implementation

No reference implementation is required. This SEP only marks existing
functionality as deprecated — no new protocol behavior is introduced.
