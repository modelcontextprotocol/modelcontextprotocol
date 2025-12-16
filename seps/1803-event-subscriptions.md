# SEP-1803: Event Subscriptions

- **Status:** Draft
- **Type:** Standards Track
- **Created:** 2025-11-12
- **Authors:** Casey Chow <caseychow@openai.com> (@caseychow-oai)
- **Sponsor**: Nick Cooper (@nickcoai)
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1803

## Abstract

Introduce a reliable event subscription model for MCP. Servers advertise event types using `event://` resources, and clients create subscriptions delivered either in-band over MCP notifications or out-of-band via webhooks. Out-of-band subscriptions can further be listed in `subscription://` resources.

## Motivation

MCP servers need push triggers to launch event-driven agents or workflows. It's easy to listen to a couple of events from a service, but the overall ecosystem is extremely fragmented, with no widely-adopted protocol for sending/receiving events between services. This SEP provides a means for agents to reliably listen for events they can act on.

## Specification

### Capability Advertisement

Servers announce support during handshake via `resources` capabilities:

```ts
type ServerCapabilities = {
  resources?: {
    /** Whether this server supports enumerating events. */
    events?: boolean;

    /** Whether this server supports subscribing to resource updates.
        MUST be true if in-band event notifications are supported */
    subscribe?: boolean;

    /** The protocols this server supports subscribing to for resource updates out of band. */
    subscription?: ("notification" | "webhook")[]; // this can be expanded to other protocols

    // .. existing keys
  };

  // ... existing keys
};
```

### Event Resources

Events are resources identified by `event://` URIs so they can be listed with `resources/list` or `resources/templates/list` and subscribed via `resources/subscribe`.

```ts
interface EventResource implements Resource {
  _meta?: {
    /** JSON Schema for the event payload */
    eventSchema?: Record<string, unknown>;

    [key: string]: unknown;
  };

  uri: `event://${string}`;

  // ... existing fields on Resource
}

interface EventResourceTemplate /* implements ResourceTemplate */ {
  _meta?: {
    /** JSON schema describing the uri templates. */
    paramsSchema?: {
      properties?: { [key: string]: object };
      required?: string[];
      type: “object”;
    };
    /** JSON Schema for the event payload */
    eventSchema?: {
      properties?: { [key: string]: object };
      required?: string[];
      type: “object”;
    };
    /** The webhook `type` value for this event */
    webhookType?: string;

    [key: string]: unknown;
  };

  uriTemplate: `event://${string}`; // RFC 6570 template

  // ... existing fields on ResourceTemplate
}
```

### In-Band Subscribe and Unsubscribe

Subscribing to and unsubscribing from events requires no protocol changes for client shapes.

- **Subscribe:** Clients call existing `resources/subscribe` with an `event://...` URI.
- **Unsubscribe:** `resources/unsubscribe` with the event URI.

When delivering events, the server, as before, MUST emit `notifications/resources/updated`, which takes on the following payload shape:

```ts
interface ResourceUpdatedNotification {
  method: “notifications/resources/updated”;
  params: {
    /** The URI of the resource that has been updated. This might be a sub-resource of the one that the client actually subscribed to. */
    uri: string;

    /** The payload of the notification. */
    payload?: unknown;
  };
}
```

If an `eventSchema` was provided in the resource definition, the server SHOULD conform to said schema in the payload field. When communicating over the streamable HTTP transport, the server SHOULD enable resumability/redelivery for durability, but delivery remains best effort.

### Out-of-Band Subscribe / Unsubscribe (Experimental Tool)

Out-of-band registration is exposed as method `resources/subscriptions/register`. The client is expected to provide a target URI, but the server is responsible for generating and transmitting the webhook secret.

```ts
interface RegisterSubscriptionRequest {
  method: "resources/subscriptions/register";
  params: {
    /** The URIs of the resources to subscribe to. */
    uris: `event://${string}`[];

    /** The target URI the MCP server should call. */
    targetUri: string;
  };
}

type WebhookSecret =
  | { type: "raw"; value: string } // simple shared secret
  | { type: "standard"; key: string } // Standard Webhooks key
  | { type: "none" };

interface RegisterSubscriptionResult {
  _meta?: Record<string, unknown>;
  subscription: {
    /** The URI of the created subscription. */
    uri: string;

    /** The URI the subscription listens to. */
    eventUris: string[];

    /** The URI the subscription calls. */
    targetUri: string;

    /** For webhook listeners, the secret configuration of the webhook. */
    webhookSecret?: WebhookSecret;
  };
}
```

There is currently one supported out-of-band protocol, webhooks. To simplify client implementation, the server SHOULD send webhooks to the specified target in [Standard Webhooks](https://www.standardwebhooks.com) format.

Deregistration occurs using `resources/subscriptions/deregister` with the provided subscription URI:

```typescript
interface DeregisterSubscriptionRequest {
  method: "resources/subscriptions/deregister";
  params: {
    /** The URI of the subscription to deregister. */
    uri: string;
  };
}
```

## Rationale

- Reusing `resources/templates/list` and `resources/subscribe` avoids new protocol primitives while enabling event discovery and streaming delivery (for in-band).
- While it would be ideal to support everything in-band, keeping an SSE connection open indefinitely generally only makes sense within the context of a single agent session or at low scale. Out-of-band allows us to get this information more easily.
- This proposal aims to align with the long-running/async proposals noted in #982.
- Prior art guiding payloads and APIs: [Svix Dispatch API](https://api.svix.com/docs#tag/Endpoint), [Zapier REST Hooks](https://docs.zapier.com/platform/build/hook-trigger), and [Standard Webhooks](https://www.standardwebhooks.com)

## Backward Compatibility

- New RPCs `resources/subscriptions/register` and `resources/subscriptions/deregister`. The out-of-band subscription capability is advertised so naming collisions are mitigated by checking for that capability. These are client-driven, so clients with support for events/subscriptions can continue to interoperate with servers without support.
- New special-case URIs `event://` and `subscription://`. This represents a moderate naming collision risk since these are fairly common terms. However, reserving usage for these protocols in a later version of MCP is quite safe since the `resources.events` capability must be advertised.

## Security Implications

- Webhook secrets: out-of-band notifications requires establishing shared secrets in some cases. The security of the secret handoff should be validated, and server implementations need to store secrets securely.
- More generally, partial adoption of webhook security is a major security risk. That said, mandating full adoption is infeasible; it's better to be practical and make full adoption easier than it is to detect and block partial adoption.

## Reference Implementation

TODO for shareout. I have an example server built on FastMCP that required a non-trivial amount of monkey-patching, but modifying FastMCP itself to support this proposal and building off of that appears straightforward.
