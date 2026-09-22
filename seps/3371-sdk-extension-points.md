# SEP-3371: Consistent SDK Extension Points

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-09-18
- **Author(s)**: Sambhav Kothari (@sambhav)
- **Sponsor**: Felix Weinberger (@felixweinberger)
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3371

## Abstract

This SEP requires Tier 1 Model Context Protocol (MCP) SDKs to provide public APIs for extension registration with capabilities and dependency checks, custom RPC methods, and middleware. Extension authors can use these APIs from independent packages, while applications choose which extensions to enable.

## Terminology

| Term                   | Meaning                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| SDK                    | Software development kit: a library for building MCP clients or servers.                                            |
| Protocol extension     | A specification that adds capabilities, methods, or behaviour to MCP, identified by a namespaced name.              |
| SDK extension point    | A public API that application or extension code uses to add behaviour.                                              |
| Extension registration | Enabling an extension locally with its declared capabilities and dependencies.                                      |
| Capability             | A declaration that a client or server supports a feature, together with any settings.                               |
| RPC                    | Remote procedure call: invoking a named operation on a peer.                                                        |
| Method                 | A named operation. A request expects a response; a notification does not. Custom methods are defined by extensions. |
| Handler                | The local code that processes a method.                                                                             |
| Method contract        | The allowed message types and exchanges for a method, as defined by the protocol or extension specification.        |
| Middleware             | Code that wraps a step in sending or receiving a message.                                                           |
| Payload                | Message parameters or results, including metadata in `_meta`.                                                       |
| Envelope               | The JSON-RPC fields that identify and correlate messages, such as `method`, `id`, and `jsonrpc`.                    |

## Motivation

As the number of MCP extensions grows, bundling their implementations into SDKs creates a growing maintenance and coordination burden. SDK maintainers must keep extension-specific code, dependencies, tests, and documentation up to date alongside the core protocol. Each extension has its own maintainers and priorities, so supporting more extensions means coordinating with more teams whenever either the SDK or an extension changes.

Extension owners need to manage their features, fixes, compatibility, and support commitments throughout the extension's lifecycle: experimentation, stable releases, ongoing maintenance, deprecation, and retirement. When implementations are bundled into SDKs, that work depends on each SDK's review capacity and release schedule. An extension's priorities and timelines may differ from those of the SDKs that support it.

Keeping bundled code optional does not remove this coordination. Forks allow separate releases but require ongoing rebasing. Extensions built on separate SDK forks cannot be composed as independent packages on a single SDK. Applications must instead merge their changes into a shared fork and maintain that integration as each extension evolves. Public extension points let those packages compose without transferring SDK integration work to applications.

[SEP-2133](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/2133-extensions.md) provides a process for developing protocol extensions, but leaves SDK integration open. Some SDKs already support independent extension packages; the available APIs and their guarantees vary, as the [SDK comparison](#appendix-a-prior-art-and-sdk-support) shows.

This SEP gives SDK maintainers a common set of public extension points to maintain, while extension owners maintain and release their own packages. Applications can combine those packages on one SDK and update them independently within their declared compatibility requirements. This separation applies throughout the lifecycle of both official and third-party extensions, allowing the ecosystem to grow without making SDK maintainers responsible for every extension.

## Specification

Tier 1 SDKs **MUST** meet the requirements below through documented public APIs. Other SDKs **SHOULD** meet them. These keywords follow [BCP 14](https://www.rfc-editor.org/info/bcp14).

The requirements apply to clients and servers in the directions permitted by the applicable protocol version, transport, and extension specification. External packages must be able to use the public APIs without an SDK fork or an SDK-owned allowlist.

This SEP specifies the behaviour SDKs must support. SDK maintainers choose APIs that make extensions easy to enable and compose in their language. Existing APIs, builder options, functions, interfaces, or wrappers may satisfy the requirements; a new extension class or plugin framework is not required.

The protocol and extension specifications continue to define message formats, capability negotiation, and method contracts. Transport mechanisms and package loading are outside this proposal's scope.

**Illustrative examples:** All examples use concise TypeScript for readability. Names, types, and signatures are illustrative, not APIs required by this SEP or claims about an existing SDK. Each language should use its own idiomatic APIs; conformance depends on the supported behaviour.

The examples follow a catalog-search extension, with each showing one part of the integration. Configuration happens before startup, and `session` represents a connected peer. Imports, supporting types, schemas, and handler definitions are omitted.

### 1. Registration, capabilities, and dependencies

Applications enable extensions by identifier, with declarations of the capabilities they provide and the local dependencies they require.

SDKs must let applications compose multiple independently packaged extensions on the same client or server. A package must be able to encapsulate installation of its capabilities, custom RPC handlers, and middleware appropriate to that instance. Applications enable the package through the SDK's idiomatic configuration mechanism and configure its options and composition. The extension points below are building blocks for package authors; applications do not need to register each contribution separately.

```typescript
// Defined by the search package.
function searchExtension() {
  return new Extension("com.example/search", {
    capabilities: { selectionNotifications: true },
    requires: { resources: {} },
    setup: registerSearchMethods,
    middleware: [searchMiddleware],
  });
}

// Application setup.
const server = new Server({
  extensions: [searchExtension(), auditExtension()],
});
server.addResource("catalog", { handler: readCatalog });
await server.start(); // Validate dependencies after configuration is complete.
```

Adding `searchExtension()` installs its declared capabilities and middleware and invokes its method-registration callback. Adding the catalog resource enables resource support before startup checks the extension's dependency. The following sections show the package's RPC setup and middleware.

#### Registering extensions

Applications and extension configuration code must be able to inspect the registered identifiers before startup.

Registration must:

- Reject duplicate extension identifiers.
- Leave no usable partial configuration after failure.

An SDK may satisfy the failure requirement by rejecting the entire configuration. Inspection can use a read-only configuration view.

SDKs may limit registration to startup; runtime installation and removal are optional.

#### Capabilities

SDKs must let extension packages declare support and settings as part of registration. Registration and capability declarations use the same extension identifier. SDKs must preserve settings and unrelated entries, and reject conflicting local settings for the same identifier.

Declarations use the existing `ClientCapabilities.extensions` and `ServerCapabilities.extensions` maps defined by SEP-2133. Each entry is keyed by a namespaced identifier such as `com.example/search`; third parties use a reversed domain they control, and `io.modelcontextprotocol` is reserved for official extensions. An empty settings object declares support; a missing entry does not. Local dependency declarations and payload metadata do not advertise peer support.

Extension code must be able to read the peer capability information available for an operation through the SDK's existing discovery, initialization, or request-context APIs, as appropriate for the protocol version. For example, in the 2026-07-28 protocol, clients can obtain server capabilities through [discovery](https://modelcontextprotocol.io/specification/2026-07-28/server/discover), while servers read client capabilities from the [current request](https://modelcontextprotocol.io/specification/2026-07-28/basic#statelessness). The protocol and extension specifications determine how that information is used.

#### Checking local dependencies

An extension can require local capabilities or other registered extensions. For example, another extension could depend on search as well as core capabilities:

```typescript
const requires = {
  resources: {},
  tools: { listChanged: true },
  extensions: { "com.example/search": {} },
};
```

This local declaration requires resource support, tool-list change support, and the local search extension. An empty object requires presence; a required boolean must be true. SDKs may represent the same requirements with native types or configuration APIs. The declaration adds no wire fields.

Before processing messages, the SDK must:

1. Collect the completed application and extension configuration.
2. Derive its capabilities, including those enabled by application registrations.
3. Check every extension's dependencies, including those of its dependencies.

Validation happens at build or startup, so dependencies may be registered after the extensions that need them. Duplicate extension identifiers can be rejected immediately.

Missing extensions and missing, disabled, unknown, or inapplicable capabilities must fail validation. The error must name the extension and unmet requirement.

These checks do not install packages or enable capabilities. Applications and extension packages manage package version compatibility.

### 2. Custom RPC methods

SDKs must provide public APIs to register handlers for custom requests and notifications, and to call or send those methods. Extension packages use these APIs during setup, supplying parameter and result types, with schemas or codecs where needed. Method bindings are supplied by the package's setup code, separately from its capability declaration.

SDKs must document whether handlers receive parameters, a request object, or a separate context. The parameter schemas below describe `Request.params`; envelope and context access follow the SDK's API.

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

// Peer usage, where permitted by the protocol and transport.
const result = await session.call(
  "com.example/search",
  { query: "invoices" },
  { resultSchema: SearchResultSchema },
);
await session.notify("com.example/search-selected", { query: "invoices" });
```

Handler registration must reject duplicate method names, including conflicts between requests and notifications, claims on core protocol methods, and replacement of existing handlers by applications or extensions. These conflicts can be rejected immediately. Failure must leave no usable partial configuration; if the configuration remains usable, existing handlers must remain unchanged.

Custom messages must use the SDK's normal dispatch, request correlation, error handling, applicable cancellation, and middleware.

### 3. Middleware

Applications and extensions can add middleware to the same chains, covering core and custom requests, responses, and notifications when sending and receiving, including messages delivered over streams. Installing middleware alone does not register a method or advertise a capability.

SDK request, response, and notification objects may carry context in addition to the protocol payload, such as authentication information, cancellation, peer capabilities, or information about the associated operation. Middleware must be able to access the applicable context already exposed by the SDK through its public APIs. SDKs may attach it to these objects or expose it separately. This local context is not automatically serialized into the message.

The following example wraps a handler that produces complete MCP messages. The loop waits for each message and yields it as it becomes available, whether there is a single response or a stream. Serialization and transport framing remain with the SDK.

```typescript
function searchMiddleware(next: Handler): Handler {
  return async function* (request) {
    // Inspect or modify the request; stop here if needed.
    for await (const message of next(request)) {
      // Inspect or modify each response or notification.
      yield message;
    }
    // Run after normal completion.
  };
}
```

The SDK runs the chain and closes any active iterators when processing completes, fails, is cancelled, or stops early. Middleware can skip `next` and produce an outcome allowed by the method's contract. Error handling and cleanup use the language's usual mechanisms, omitted from the example for clarity.

#### Messages

Middleware may modify or replace a payload, or return early, within the method's existing contract, including supported intermediate results and follow-up exchanges. It cannot change the method's identity or allowed types. The SDK owns the envelope and request correlation.

Metadata in `_meta`, including on nested objects, is part of the payload. Public APIs must allow entries to be added, updated, and removed without changing generated core types, while preserving the protocol's rules for reserved fields. Typed APIs and serialization must preserve valid unknown metadata unless application or extension code changes it. Changes must be visible to downstream middleware and the message's recipient; extension payload metadata is not automatically copied into results.

#### Notifications and streaming

For a notification, delegating to `next` forwards it for sending or processing. In the iterator example, the SDK must consume the iterator even when it yields no messages, so the handler runs. Completion is local: it does not produce a protocol response. Middleware can inspect or modify the notification, or skip `next` to suppress it where the protocol permits. Suppressing one notification does not by itself terminate the surrounding operation or stream.

Middleware must also cover individual protocol messages as they are produced or consumed on a stream. Wrapping only the final result of a request is insufficient when notifications or other supported messages arrive before it. SDKs may use their sending and receiving message chains, stream wrappers, callbacks, or equivalent public APIs.

The example uses an iterator throughout for a consistent handler shape. SDKs may instead return a response object containing a stream, or let middleware wrap a writer or callback that receives each message. When `next` returns before a stream is consumed, per-message logic and end-of-stream cleanup belong in that stream's wrapper or equivalent callbacks.

Writer and iterator wrappers must preserve incremental delivery, message order, flow control, cancellation, errors, and cleanup through the SDK's normal lifecycle. Middleware must not require buffering the complete stream. Early termination follows the method and transport's existing rules.

These requirements cover protocol messages, not transport frames, byte chunks, or new streaming result types.

#### Composition

Applications must be able to compose middleware from multiple extensions and application code in an explicit order. Applications and extension configuration code must be able to inspect it before processing messages. Applications must be able to place middleware from their own code or another extension between contributions from one extension, without installing a contribution twice. Dependencies do not determine order, and sending and receiving chains may have separate orders.

An ordered configuration list or equivalent view is sufficient for inspection; middleware identifiers and a runtime registry are not required.

For `A(B(handler))`, the request passes through A, then B, then the handler. Results and errors return through B, then A. If B returns early, A receives its outcome and the handler is skipped.

SDKs must document:

- How registration determines order, including repeated registrations and extension contributions.
- Where middleware runs relative to parsing, validation, dispatch, and serialization.

Changes to SDK-provided request-local state must not leak into independent calls: for example, changing one call's metadata must not change another call's metadata through a shared object. Applications and extensions are responsible for shared state they introduce.

### Packaging and publishing

SDKs SHOULD provide a minimal example showing how to package an extension, declare SDK compatibility, and enable it in an application.

For extensions maintained within the MCP organisation, SDK maintainers SHOULD document the expected package namespaces and naming conventions across release stages, including experimental, beta, and stable releases. They SHOULD coordinate with the Infrastructure Working Group to establish how extension maintainers obtain the access needed to publish those packages. Extension maintainers remain responsible for their packages and releases.

Third-party extensions choose their own package names, registries, and publishing processes. The SDK's public extension points must support them without requiring organisation-managed namespaces or publishing access.

## Rationale

### Why these extension points

Working group discussions identified a common set of integration needs covering most of the extensions under consideration. This proposal groups them into three extension points. The [extension requirements](#appendix-b-extension-requirements) map those designs to the proposed APIs and identify the remaining gaps.

- **Registration, capabilities, and dependencies** let applications enable packages, declare their support, and check local requirements. Peer capabilities remain governed by the protocol's discovery and negotiation rules.
- **Custom RPC methods** let extensions add operations while reusing the SDK's dispatch and message handling.
- **Middleware** lets extensions compose changes around existing operations while preserving their method contracts.

Together, these APIs give SDK maintainers a small set of reusable integration points to maintain as new extensions appear. Extension authors should first compose these APIs, keeping extension-specific behaviour in their own packages.

### Scope and exceptions

An extension that cannot be implemented through these APIs needs to work with SDK maintainers to identify the missing support and agree on an approach. Additional SDK integration may be justified, but should address a concrete requirement that composition cannot meet.

Work intended for the core protocol may also require changes to core schemas, capability definitions, and SDK types. Those changes belong in the core protocol process and may warrant direct SDK implementation. This proposal does not require core protocol development to fit within extension APIs.

### API design choices

The SDK patterns in [Appendix A](#appendix-a-prior-art-and-sdk-support) show that the same behaviours can be implemented using different APIs.

- **Common behaviour, language-specific APIs.** A shared plugin interface would constrain SDK design without improving interoperability between peers.
- **Middleware rather than handler replacement.** Replacing handlers makes method ownership depend on registration order. Wrapping a stable handler lets applications combine behaviour explicitly.
- **Validation after configuration.** A capability may be enabled later by the application. Checking the completed configuration avoids that ordering constraint. Dependencies determine which components must be present; middleware order determines how they process messages.

## Backward Compatibility

This SEP adds no wire fields or methods. Some SDKs will need API changes, such as rejecting handler replacement; their maintainers determine the migration approach.

Individual extensions remain optional. The core protocol behaviour of applications that enable neither extensions nor middleware remains unchanged.

The extension points become a Tier 1 requirement. Rollout is agreed separately through SDK governance, with the SDK guidance and [tiering documentation](https://modelcontextprotocol.io/community/sdk-tiers) updated accordingly.

## Reference Implementation and Verification

A complete reference implementation is still needed. The APIs in [Appendix A](#appendix-a-prior-art-and-sdk-support) implement parts of this proposal. The inline examples are pseudocode.

### Shared conformance suite

The MCP conformance suite must include a shared set of scenarios for this SEP. Fixtures use each SDK's idiomatic public APIs; the suite checks the required outcomes rather than the example API shapes. Each SDK provides client and server fixtures that install at least two test extensions and standalone application middleware. One extension contributes multiple middleware functions so the suite can verify composition with application code. The suite supplies a reproducibly generated method name and nonce to ensure that custom dispatch is exercised.

The shared scenarios must verify:

- Custom requests and notifications, including typed payloads, request correlation, unknown-method errors, and notification delivery without a response.
- Capability declarations and settings, including preservation of unrelated entries.
- Middleware mutation, explicit ordering, early returns, error propagation, metadata preservation, and isolation between concurrent calls.
- Streaming message delivery before the stream completes, including middleware applied to notifications, with cancellation and cleanup preserved.
- Baseline behaviour: unenabled extensions contribute no methods or advertisements, standalone middleware needs no extension registration, and core behaviour remains intact without either.

Run scenarios in every direction permitted by the selected protocol version and on the transports required for the SDK's tier. Fixtures must make the observations needed to check these outcomes available to the suite.

### SDK-local checks and results

Each SDK must also use its native test framework to verify requirements that wire-level tests cannot establish: registration conflicts and failure handling, dependency checks after configuration, capability-setting conflicts, inspection of registrations and middleware order, access to SDK-provided request and response context, and preservation through typed APIs and codecs.

An SDK claiming conformance must pass all applicable shared scenarios and SDK-local checks. Report the SDK version, protocol version, transports, and results, with reasons for any scenarios marked inapplicable. Fixture review must confirm that the implementation uses public APIs. The SDK and Conformance working groups maintain the shared scenarios; rollout remains separate as described above.

These checks establish conformance of the SDK extension points. Individual extensions still need tests for their own behaviour.

## Security Implications

Extensions and middleware run as trusted application code with access to protocol data. Applications should enable only code they trust; registration checks and explicit ordering do not sandbox it.

SDKs must retain protocol validation and authorization checks. Middleware does not replace transport authentication. Extensions should avoid placing credentials in `_meta`.

## Appendix A: Prior art and SDK support

Existing SDKs provide different parts of this proposal. Python has extension registration and server middleware; Go has [separate sending and receiving chains](https://github.com/modelcontextprotocol/go-sdk/blob/3b917b466cc540079b82bcd0fecdc46a2ba13644/mcp/server.go) composed as nested handlers. The table and source notes below show the wider picture.

The same composition pattern appears in [Django](https://docs.djangoproject.com/en/5.2/topics/http/middleware/#middleware-order-and-layering), [Koa](https://koajs.com/#cascading), [ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/middleware/?view=aspnetcore-10.0), and [Tower](https://docs.rs/tower/0.5.3/tower/struct.ServiceBuilder.html#order). This SEP applies that pattern to MCP messages.

Earlier [extension integration discussions](https://github.com/modelcontextprotocol/go-sdk/issues/954#issuecomment-4792634369) describe the maintenance and release costs of bundling experimental implementations, and the difficulty of combining independently maintained forks.

This assessment uses the revisions linked below, reviewed on 2026-09-18. Tier labels follow the [official SDK listing](https://modelcontextprotocol.io/docs/2026-07-28/sdk) used at that time.

**Legend:** ✅ a public API exists for the stated scope; ❌ a confirmed gap; ? not verified. Lower-level public APIs and wrappers count. These ratings describe available APIs, not conformance with this SEP.

The paired entries under Registration and capabilities report extension-ID registration / extension capability-map support, respectively. Middleware must operate on MCP messages, rather than only HTTP requests.

| SDK / tier (source note) | Registration and capabilities | Custom RPC methods |     Middleware      |
| ------------------------ | :---------------------------: | :----------------: | :-----------------: |
| TypeScript — Tier 1 (1)  |            ? / ✅             |         ✅         |          ?          |
| Python — Tier 1 (2)      |            ✅ / ✅            |         ✅         |      ✅ server      |
| C# — Tier 1 (3)          |            ? / ✅             |         ✅         |      ✅ server      |
| Go — Tier 1 (4)          |            ? / ✅             |    ✅ requests¹    |         ✅          |
| Rust — Tier 1 (5)        |            ? / ✅             |         ✅         |     ✅ wrappers     |
| Java — Tier 2 (6)        |            ? / ❌             |   ✅ session API   | ✅ handler wrappers |
| Ruby — Tier 2 (7)        |            ? / ✅             |    ✅ requests¹    |          ?          |
| PHP — Tier 3 (8)         |            ✅ / ✅            |         ✅         |          ?          |
| Kotlin — Tier 3 (9)      |            ? / ✅             |         ✅         |          ?          |
| Swift — Tier 3 (10)      |            ? / ❌             |         ✅         |          ?          |

¹ Custom requests are supported. Complete custom-notification registration and dispatch remain unverified.

### Source notes

- **TypeScript (1):** [Custom-method registration](https://github.com/modelcontextprotocol/typescript-sdk/blob/60321700871029401a2e3bed8fdf4f02c9ec3331/docs/advanced/custom-methods.md) replaces existing handlers. [Client middleware](https://github.com/modelcontextprotocol/typescript-sdk/blob/60321700871029401a2e3bed8fdf4f02c9ec3331/docs/clients/middleware.md) wraps HTTP `fetch`; general MCP message middleware was not established.
- **Python (2):** [Extension registration](https://github.com/modelcontextprotocol/python-sdk/blob/6affe5c0d3588fd1705713b3703dc68015cfe3eb/docs/advanced/extensions.md) checks custom request conflicts, but core notification conflicts only trigger warnings. [Middleware](https://github.com/modelcontextprotocol/python-sdk/blob/6affe5c0d3588fd1705713b3703dc68015cfe3eb/docs/advanced/middleware.md) is provisional and server-side; client coverage and mixed extension ordering remain unverified.
- **C# (3):** [Request registration](https://github.com/modelcontextprotocol/csharp-sdk/blob/324ccd83c357acf611e1cf3a6935a945ee600442/src/ModelContextProtocol.Core/Server/McpServerOptions.cs) is experimental and allows overriding built-ins. [Filters](https://github.com/modelcontextprotocol/csharp-sdk/blob/324ccd83c357acf611e1cf3a6935a945ee600442/docs/concepts/filters.md) cover notifications and early returns; client hooks and inspection of the final order remain unverified.
- **Go (4):** [Custom-method registration](https://github.com/modelcontextprotocol/go-sdk/blob/3b917b466cc540079b82bcd0fecdc46a2ba13644/mcp/server.go) rejects core names but replaces duplicate custom handlers. [Middleware](https://github.com/modelcontextprotocol/go-sdk/blob/3b917b466cc540079b82bcd0fecdc46a2ba13644/mcp/client.go) documents nested sending/receiving chains; combined-order inspection, custom notifications, and reverse-call coverage remain unverified.
- **Rust (5):** [Dispatch](https://github.com/modelcontextprotocol/rust-sdk/blob/fd7811fdaa9fefa1c8034534b4d7a31c97204f89/crates/rmcp/src/handler/server.rs) has no extension registry. [Service wrappers](https://github.com/modelcontextprotocol/rust-sdk/blob/fd7811fdaa9fefa1c8034534b4d7a31c97204f89/crates/rmcp/src/service.rs) wrap received calls; full directional coverage needs adapters, and complete notification filtering remains unverified.
- **Java (6):** [Session constructors](https://github.com/modelcontextprotocol/java-sdk/blob/183935bf80dcb5c70bc13cd7b1eef99ce7053ec3/mcp-core/src/main/java/io/modelcontextprotocol/spec/McpServerSession.java) permit wrapped handlers through public handler maps; higher-level setup is private. [Capability records](https://github.com/modelcontextprotocol/java-sdk/blob/183935bf80dcb5c70bc13cd7b1eef99ce7053ec3/mcp-core/src/main/java/io/modelcontextprotocol/spec/McpSchema.java) lack `extensions`. Extension registration and higher-level middleware remain unverified.
- **Ruby (7):** [Method registration](https://github.com/modelcontextprotocol/ruby-sdk/blob/f22ce86e976be6c71b15c386d5b42c12e5f32ee0/lib/mcp/server.rb) rejects existing names. [Extension capabilities](https://github.com/modelcontextprotocol/ruby-sdk/blob/f22ce86e976be6c71b15c386d5b42c12e5f32ee0/docs/_extensions/capability-extensions.md) exist; message mutation and complete notification coverage remain unverified.
- **PHP (8):** [Extension registration](https://github.com/modelcontextprotocol/php-sdk/blob/16836d4e9a0f96831789ac6e64d5ec5238d2c833/src/Server/Builder.php) permits some built-in overrides. [Custom handlers](https://github.com/modelcontextprotocol/php-sdk/blob/16836d4e9a0f96831789ac6e64d5ec5238d2c833/docs/advanced/custom-handlers.md) replace rather than wrap handlers. General middleware, rollback, full conflict checks, and conflicting settings remain unverified.
- **Kotlin (9):** [Handlers](https://github.com/modelcontextprotocol/kotlin-sdk/blob/1d04427cff47b31932409b90959869aa2934d680/kotlin-sdk-core/src/commonMain/kotlin/io/modelcontextprotocol/kotlin/sdk/shared/Protocol.kt) replace existing handlers; guarded registration and message mutation remain unverified. [Capability models](https://github.com/modelcontextprotocol/kotlin-sdk/blob/1d04427cff47b31932409b90959869aa2934d680/kotlin-sdk-core/src/commonMain/kotlin/io/modelcontextprotocol/kotlin/sdk/types/capabilities.kt) include extension maps and use `JsonObject` for metadata.
- **Swift (10):** [Handlers](https://github.com/modelcontextprotocol/swift-sdk/blob/a0ae212ebf6eab5f754c3129608bc5557637e605/Sources/MCP/Server/Server.swift) replace method handlers and append notification handlers, with client equivalents. [Client APIs](https://github.com/modelcontextprotocol/swift-sdk/blob/a0ae212ebf6eab5f754c3129608bc5557637e605/Sources/MCP/Client/Client.swift) do not establish general middleware; capability models lack `extensions`.

All ten SDKs expose `_meta`. Full metadata preservation and the other guarantees in [Reference Implementation and Verification](#reference-implementation-and-verification) still need testing against released versions.

## Appendix B: Extension requirements

This table shows which SDK APIs each extension uses. The links point to the revisions assessed on 2026-09-18.

**Legend:** ✅ used by the integration; ◯ optional; — not needed; ⚠️ useful but insufficient for the full behaviour; ? insufficient detail to assess. These describe API needs, not completed implementations.

The paired entries under Registration and capabilities report registration / capability declarations, respectively. Registration assumes installation through the proposed API. None of these designs requires another named local extension. Some experimental capability declarations would need to use the `extensions` map.

| Extension                                                                                                                                                                                             | Registration and capabilities | Custom RPC methods | Middleware |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------: | :----------------: | :--------: |
| [Apps](https://github.com/modelcontextprotocol/ext-apps/blob/6d9bdc7babf275b759225aa722cbf5510c4c6021/specification/draft/apps.mdx)                                                                   |            ✅ / ✅            |         —          |     ◯      |
| [Skills](https://github.com/modelcontextprotocol/ext-skills/blob/41e7c66db2510a3e98d9614eb1998f6b970006d7/specification/stable/skills.mdx)                                                            |            ✅ / ✅            |         ✅         |     —      |
| [Tasks](https://github.com/modelcontextprotocol/ext-tasks/blob/9263312d11a682ac83f83fe84794d4627efd22f5/specification/draft/tasks.md)                                                                 |            ✅ / ✅            |         ✅         |     ⚠️     |
| [Interceptors (experimental)](https://github.com/modelcontextprotocol/experimental-ext-interceptors/blob/b60459844cc95f2170297ebe1c84b7de8b752953/docs/sep.md)                                        |            ✅ / ✅            |         ✅         |     ✅     |
| [Variants (experimental)](https://github.com/modelcontextprotocol/experimental-ext-variants/blob/cfc05d6f5eb8829f9896d44a6d47360bd15c3b5c/go/sdk/variants/server.go)                                  |            ✅ / ✅            |         —          |     ⚠️     |
| [Triggers/events (experimental)](https://github.com/modelcontextprotocol/experimental-ext-triggers-events/blob/6682596d65eec778fe0b8b1f43b4e89d2fe2c546/docs/design-sketch-proposal.md)               |            ✅ / ✅            |         ✅         |     ◯      |
| [Trust annotations (experimental)](https://github.com/modelcontextprotocol/experimental-ext-tool-annotations/blob/fecace78a9552f70ba735d750fc3c4b190e20429/specification/draft/trust-annotations.mdx) |            ✅ / —             |         —          |     ◯      |
| [Action metadata (experimental)](https://github.com/modelcontextprotocol/experimental-ext-tool-annotations/blob/fecace78a9552f70ba735d750fc3c4b190e20429/specification/draft/action-metadata.mdx)     |            ✅ / —             |         —          |     ◯      |
| [Grouping (exploratory)](https://github.com/modelcontextprotocol/experimental-ext-grouping/blob/2505387604eb144fb0d095de592dc4733e33f33b/README.md)                                                   |             ? / ?             |         ?          |     ?      |

Apps, Skills, Tasks, and trust annotations use `_meta`; it is optional for Interceptors, Variants, and Triggers/events. Action metadata uses `Tool.annotations` instead. These payload needs are covered in the integration notes below.

### Integration notes

- **Apps:** Covers the MCP server connection and requires local resource support. The app–host bridge and UI hosting remain separate.
- **Skills:** Adds `skills/list`, `skills/get`, and optional `resources/directory/read`. It needs core resource handlers but no custom notifications.
- **Tasks:** Custom task requests and status notifications fit these APIs. Returning a task handle from a core method also needs support in that method's contract and SDK result types. The package still supplies storage and execution.
- **Interceptors:** Custom requests support discovery and invocation; middleware applies interceptors to MCP calls. Agent lifecycle events still need host hooks. Remote interceptor order is separate from local middleware order.
- **Variants:** The linked proxy wraps requests and results and redirects notifications. Some routing also needs session access, so payload middleware alone cannot support every proxy arrangement.
- **Triggers/events:** Message types depend on the delivery mode. Webhooks, long-lived streams, and changes to timeout or concurrency handling may need additional APIs.
- **Trust annotations:** Handlers can attach metadata to results or content blocks directly. Middleware is optional, and the draft requires no capability negotiation.
- **Action metadata:** Adds fields to `Tool.annotations`. SDK types must preserve those fields; the `_meta` guarantee in this SEP does not cover them. Changes use the core list-change behaviour.
- **Grouping:** The design does not yet specify enough of the message exchange to assess.

Authorization extensions and Server Card need transport integration beyond this proposal.
