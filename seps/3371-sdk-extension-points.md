# SEP-3371: Consistent SDK Extension Points

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-09-18
- **Author(s)**: Sambhav Kothari (@sambhav)
- **Sponsor**: Felix Weinberger (@felixweinberger)
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3371

## Abstract

This SEP requires Tier 1 Model Context Protocol (MCP) SDKs to provide three extension points through public APIs:

1. **Extension registration:** enable an extension by identifier, declare its capabilities, and check its local dependencies.
2. **Custom methods:** register and call extension-defined requests and notifications. Extensions can add methods but cannot redefine existing ones.
3. **Middleware:** wrap core and custom messages, when sending and receiving, within each method's registered types.

SDKs should also document how to package these as a unit, so extension authors can publish independent packages that applications enable when they configure a client or server. This SEP adds no wire fields or methods.

## Terminology

| Term                | Meaning                                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Protocol extension  | A specification, identified by a namespaced name, that adds capabilities, methods, or behaviour to MCP (see SEP-2133). |
| SDK extension point | A public API that application or extension code uses to add behaviour.                                                 |
| Method contract     | The message types and exchanges a method allows, as defined by the protocol or extension specification.                |
| Middleware          | Code that wraps a step in sending or receiving a message. Applies to clients and servers.                              |
| Payload             | Message parameters or results, including `_meta`.                                                                      |
| Envelope            | The JSON-RPC fields that identify and correlate messages: `jsonrpc`, `id`, and `method`.                               |

## Motivation

As MCP extensions multiply, bundling their implementations into SDKs ties extension and SDK maintenance together. SDK maintainers carry extension-specific code, dependencies, tests, and documentation alongside the core protocol. Extension owners depend on each SDK's review capacity and release schedule for their features, fixes, and deprecations, and the two sets of priorities rarely line up.

Forks allow separate releases but need continuous rebasing, and extensions built on different forks cannot be combined on one SDK. [SEP-2133](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/2133-extensions.md) defines how protocol extensions are developed but leaves SDK integration open, and SDKs currently differ in what they support ([Appendix A](#appendix-a-prior-art-and-sdk-support)). A common set of public extension points lets extension owners ship their own packages and lets applications combine them on one SDK, without making SDK maintainers responsible for every extension.

## Specification

### Conventions

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, **MAY**, and **OPTIONAL** are to be interpreted as described in [BCP 14](https://www.rfc-editor.org/info/bcp14) when, and only when, they appear in all capitals.

Requirements are stated for SDKs. They apply as written to Tier 1 SDKs; for other SDKs, each **MUST** and **MUST NOT** is a **SHOULD** and **SHOULD NOT**. They apply to protocol version `2026-07-28` and later. SDKs **MAY** offer the same extension points on earlier versions.

This SEP specifies behaviour, not API shape. Existing APIs, builder options, interfaces, or wrappers can satisfy it; a new plugin framework is not required. Protocol and extension specifications continue to define message formats, capability negotiation, and method contracts. Transports and package loading are out of scope.

Examples use concise TypeScript and follow a single catalog-search extension. Names, types, and signatures are illustrative. They are not required APIs and do not describe any existing SDK. Imports, schemas, and handler bodies are omitted.

### General requirements

These apply to all three extension points. Each requirement states an outcome; how an SDK provides it, through builders, interfaces, types, attributes, macros, or existing hooks, is its choice.

- External packages **MUST** be able to use the extension points through documented public APIs, without an SDK fork, an SDK-owned allowlist, or an organisation-managed namespace or publishing access.
- Applications and extension setup code **MUST** be able to tell which extensions are registered before messages are processed.
- If an extension or any of its contributions cannot be registered, the SDK **MUST** report an error and **MUST NOT** process messages with that extension partially installed.
- SDKs **MAY** limit registration to configuration time. Runtime installation and removal are **OPTIONAL**.

### 1. Extension registration

An extension package bundles its capability declarations, dependencies, custom methods, and middleware. Applications enable it through the SDK's normal configuration mechanism.

```typescript
// Defined by the search package.
function searchExtension() {
  return new Extension("com.example/search", {
    capabilities: { selectionNotifications: true },
    requires: (config) => config.has("resources"),
    setup: registerSearchMethods,
    middleware: [searchMiddleware],
  });
}

// Application setup.
const server = new Server({
  extensions: [searchExtension(), auditExtension()],
});
server.addResource("catalog", { handler: readCatalog }); // enables resources
await server.start(); // this SDK checks dependencies here
```

SDKs **MUST** let applications enable multiple independently packaged extensions on the same client or server, and **MUST** reject a duplicate extension identifier.

#### Capabilities

Extensions declare support in the `ClientCapabilities.extensions` and `ServerCapabilities.extensions` maps defined by SEP-2133, keyed by extension identifier.

- An extension **MUST** be able to declare its entry and settings in that map as part of registration.
- Extension code **MUST** be able to read the peer's capabilities wherever the SDK already makes them available, such as discovery, initialization, or request context.

#### Dependencies

An extension can depend on the local configuration: core capabilities and their sub-features, or other registered extensions. The SDK decides how dependencies are expressed, for example as a predicate over the configuration, a declarative map, or types. The rules for what counts as a match belong to the SDK and the extension, not to this SEP. Dependencies are local: they add no wire fields and do not advertise support to peers.

- A dependency **MUST NOT** be considered unmet solely because it was registered or enabled after the extension that requires it.
- An extension's handlers and middleware **MUST NOT** run unless its dependencies are satisfied by the local configuration applicable to that execution.
- SDKs choose when to check dependencies and **SHOULD** check before serving where possible. A configuration-time check is sufficient when the relevant configuration cannot change. Where it can change or vary by request, the SDK **MUST** ensure the dependencies remain satisfied before running the extension.
- An unmet dependency **MUST** produce an error that identifies the extension and the failed requirement. For a boolean predicate, the SDK can use an extension-provided description of that requirement; the predicate need not return structured diagnostics. If the check runs while handling a peer's request, the SDK **SHOULD** answer with an internal error (`-32603`), since the fault is local configuration. A notification has no response; the SDK reports the failure through its existing local error path without running the extension.

These checks do not install packages or enable capabilities.

For example, a hypothetical catalog-search extension might require a separately packaged catalog-index extension. An application can register them in either order. Before search handlers run, the SDK checks that the catalog-index extension is available with the features search requires. This check neither installs nor enables the dependency. Dependencies do not determine middleware order.

### 2. Custom methods

SDKs **MUST** let extensions register handlers for custom requests and notifications, and send them, with typed or validated parameters and results in whatever form fits the language.

```typescript
// Called for each server that enables search.
function registerSearchMethods(server: Server) {
  server.registerRequestHandler("com.example/search", {
    handler: searchCatalog,
    paramsSchema: SearchParamsSchema,
    resultSchema: SearchResultSchema,
  });
  server.registerNotificationHandler("com.example/search-selected", {
    handler: onSearchSelected,
    paramsSchema: SearchSelectedParamsSchema,
  });
}

// Peer usage.
const result = await session.call(
  "com.example/search",
  { query: "invoices" },
  { resultSchema: SearchResultSchema },
);
await session.notify("com.example/search-selected", { query: "invoices" });
```

Registering a method fixes its name and types:

- SDKs **MUST** reject an extension's registration that reuses a registered method name, whether as a request or a notification, including core method names.
- The extension points in this SEP **MUST NOT** let an extension change a registered method's types. The SDK owns the envelope and request correlation.

Changing what a method does, through middleware or an SDK's existing handler-replacement API, is permitted within those types.

### 3. Middleware

Middleware is code that wraps the processing of messages. SDKs **MUST** let applications and extensions add middleware that covers core and custom requests, responses, and notifications, in both directions. Adding middleware does not register a method or declare a capability. The shape is the SDK's choice: wrapped handlers, layers, filters, interceptors, or callbacks all work if they meet the requirements below.

```typescript
function searchMiddleware(next: Handler): Handler {
  return async function* (request) {
    // Inspect or modify the request, or return early.
    for await (const message of next(request)) {
      // Inspect or modify each response or notification.
      yield message;
    }
    // Run after normal completion.
  };
}
```

This example uses an async generator. Other SDKs can use their own streaming or callback mechanisms.

#### What middleware can do

- Act before and after downstream processing, or return early without calling it.
- Modify or replace a payload, with any outcome the method contract allows, including supported intermediate results and follow-up exchanges.
- Add, update, and remove `_meta` entries, including on nested objects, within the protocol's rules for reserved keys. Changes **MUST** reach downstream middleware and the recipient, and the SDK **MUST** preserve `_meta` entries it does not recognise.
- Use the context the SDK already exposes, such as authentication, cancellation, or peer capabilities. This context is local and is not serialized.
- Forward or suppress a notification, where the protocol permits, without ending the surrounding operation.

SDKs **MUST** provide each of these.

#### Streams

Some methods produce more than one message. Middleware **MUST** be able to act on each message as it is produced or consumed, not only on a final result. Adding middleware **MUST NOT** change delivery order, cancellation, or error propagation, or force buffering of the whole stream. This covers protocol messages, not transport frames.

In the sending direction, middleware acts on an outgoing message before it is sent and on any messages returned by that operation. For a client request, this covers the outgoing request and the peer's response messages, including supported intermediate results. An outgoing notification has no response of its own. A notification emitted on a `subscriptions/listen` stream can be handled as a yielded message in the receiving chain for that request. A separate sending chain is not required when the receiving chain already covers those outbound messages. SDKs choose the API shape; the generator above illustrates receiving middleware, not a required signature for every direction.

#### Errors and cleanup

Errors follow the language's normal mechanisms and the SDK's existing error path. When processing completes, fails, is cancelled, or stops early, the SDK **MUST** end middleware through the language's normal cleanup mechanisms rather than detaching or leaking it. SDKs do not need to guarantee cleanup the language itself does not guarantee after cancellation.

#### Ordering

Middleware composes in layers. A message passes through outer layers before inner ones, and results and errors return in reverse. A layer that returns early skips the layers inside it.

- Applications **MUST** have a way to determine the relative order of middleware from application code and from each extension. Any mechanism is sufficient: registration order, an explicit list, numeric priorities, before/after anchors, or order fixed statically in code.
- The resulting order **MUST** be deterministic and documented, including how ties are broken and where middleware runs relative to parsing, validation, dispatch, and serialization.
- An extension's own middleware keeps the order the extension declares. An extension **MUST NOT** be able to remove or reorder another extension's or the application's middleware.
- SDKs **MAY** let an extension expose named insertion points within its middleware. Where an extension does, applications **MUST** be able to place middleware at those points. [Appendix C](#appendix-c-example-design-for-stacking-middleware) sketches one design.

Inspecting the order at runtime is **OPTIONAL**. Sending and receiving **MAY** use separate orders. Dependencies do not determine order.

### Packaging

SDKs **SHOULD** document how to package an extension, declare SDK compatibility, and enable it in an application. A package can be as simple as a function that calls the registration APIs above. These are public APIs, so each SDK's versioning policy covers changes to them.

### Extension rules

Extensions that follow these rules add no wire fields or core methods and can be built entirely on these extension points:

- Notifications use methods the extension defines. Extensions do not add notification types or filter fields to core streams such as `subscriptions/listen`.
- Extension error codes are allocated outside the JSON-RPC reserved range (`-32768` to `-32000`), as the [base protocol](https://modelcontextprotocol.io/specification/2026-07-28/basic#error-codes) recommends.
- Extra metadata on core types goes in `_meta`, not in new fields on core types such as `Tool.annotations`.

Extensions that need more remain valid extensions, but they are responsible for their own compatibility with each SDK over time. SDK maintainers **MAY** add direct support where composition cannot meet a concrete need, but are not required to. Core protocol changes follow the core protocol process and are not constrained by these extension points.

## Rationale

Working group discussions and the survey in [Appendix B](#appendix-b-extension-requirements) show that most extensions need only registration, custom methods, and middleware.

- **Common behaviour, language-specific APIs.** A shared plugin interface would constrain SDK design without improving interoperability between peers.
- **Types are fixed at registration; behaviour composes.** If a later registration could redefine a method, its types would depend on registration order. Fixing types while letting behaviour be wrapped or replaced lets independent packages combine safely and keeps existing replacement APIs working.
- **Dependencies are independent of registration order.** Applications often enable a capability after registering the extension that needs it, for example by adding the first resource. Dependencies must be satisfied by the configuration applicable when the extension runs, which can be fixed at startup or vary by request. Leaving check timing to the SDK supports both designs without requiring a globally final configuration.
- **Ordering is required; the mechanism is not.** Applications need to interleave middleware across extensions, but SDKs already express order in different ways ([Appendix A](#appendix-a-prior-art-and-sdk-support)).

## Backward Compatibility

This SEP adds no wire fields or methods. Applications that enable no extensions or middleware see no change in protocol behaviour.

Some SDKs will need API changes, such as adding a checked registration path for extension methods. Existing handler-replacement APIs can remain. Maintainers choose the migration approach.

As with other SEPs, the Tier 1 requirement and its conformance scenarios take effect with the first specification release after this SEP reaches Final, and the [tiering documentation](https://modelcontextprotocol.io/community/sdk-tiers) is updated accordingly. SDKs **MAY** implement earlier.

## Security Implications

Extensions and middleware run as trusted application code with access to protocol data. Applications should enable only code they trust; registration checks and explicit ordering do not sandbox it.

Middleware does not bypass the SDK's protocol validation or authorization checks, and does not replace transport authentication. Extensions should not place credentials in `_meta`.

## Reference Implementation and Conformance

A complete reference implementation is still needed; the APIs in [Appendix A](#appendix-a-prior-art-and-sdk-support) implement parts of this proposal. Conformance follows [SEP-2484](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/2484-conformance-tests-required-for-final-seps.md). How each SDK tests its implementation is up to the SDK.

## Appendix A: Prior art and SDK support

The same composition pattern appears in [Django](https://docs.djangoproject.com/en/5.2/topics/http/middleware/#middleware-order-and-layering), [Koa](https://koajs.com/#cascading), [ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/middleware/?view=aspnetcore-10.0), and [Tower](https://docs.rs/tower/0.5.3/tower/struct.ServiceBuilder.html#order). Earlier [extension integration discussions](https://github.com/modelcontextprotocol/go-sdk/issues/954#issuecomment-4792634369) describe the cost of bundling experimental implementations and combining independently maintained forks.

Assessed on 2026-09-18 against the linked revisions; tiers follow the [official SDK listing](https://modelcontextprotocol.io/docs/2026-07-28/sdk), updated for Ruby's move to Tier 1 ([#3248](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3248)).

**Legend:** ✅ public API exists for the stated scope; ❌ confirmed gap; ? not verified. Registration entries show extension-ID registration / capability-map support. Middleware counts only if it operates on MCP messages. Ratings describe available APIs, not conformance with this SEP.

| SDK (tier)     | Registration and capabilities | Custom methods |     Middleware      |
| -------------- | :---------------------------: | :------------: | :-----------------: |
| TypeScript (1) |            ? / ✅             |       ✅       |          ?          |
| Python (1)     |            ✅ / ✅            |       ✅       |      ✅ server      |
| C# (1)         |            ? / ✅             |       ✅       |      ✅ server      |
| Go (1)         |            ? / ✅             |  ✅ requests¹  |         ✅          |
| Rust (1)       |            ? / ✅             |       ✅       |     ✅ wrappers     |
| Ruby (1)       |            ? / ✅             |  ✅ requests¹  |          ?          |
| Java (2)       |            ? / ❌             | ✅ session API | ✅ handler wrappers |
| PHP (3)        |            ✅ / ✅            |       ✅       |          ?          |
| Kotlin (3)     |            ? / ✅             |       ✅       |          ?          |
| Swift (3)      |            ? / ❌             |       ✅       |          ?          |

¹ Custom requests are supported; custom-notification registration and dispatch are unverified.

- **TypeScript:** [custom methods](https://github.com/modelcontextprotocol/typescript-sdk/blob/60321700871029401a2e3bed8fdf4f02c9ec3331/docs/advanced/custom-methods.md) replace existing handlers; [client middleware](https://github.com/modelcontextprotocol/typescript-sdk/blob/60321700871029401a2e3bed8fdf4f02c9ec3331/docs/clients/middleware.md) wraps HTTP `fetch`, not MCP messages.
- **Python:** [extension registration](https://github.com/modelcontextprotocol/python-sdk/blob/6affe5c0d3588fd1705713b3703dc68015cfe3eb/docs/advanced/extensions.md) rejects custom request conflicts but only warns on core notification conflicts; [middleware](https://github.com/modelcontextprotocol/python-sdk/blob/6affe5c0d3588fd1705713b3703dc68015cfe3eb/docs/advanced/middleware.md) is provisional and server-side.
- **C#:** [request registration](https://github.com/modelcontextprotocol/csharp-sdk/blob/324ccd83c357acf611e1cf3a6935a945ee600442/src/ModelContextProtocol.Core/Server/McpServerOptions.cs) is experimental and can override built-ins; [filters](https://github.com/modelcontextprotocol/csharp-sdk/blob/324ccd83c357acf611e1cf3a6935a945ee600442/docs/concepts/filters.md) cover notifications and early returns.
- **Go:** [registration](https://github.com/modelcontextprotocol/go-sdk/blob/3b917b466cc540079b82bcd0fecdc46a2ba13644/mcp/server.go) rejects core names but replaces duplicate custom handlers; [middleware](https://github.com/modelcontextprotocol/go-sdk/blob/3b917b466cc540079b82bcd0fecdc46a2ba13644/mcp/client.go) uses nested sending and receiving chains.
- **Rust:** [dispatch](https://github.com/modelcontextprotocol/rust-sdk/blob/fd7811fdaa9fefa1c8034534b4d7a31c97204f89/crates/rmcp/src/handler/server.rs) has no extension registry; [service wrappers](https://github.com/modelcontextprotocol/rust-sdk/blob/fd7811fdaa9fefa1c8034534b4d7a31c97204f89/crates/rmcp/src/service.rs) wrap received calls, and both directions need adapters.
- **Ruby:** [registration](https://github.com/modelcontextprotocol/ruby-sdk/blob/f22ce86e976be6c71b15c386d5b42c12e5f32ee0/lib/mcp/server.rb) rejects existing names; [extension capabilities](https://github.com/modelcontextprotocol/ruby-sdk/blob/f22ce86e976be6c71b15c386d5b42c12e5f32ee0/docs/_extensions/capability-extensions.md) exist.
- **Java:** [public session handler maps](https://github.com/modelcontextprotocol/java-sdk/blob/183935bf80dcb5c70bc13cd7b1eef99ce7053ec3/mcp-core/src/main/java/io/modelcontextprotocol/spec/McpServerSession.java) allow wrapping; [capability records](https://github.com/modelcontextprotocol/java-sdk/blob/183935bf80dcb5c70bc13cd7b1eef99ce7053ec3/mcp-core/src/main/java/io/modelcontextprotocol/spec/McpSchema.java) lack `extensions`.
- **PHP:** [extension registration](https://github.com/modelcontextprotocol/php-sdk/blob/16836d4e9a0f96831789ac6e64d5ec5238d2c833/src/Server/Builder.php) permits some built-in overrides; [custom handlers](https://github.com/modelcontextprotocol/php-sdk/blob/16836d4e9a0f96831789ac6e64d5ec5238d2c833/docs/advanced/custom-handlers.md) replace rather than wrap.
- **Kotlin:** [handlers](https://github.com/modelcontextprotocol/kotlin-sdk/blob/1d04427cff47b31932409b90959869aa2934d680/kotlin-sdk-core/src/commonMain/kotlin/io/modelcontextprotocol/kotlin/sdk/shared/Protocol.kt) replace existing ones; [capability models](https://github.com/modelcontextprotocol/kotlin-sdk/blob/1d04427cff47b31932409b90959869aa2934d680/kotlin-sdk-core/src/commonMain/kotlin/io/modelcontextprotocol/kotlin/sdk/types/capabilities.kt) include extension maps.
- **Swift:** [handlers](https://github.com/modelcontextprotocol/swift-sdk/blob/a0ae212ebf6eab5f754c3129608bc5557637e605/Sources/MCP/Server/Server.swift) replace methods and append notification handlers; [client APIs](https://github.com/modelcontextprotocol/swift-sdk/blob/a0ae212ebf6eab5f754c3129608bc5557637e605/Sources/MCP/Client/Client.swift) have no general middleware, and capability models lack `extensions`.

All ten SDKs expose `_meta`. Full metadata preservation still needs testing against released versions.

## Appendix B: Extension requirements

Assessed on 2026-09-18 against the linked revisions.

**Legend:** ✅ used; ◯ optional; - not needed; ⚠️ useful but insufficient for the full behaviour; ? not enough detail. Registration entries show registration / capability declaration. These describe API needs, not completed implementations.

| Extension                                                                                                                                                                                             | Registration and capabilities | Custom methods | Middleware |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------: | :------------: | :--------: |
| [Apps](https://github.com/modelcontextprotocol/ext-apps/blob/6d9bdc7babf275b759225aa722cbf5510c4c6021/specification/draft/apps.mdx)                                                                   |            ✅ / ✅            |       -        |     ◯      |
| [Skills](https://github.com/modelcontextprotocol/ext-skills/blob/41e7c66db2510a3e98d9614eb1998f6b970006d7/specification/stable/skills.mdx)                                                            |            ✅ / ✅            |       ✅       |     -      |
| [Tasks](https://github.com/modelcontextprotocol/ext-tasks/blob/9263312d11a682ac83f83fe84794d4627efd22f5/specification/draft/tasks.md)                                                                 |            ✅ / ✅            |       ⚠️       |     ⚠️     |
| [Interceptors (experimental)](https://github.com/modelcontextprotocol/experimental-ext-interceptors/blob/b60459844cc95f2170297ebe1c84b7de8b752953/docs/sep.md)                                        |            ✅ / ✅            |       ✅       |     ✅     |
| [Variants (experimental)](https://github.com/modelcontextprotocol/experimental-ext-variants/blob/cfc05d6f5eb8829f9896d44a6d47360bd15c3b5c/go/sdk/variants/server.go)                                  |            ✅ / ✅            |       -        |     ⚠️     |
| [Triggers/events (experimental)](https://github.com/modelcontextprotocol/experimental-ext-triggers-events/blob/6682596d65eec778fe0b8b1f43b4e89d2fe2c546/docs/design-sketch-proposal.md)               |            ✅ / ✅            |       ✅       |     ◯      |
| [Trust annotations (experimental)](https://github.com/modelcontextprotocol/experimental-ext-tool-annotations/blob/fecace78a9552f70ba735d750fc3c4b190e20429/specification/draft/trust-annotations.mdx) |            ✅ / -             |       -        |     ◯      |
| [Action metadata (experimental)](https://github.com/modelcontextprotocol/experimental-ext-tool-annotations/blob/fecace78a9552f70ba735d750fc3c4b190e20429/specification/draft/action-metadata.mdx)     |            ✅ / -             |       -        |     ◯      |
| [Grouping (exploratory)](https://github.com/modelcontextprotocol/experimental-ext-grouping/blob/2505387604eb144fb0d095de592dc4733e33f33b/README.md)                                                   |             ? / ?             |       ?        |     ?      |

- **Apps:** covers the MCP server connection and needs local resource support. The app-to-host bridge and UI hosting are separate.
- **Skills:** adds `skills/list`, `skills/get`, and optional `resources/directory/read`, and needs core resource handlers.
- **Tasks:** custom task requests fit. As drafted, status notifications use the core `subscriptions/listen` stream with a `taskIds` filter, and task handles are returned from core methods. Both change core contracts, so that part falls outside the [extension rules](#extension-rules). A dedicated method such as `tasks/listen` would fit. The package still supplies storage and execution.
- **Interceptors:** custom requests handle discovery and invocation; middleware applies interceptors to MCP calls. Agent lifecycle events need host hooks, and remote interceptor order is separate from local middleware order.
- **Variants:** the proxy wraps requests and results and redirects notifications. Some routing needs session access beyond payload middleware.
- **Triggers/events:** needs depend on delivery mode. Webhooks, long-lived streams, and timeout or concurrency changes may need more APIs.
- **Trust annotations:** handlers attach metadata directly; middleware is optional and no capability negotiation is required.
- **Action metadata:** adds fields to `Tool.annotations`, which falls outside the [extension rules](#extension-rules). Carrying them in `_meta` would fit.
- **Grouping:** not yet specified enough to assess.

Any interface changes to Tasks or Action metadata are for their working groups. Authorization extensions and Server Card need transport integration beyond this proposal.

## Appendix C: Example design for stacking middleware

This appendix is non-normative. It sketches one way an SDK could let several extensions stack middleware and expose [insertion points](#ordering). SDKs are free to use other designs.

Each extension contributes its middleware as one or more ordered groups. The SDK keeps the order inside a group, and applications can place middleware between groups but not inside one, so the gaps between groups act as insertion points. Most extensions need a single group. An extension that acts at two depths, such as verifying a request near the outside of the chain and redacting results close to the handler, contributes two.

```typescript
// The auth extension contributes two groups, each with a default priority.
function authExtension() {
  return new Extension("com.example/auth", {
    middleware: [
      { group: "verify", priority: 100, chain: [verifyToken] },
      { group: "redact", priority: -100, chain: [redactSecrets] },
    ],
  });
}

// Without an explicit order, this SDK sorts groups by priority.
// Here the application overrides that order.
const server = new Server({
  extensions: [authExtension(), searchExtension(), auditExtension()],
  middlewareOrder: [
    "com.example/auth#verify",
    "com.example/audit",
    "com.example/search",
    "com.example/auth#redact",
  ],
});
// Receiving chain: verify, audit, search, redact, then the handler.
```

Choices an SDK following this design would make:

- Extensions suggest a default position for each group, such as a priority or an anchor relative to another extension, and the application's order takes precedence.
- With no explicit order from the application, this example SDK sorts groups by descending priority, first outermost. Equal priorities are resolved by extension registration order, then group declaration order. Order within each group is preserved.
- Conflicting anchors are reported as a configuration error.
- Middleware can be limited to particular methods or one direction, and passes other messages through unchanged.

Named stages, as in the Go sketch below, are an equivalent design: each stage marks a boundary where applications can insert middleware.

```go
var (
	BeforeAuth = mcp.NewReceivingStage("com.example/search", "before-auth")
	AfterAuth  = mcp.NewReceivingStage("com.example/search", "after-auth")
)

func (Ext) ProvidesMiddleware() []mcp.Middleware {
	return []mcp.Middleware{BeforeAuth, authMiddleware, AfterAuth, rewriteMiddleware}
}

// Application setup.
s.AddExtension(search.New())
s.AddReceivingMiddlewareAt(searchext.AfterAuth, auditMW, redactMW)
```
