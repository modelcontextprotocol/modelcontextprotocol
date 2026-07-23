# SEP-0000: App-Rendered Elicitations for MCP Apps

- **Status**: Draft
- **Type**: Extensions Track
- **Created**: 2026-07-22
- **Author(s)**: Kyle Rubenok (@krubenok)
- **Sponsor**: None (seeking sponsor)
- **Extension Identifier**: `io.modelcontextprotocol/ui`
- **PR**: TBD

## Abstract

This SEP extends MCP Apps so an MCP server can offer an app resource as the custom user interface
for a core form elicitation. The elicitation remains a standard `elicitation/create` request with a
complete `requestedSchema`; an optional `_meta.ui.resourceUri` identifies the MCP App that can
render it.

Support is negotiated as an additive capability of the existing
`io.modelcontextprotocol/ui` extension. A client that supports core form elicitation but not
app-rendered elicitation receives the ordinary form request unchanged. A capable host loads the
referenced app from the originating server, binds that app instance to the elicitation, and forwards
the standard request over the MCP Apps bridge. The app returns a standard `ElicitResult`, which the
host validates and returns to the server.

The same convention applies to legacy stateful `elicitation/create` exchanges and to
`InputRequiredResult` multi-round-trip requests (MRTR) in protocol revision `2026-07-28`. It does
not introduce another elicitation mode or another extension identifier.

The MCP Apps Working Group and the maintainers of the `ext-apps` repository would own the resulting
extension specification.

## Motivation

Core form elicitation deliberately uses a constrained schema so any supporting client can render a
safe, interoperable native form. That is the right fallback, but it cannot express interfaces such
as visual option comparison, interactive previews, maps, calendars, or domain-specific review
experiences.

MCP Apps can already provide those interfaces for tool results. It does not currently define how a
server associates an app with a particular elicitation, how a host selects the correct app instance,
or how the elicitation request and response cross the app bridge. Implementations therefore face
several incompatible choices:

- replace elicitation with an app-specific tool flow, losing the standard elicitation lifecycle;
- forward the request to whichever app bridge happens to be active, which is ambiguous when
  multiple apps exist;
- define a second extension solely for app-rendered elicitation, despite the feature requiring MCP
  Apps;
- send app metadata without negotiation, leaving clients unsure whether it is optional.

The gap is more visible under the `2026-07-28` protocol revision. MRTR makes elicitation work on
stateless transports by returning an `InputRequiredResult` and retrying the original request with
`inputResponses`. An app-rendering convention should preserve that transport-independent semantic
request rather than reintroducing a session dependency.

The desired result is progressive enhancement: one semantic form elicitation, a richer renderer
when all parties support it, and a native form everywhere else.

## Specification

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD
NOT**, **RECOMMENDED**, **NOT RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be
interpreted as described in BCP 14 when, and only when, they appear in all capitals.

### Scope and ownership

This proposal modifies the existing MCP Apps extension identified by
`io.modelcontextprotocol/ui`. It does not define a new extension identifier. The normative text
resulting from this SEP belongs in the
[`ext-apps`](https://github.com/modelcontextprotocol/ext-apps) specification and remains under the
governance of the MCP Apps Working Group.

This proposal applies only to core form elicitations. URL-mode elicitations are intentionally
excluded because their security boundary requires the sensitive interaction to occur outside the
MCP client.

### Client-to-server capability negotiation

A client that can render core form elicitations with MCP Apps **MUST** declare both:

1. the core `elicitation.form` capability; and
2. an `elicitation` member in its MCP Apps extension settings.

For protocol revision `2026-07-28`, these capabilities are supplied in the request-scoped client
capabilities defined by the core protocol:

```json
{
  "elicitation": {
    "form": {}
  },
  "extensions": {
    "io.modelcontextprotocol/ui": {
      "mimeTypes": ["text/html;profile=mcp-app"],
      "elicitation": {}
    }
  }
}
```

For protocol revisions that negotiate capabilities during initialization, the same capability
object is used in `ClientCapabilities`.

The `elicitation` settings object is reserved for compatible future additions. An empty object
indicates support for this SEP.

A server **MUST NOT** add the app-rendering hint unless the request's effective client capabilities
include core form elicitation, MCP Apps with a supported app MIME type, and the MCP Apps
`elicitation` member. On stateful transports, the effective capabilities are those negotiated for
the session. On `2026-07-28` stateless transports, the request-scoped capabilities take precedence.

### Elicitation metadata

When app-rendered elicitation is negotiated, a server **MAY** add the following metadata to a form
`elicitation/create` request:

```json
{
  "method": "elicitation/create",
  "params": {
    "mode": "form",
    "message": "Review the portfolio and confirm an account manager.",
    "requestedSchema": {
      "type": "object",
      "properties": {
        "confirmed": {
          "type": "boolean",
          "title": "Confirm assignment"
        }
      },
      "required": ["confirmed"]
    },
    "_meta": {
      "ui": {
        "resourceUri": "ui://portfolio/assign-manager"
      }
    }
  }
}
```

`_meta.ui.resourceUri` has the same syntax and resource-resolution semantics as the existing MCP
Apps tool metadata member:

- it **MUST** be an absolute `ui://` URI;
- it **MUST** identify an MCP App resource served by the MCP server that originated the
  elicitation;
- the resource **MUST** use a MIME type negotiated by the client, initially
  `text/html;profile=mcp-app`.

The server **MUST** include a complete, independently renderable core `requestedSchema`. The app
metadata is a presentation hint and **MUST NOT** alter the meaning, validation rules, or response
shape of the elicitation.

The `ui` metadata object is inherited from MCP Apps. Other MCP Apps metadata fields may be added in
the future without changing the core elicitation schema.

### App and host bridge capabilities

MCP Apps uses `ui/initialize` to negotiate the capabilities of a particular app instance and host.
This SEP adds an `elicitation` member to both `McpUiAppCapabilities` and `HostCapabilities`:

```typescript
interface McpUiAppCapabilities {
  // Existing members omitted.
  elicitation?: {};
}

interface HostCapabilities {
  // Existing members omitted.
  elicitation?: {};
}
```

An app declares `appCapabilities.elicitation` when it can receive and answer a forwarded
`elicitation/create` request. A host declares `hostCapabilities.elicitation` when it can forward
the request to the bound app and accept the standard response.

The host **MUST NOT** forward an elicitation until both members have been negotiated for that app
instance. An app that declares this capability **MUST** handle standard form
`elicitation/create` requests and return a standard `ElicitResult`.

### Host rendering and routing

When a host receives a form elicitation containing `_meta.ui.resourceUri`, it:

1. **MUST** verify that the client-to-server capability was negotiated;
2. **MUST** resolve the resource from the server that originated the elicitation using the existing
   MCP Apps resource-loading rules;
3. **MUST** create or select an app instance explicitly bound to this elicitation and resource;
4. **MUST** complete the MCP Apps `ui/initialize` handshake;
5. **MAY** forward the unchanged `elicitation/create` request to the app if both bridge
   capabilities were negotiated;
6. **MUST** validate an accepted response's `content` against `requestedSchema`; and
7. **MUST** return the resulting standard `ElicitResult` through the core elicitation flow.

The host **MUST NOT** route an elicitation to an app merely because its bridge is currently active.
The binding is scoped to the originating server, elicitation request, resource URI, and app
instance. An implementation **MAY** reuse an already loaded instance only when that complete binding
is preserved.

The host **SHOULD** tear down an app instance created solely for an elicitation after acceptance,
decline, cancellation, timeout, or request cancellation. Sequential and concurrent elicitations
are supported; concurrent requests require distinct bindings even if an implementation reuses the
same underlying app resource.

The app's response action (`accept`, `decline`, or `cancel`) retains its core elicitation meaning.
The app **MUST NOT** directly retry the server operation or bypass the host's response handling.

### Native fallback

App rendering is optional progressive enhancement.

If the client supports core form elicitation but does not declare MCP Apps elicitation support, the
server **MUST** omit `_meta.ui.resourceUri` and send the ordinary form elicitation.

If an app resource cannot be loaded, the app fails initialization, the app does not declare its
bridge capability, or the host otherwise cannot use the app, the host **SHOULD** render the same
`requestedSchema` with its native form UI. It **SHOULD NOT** convert the failure into `decline` or
leave the request pending indefinitely.

A host that encounters app metadata it does not understand **MUST** ignore the metadata according
to the core `_meta` extensibility rules and process the form elicitation normally.

Servers that require semantics not expressible by `requestedSchema` are not compatible with this
fallback contract and **MUST NOT** present those semantics as an app-rendered form elicitation.

### MRTR and transport behavior

This proposal does not change the MRTR wire format. In protocol revision `2026-07-28`, the
`elicitation/create` input request, including optional MCP Apps metadata, appears inside the
`inputRequests` map of an `InputRequiredResult`:

```json
{
  "resultType": "input_required",
  "inputRequests": {
    "manager-assignment": {
      "method": "elicitation/create",
      "params": {
        "mode": "form",
        "message": "Review the portfolio and confirm an account manager.",
        "requestedSchema": {
          "type": "object",
          "properties": {
            "confirmed": {
              "type": "boolean"
            }
          },
          "required": ["confirmed"]
        },
        "_meta": {
          "ui": {
            "resourceUri": "ui://portfolio/assign-manager"
          }
        }
      }
    }
  },
  "requestState": "assign-account-manager:v1"
}
```

After collecting the app or native form response, the client retries the original request with the
standard `inputResponses` and `requestState`. The server **MUST** process the retry identically
regardless of which renderer collected the response.

On legacy stateful transports, the same semantic request may be delivered as a direct
server-to-client `elicitation/create` request. No app-rendering state may be assumed to survive on
the server between MRTR rounds.

## Rationale

### Extend MCP Apps instead of defining a dependent extension

App-rendered elicitation has no meaning without MCP Apps. The current extension framework does not
define extension dependency semantics, version constraints, or profiles. A second extension would
therefore duplicate negotiation rules while being unable to formally require
`io.modelcontextprotocol/ui`.

Adding a nested capability to MCP Apps keeps governance, bridge behavior, resource loading, and
security policy in the extension that owns them. The separate
`io.modelcontextprotocol/ui-elicitation` identifier used by the early prototype remains useful for
private experimentation but is not proposed for standardization.

### Preserve a complete form schema

Treating the app as a renderer rather than a new elicitation mode gives every form-capable client a
working path and keeps validation authoritative at the host. It also prevents a server from using
custom UI to smuggle a response shape that cannot be understood by non-app clients.

### Use an explicit resource binding

Forwarding elicitation requests over the currently active app bridge, as explored in
[ext-apps PR #531](https://github.com/modelcontextprotocol/ext-apps/pull/531), is attractive for
already-rendered apps but does not determine which app should handle a new elicitation. An explicit
`resourceUri` works when no app is active, supports prefetch and review, and removes ambiguity when
several apps are open.

This proposal is compatible with bridge forwarding once the resource-bound instance is selected.

### Reuse the standard request and response

The app does not need a custom submission method. Receiving `elicitation/create` and returning
`ElicitResult` preserves action semantics, cancellation, schema validation, SDK types, and MRTR
retry behavior. It also follows MCP Apps' existing practice of reusing standard MCP messages over
the app-host bridge.

### Related work

- [ext-apps issue #511](https://github.com/modelcontextprotocol/ext-apps/issues/511) describes the
  core app-as-elicitation-UI use case.
- [ext-apps discussion #514](https://github.com/modelcontextprotocol/ext-apps/discussions/514)
  explores capability negotiation and routing alternatives.
- [ext-apps PR #531](https://github.com/modelcontextprotocol/ext-apps/pull/531) prototypes
  forwarding elicitation messages through the app bridge.
- [ext-apps PR #390](https://github.com/modelcontextprotocol/ext-apps/pull/390) explores an
  app-oriented tool workaround.
- [SEP-2322](./2322-MRTR.md) defines the transport-independent MRTR flow used by the reference
  implementation.

## Backward Compatibility

This proposal is additive.

- Clients without MCP Apps continue to receive ordinary form elicitations.
- MCP Apps clients that do not implement this proposal do not advertise the nested capability and
  continue to use native forms.
- Servers that do not implement this proposal send unchanged core elicitation requests.
- Unknown `_meta` fields remain ignorable.
- The request and response schemas remain those of core elicitation.

Implementations must not infer support from the presence of MCP Apps alone. Requiring the nested
capability prevents an older Apps host from accidentally receiving a request it cannot route.

## Security Implications

An app-rendered elicitation processes server-provided code and user-provided data at a trust
boundary. All existing MCP Apps sandbox, Content Security Policy, permission, and auditing
requirements continue to apply.

In addition:

- The host **MUST** fetch the resource from the originating MCP server and **MUST NOT** allow the
  metadata to select an app from another server connection.
- The host **MUST** bind the app instance to the originating server, elicitation request, and
  resource URI to prevent confused-deputy routing.
- The host **MUST** treat the app as untrusted and **MUST** validate accepted content against
  `requestedSchema` outside the app sandbox.
- The app **MUST NOT** receive capabilities or server access beyond those negotiated through MCP
  Apps.
- Hosts **SHOULD** make the identity of the originating server visible to the user and preserve
  their normal consent and cancellation controls.
- Hosts and servers **SHOULD** avoid placing secrets in form-mode elicitation. Sensitive credential,
  payment, and third-party authorization flows should use URL-mode elicitation and its separate
  trust boundary.
- Implementations **SHOULD** apply timeouts and release bound app instances when the elicitation or
  originating request is cancelled.

App rendering does not make the app's validation authoritative and does not grant the app permission
to call server tools. Any app-initiated tool call remains subject to the existing MCP Apps
capabilities and host approval policy.

## Reference Implementation

A draft implementation is available in
[modelcontextprotocol/csharp-sdk PR #1723](https://github.com/modelcontextprotocol/csharp-sdk/pull/1723).
It builds on the C# SDK 2.0.0 preview and includes:

- experimental, strongly typed MCP Apps capability and metadata APIs;
- request-scoped capability checks for protocol revision `2026-07-28`;
- stateless MRTR request and typed retry helpers;
- a minimal MCP server, host, and app sample;
- tests proving both app-enhanced and native form fallback paths.

The implementation is marked experimental using the SDK's MCP Apps diagnostic while this SEP is
under discussion.

For prototype users that need independently negotiated deployment before this proposal is adopted,
the earlier
[`io.modelcontextprotocol/ui-elicitation` branch](https://github.com/krubenok/csharp-sdk/tree/feature/apps-elicitation)
is retained. It is not the proposed final protocol design.
