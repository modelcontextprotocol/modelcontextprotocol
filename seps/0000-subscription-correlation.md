# SEP-0000: Resource Subscription Correlation

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-01-20
- **Author(s)**: Peter Alexander (@pja-ant)
- **Sponsor**: None (seeking sponsor)
- **PR**: TBD

## Abstract

This SEP proposes two related changes to improve the usability of resource subscriptions:

1. **Formalize flexible subscription semantics**: Clarify that subscribing to a URI allows the server to send update notifications for any resource URI it considers relevant to that subscription—not just the exact URI subscribed to. The schema already noted this, but it was not clear in the specification.

2. **Add `subscribedUri` to update notifications**: Include the originally subscribed URI in update notifications, allowing clients to correlate updates with their originating subscriptions.

These changes enable clients to subscribe to resource patterns or collections and correctly correlate incoming updates with their originating subscriptions.

## Motivation

### 1. Flexible Subscription Use Cases

The current specification allows subscribing to individual resource URIs, but many real-world use cases involve monitoring collections or patterns of resources:

- **Directory monitoring**: Subscribe to `file:///home/projects/` and receive updates when any file within it changes
- **Query-based subscriptions**: Subscribe to `file:///query?pattern=*.txt` and receive updates for any matching text file
- **Database collections**: Subscribe to `postgres://db/users` and receive updates when any row changes
- **Filtered resources**: Subscribe to `api:///events?type=error` and receive updates for error events

The existing `ResourceUpdatedNotificationParams` already includes a comment suggesting this behavior ("This might be a sub-resource of the one that the client actually subscribed to"), but this is not formally specified. Servers and clients need clear guidance on whether this pattern is supported and how it should work.

### 2. Subscription Correlation Problem

When a client subscribes to multiple resources, it receives update notifications that only contain the updated resource's URI. This creates several problems:

- **Ambiguous source**: If a client subscribes to both `file:///home/` and `file:///home/projects/`, an update for `file:///home/projects/foo.txt` could have been triggered by either subscription.
- **Callback routing**: Applications often need to route updates to specific handlers based on which subscription triggered them.
- **Subscription management**: Without correlation, clients must maintain complex URI matching logic to determine which subscription(s) an update relates to. It may be impossible to correlate for more complex queries where there isn't an obvious link between the subscribed URI and updated URI.

Including `subscribedUri` in notifications solves these problems by telling the client exactly which subscription triggered each update.

## Specification

### 1. Flexible Subscription Semantics

When a client subscribes to a resource URI, the server MAY send `notifications/resources/updated` for any resource URI it considers relevant to that subscription. This includes but is not limited to:

- The exact URI that was subscribed to
- Child resources (e.g., files within a subscribed directory)
- Resources matching a query or pattern expressed in the subscribed URI
- Any other server-defined relationship

The interpretation of which resources are "covered" by a subscription is URI-scheme-specific and server-defined. Servers SHOULD document their subscription semantics for each supported URI scheme.

### 2. Add subscribedUri to Notifications

Add a `subscribedUri` field to update notifications:

```typescript
export interface ResourceUpdatedNotificationParams extends NotificationParams {
  /**
   * The URI of the resource that has been updated. This might differ
   * from the URI that was originally subscribed to.
   *
   * @format uri
   */
  uri: string;

  /**
   * The URI that was originally subscribed to.
   *
   * @format uri
   */
  subscribedUri: string;
}
```

### 3. Behavior Requirements

1. The server MUST include `subscribedUri` in all update notifications to indicate which subscription triggered the notification.

2. If a resource update matches multiple active subscriptions, the server MUST send separate notifications for each matching subscription, each with the appropriate `subscribedUri`.

### 4. Examples

**Example 1: Subscribe to a directory**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "resources/subscribe",
  "params": {
    "uri": "file:///home/user/projects/"
  }
}
```

Update notification for a file within the directory:

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/resources/updated",
  "params": {
    "uri": "file:///home/user/projects/myapp/src/main.rs",
    "subscribedUri": "file:///home/user/projects/"
  }
}
```

**Example 2: Subscribe to a query pattern**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "resources/subscribe",
  "params": {
    "uri": "file:///logs?pattern=*.error.log"
  }
}
```

Update notification for a matching log file:

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/resources/updated",
  "params": {
    "uri": "file:///logs/app.error.log",
    "subscribedUri": "file:///logs?pattern=*.error.log"
  }
}
```

**Example 3: Exact URI match**

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/resources/updated",
  "params": {
    "uri": "file:///config.json",
    "subscribedUri": "file:///config.json"
  }
}
```

## Rationale

### Why subscribedUri Instead of a Client-Provided Token?

We considered allowing clients to provide a correlation token in subscribe requests that would be echoed back in notifications. However, `subscribedUri` is simpler and sufficient:

- Clients already know what URIs they subscribed to
- `subscribedUri` provides the same correlation capability without requiring clients to generate and track tokens
- The server already has the subscribed URI; no additional state is needed

### Why Separate Notifications for Multiple Matching Subscriptions?

When a resource matches multiple subscriptions, we require separate notifications rather than a single notification with multiple `subscribedUri` values because:

1. **Simpler client logic**: Each notification maps to exactly one subscription
2. **Consistent structure**: The notification format remains the same regardless of overlap
3. **Independent handling**: Different subscriptions may have different handlers with different requirements

## Backward Compatibility

This proposal is fully backwards compatible:

### For Clients

- The new `subscribedUri` field is optional in notifications
- Existing clients will simply not see the new field and continue to work unchanged

### For Servers

- Servers can continue to only send updates for exact URI matches if they don't support broader subscription patterns
- The capability structure remains unchanged; no new capability flags are needed

### Migration Path

1. Servers should start including `subscribedUri` in all update notifications
2. Clients can use `subscribedUri` to correlate updates with subscriptions

## Security Implications

This proposal introduces minimal new security concerns:

- **Subscription scope**: Flexible subscriptions don't grant access to resources the client couldn't already access; they only affect which updates are delivered.
- **Notification volume**: Subscribing to broad patterns (e.g., `file:///` or `db:///?query=*`) could result in many notifications. Servers MAY implement rate limiting or refuse overly broad subscriptions.
