# SEP-0000: Pluggable Transports

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-04-17
- **Author(s)**: Kurtis Van Gent (@kurtisvg)
- **Sponsor**: @kurtisvg
- **PR**: https://github.com/modelcontextprotocol/specification/pull/0000

## Abstract

MCP defines two Standard transports — stdio and Streamable HTTP — which
compliant clients and servers support. A steady stream of proposals (gRPC,
WebSockets, SSH, QUIC, message queues) seeks to elevate additional transports
into the core specification. Every such addition has two compounding costs:
it grows the surface the specification must own and keep internally
consistent, and it adds a mandatory implementation, test, and maintenance
obligation to every official SDK. One proposal adopted into core becomes N
parallel SDK implementations and an ongoing carrying cost for the maintainer
team.

This SEP formalizes a third path: **pluggable transports at the SDK layer**,
split cleanly into two layers:

- The **Transport interface** — a public, stable extension point plus a
  conformance test harness — lives in SDK **core**. Every Tier 1 MCP SDK
  MUST expose it ([SEP-1730](./1730-sdks-tiering-system.md)).
- Concrete **transport implementations** (WebSocket, gRPC, SSH, …) live
  outside SDK core as separate packages. Most ship simply as third-party
  packages that consume the §4 interface; only the most widely-adopted
  are expected to be formalized as official SDK Extensions under
  [SEP-2133](./2133-extensions.md). Neither tier factors into SDK
  conformance tiering.

The existing requirement that custom transports preserve the JSON-RPC wire
format is relaxed: custom transports MUST preserve MCP semantics but MAY
use any on-the-wire encoding, enabling real-world transports such as
gRPC/Protobuf. In exchange, each custom transport MUST publish a
bidirectional mapping to JSON-RPC so that proxies can bridge across
transports. The outcome is SDK flexibility without specification
complexity.

## Motivation

### Pressure to expand the Standard transport set

Since the introduction of MCP, several draft proposals — tracked as
issues or draft SEP pull requests rather than accepted SEPs — have sought
to expand transport support. Two push explicitly for core-spec inclusion;
one deliberately stops short:

- **Draft SEP-1288** (WebSocket transport,
  [issue #1288](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1288))
  — in-review, sponsored — proposes WebSocket as a core transport for
  stateful, bidirectional connections in serverless environments.
- **Draft SEP-1352** (gRPC transport,
  [issue #1352](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1352))
  and the earlier [issue #966](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/966)
  — draft, unsponsored — propose gRPC as a core transport for
  high-throughput enterprise deployments with binary framing and native
  streaming.
- **Draft SEP-2325** (SSH custom transport,
  [PR #2325](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2325))
  — Informational, not Standards Track — is explicitly framed as a
  community example of using the existing Custom Transports clause, not
  as a request for core-spec inclusion. It is included here as evidence
  that custom-transport distribution is already happening ad hoc, not as
  a core-spec proposal this SEP needs to displace.

The first two, if adopted into core, would compound two costs the protocol
cannot absorb:

- **Specification complexity.** Every transport admitted into the core adds
  another chapter of normative text — framing rules, security
  considerations, lifecycle edge cases, authorization interaction,
  backwards-compatibility guidance — that the specification must own and
  keep consistent with every other transport and every future protocol
  change. The cost is not one-time; it is paid again each time the spec
  evolves.
- **SDK maintainer burden.** Each new core transport is a mandatory
  implementation task for every official SDK (Python, TypeScript, Go,
  Java, …). A single core addition becomes N parallel implementations, N
  sets of tests, and N ongoing maintenance streams. Because the cost lands
  on SDK maintainers rather than on the proposal author, there is a
  structural bias toward growth that only a firm default of "no" can
  counter.

### The current escape hatch is insufficient

The current spec acknowledges custom transports in two short paragraphs:

> Clients and servers **MAY** implement additional custom transport
> mechanisms to suit their specific needs. The protocol is transport-agnostic
> and can be implemented over any communication channel that supports
> bidirectional message exchange.
>
> Implementers who choose to support custom transports **MUST** ensure they
> preserve the JSON-RPC message format and lifecycle requirements defined by
> MCP. Custom transports **SHOULD** document their specific connection
> establishment and message exchange patterns to aid interoperability.

In practice this produces three failure modes:

1. **No SDK contract.** SDKs today implement stdio and Streamable HTTP
   internally with no standardized extension point. A developer who needs
   gRPC must fork the SDK or wrap it from the outside, duplicating
   session, lifecycle, and authorization logic — and falling behind on
   upgrades.
2. **No cross-SDK parity.** Even where individual SDKs expose an
   abstraction, the shape varies across Python, TypeScript, Go, and Java.
   A third-party transport cannot be meaningfully packaged for the
   ecosystem.
3. **JSON-RPC lock-in rules out binary-encoded custom transports.** The
   `MUST ... preserve the JSON-RPC message format` clause blocks custom
   transports whose wire format is not JSON-RPC — most prominently gRPC,
   which serializes Protobuf. (Byte-tunnel transports like SSH that wrap
   an existing JSON-RPC stream are unaffected by this clause; the issue
   is specifically with transports that want a different on-the-wire
   encoding.) The current language effectively forbids the encoding-level
   flexibility that motivates these proposals.

### What formalization unlocks

- Spec scope stays bounded; ecosystem interoperability is preserved.
- Advanced integrators get a supported, stable extension point.
- Popular custom transports (WebSocket, gRPC, SSH) have a well-defined
  distribution path via SDK Extensions rather than lobbying for core
  inclusion.
- SDK tiering gains a concrete, testable conformance criterion.
- **Transport-to-transport bridging via generic proxies becomes
  tractable.** Because every custom transport publishes a bidirectional
  JSON-RPC mapping (§3.1), a single proxy pattern — JSON-RPC in the
  middle, custom encoding on each side — can bridge any two transports.
  A gRPC-only client can reach an SSH-tunneled server, a Standard-only
  client can reach a WebSocket server, and so on, without per-pair proxy
  code.

## Specification

### 1. Standard transports (unchanged)

stdio and Streamable HTTP remain the only **Standard** transports. Existing
normative requirements in the transports chapter (including
`Clients SHOULD support stdio whenever possible`) are unchanged.

### 2. No additional transports in core

The core MCP specification does not add new transport mechanisms.
Proposals for gRPC, REST-style polling, WebSockets, QUIC, message queues,
SSH, and similar transports are out of scope for the core specification
and **SHOULD** instead be pursued as SDK Extensions (see §5).

### 3. Custom transports are not required to carry JSON-RPC

Two places in the transports chapter currently bind the entire protocol
to JSON-RPC at the wire level and **MUST** both be updated:

1. The chapter's opening sentence —
   `MCP uses JSON-RPC to encode messages. JSON-RPC messages MUST be
UTF-8 encoded.` — is scoped to Standard transports. Updated text, in
   effect:

   > Standard MCP transports (stdio and Streamable HTTP) use JSON-RPC to
   > encode messages, and JSON-RPC messages **MUST** be UTF-8 encoded on
   > those transports. Custom transports (see below) **MAY** use a
   > different on-the-wire encoding subject to the requirements in
   > §Custom Transports.

2. The Custom Transports section's requirement that implementers
   `MUST ... preserve the JSON-RPC message format` is **removed** and
   replaced with semantics-only preservation. Updated text, in effect:

   > Custom transports **MUST** preserve the MCP lifecycle and
   > request/response semantics defined by this specification, but
   > **MAY** use any on-the-wire encoding. A custom transport **MAY**
   > transcode JSON-RPC messages into a different serialization (e.g.,
   > Protobuf, CBOR, a custom binary framing) provided every MCP method,
   > parameter, result, notification, and error is faithfully
   > round-tripped and no MCP semantics are lost or added.

Standard transports (stdio, Streamable HTTP) continue to carry JSON-RPC
unchanged. Both relaxations apply only to custom transports reached via
the SDK Transport interface defined in §4.

#### 3.1 Documented JSON-RPC mapping (proxyability requirement)

In exchange for wire-format flexibility, every custom transport **MUST**
publish a **bidirectional mapping** between its wire encoding and the
equivalent JSON-RPC representation of every MCP message it carries. The
mapping **MUST**:

1. Cover every MCP method, notification, result, and error the transport
   supports, including `initialize` and shutdown.
2. Specify translation for fields whose shape changes across encodings
   (e.g., `id` when JSON-RPC allows string/number/null but the custom
   encoding uses a fixed type; binary payloads in fields typed as
   strings; error codes and error data).
3. Define behavior for MCP messages the custom encoding cannot represent
   natively — either by extending the encoding, by falling back to an
   embedded JSON-RPC envelope, or by explicitly documenting the method
   as unsupported by this transport.
4. Be precise enough that an independent implementer could build a proxy
   translating between the custom transport and a Standard JSON-RPC
   transport without reference to the custom transport's source code.

This requirement is what keeps the ecosystem reachable across transports.
A client that speaks only Standard transports **SHOULD** be able to reach a
server behind a custom transport via a generic translating proxy, and vice
versa. The mapping is the specification of that proxy.

The round-trip verification of this mapping is part of the SDK conformance
harness defined in §4.2.

### 4. SDK core: the Transport interface and conformance harness

The `Transport` interface is **part of SDK core**, not an Extension. It is
the extension point that makes custom transports possible; it is not itself
a custom transport. Every **Tier 1** MCP SDK **MUST** ship:

#### 4.1 The `Transport` interface

A public, stable `Transport` interface that:

1. Allows callers to supply a custom transport implementation at client and
   server construction time, without forking or patching the SDK.
2. Preserves all MCP lifecycle semantics (`initialize`, shutdown,
   notifications, request/response correlation). It **MUST NOT** require
   the transport to emit or accept JSON-RPC-encoded bytes; wire encoding
   is the transport's choice (§3). SDKs **SHOULD** present messages to the
   transport at a level of abstraction that admits non-JSON encodings
   (e.g., typed message objects rather than pre-serialized JSON strings).
3. Surfaces transport-level errors (connection loss, framing errors,
   authentication failures) through a consistent error type that callers
   can distinguish from protocol-level errors.
4. Is transport-agnostic in shape: the interface **MUST NOT** leak
   stdio-specific or Streamable-HTTP-specific concepts (e.g., `stderr`,
   HTTP status codes) into its public surface.

SDKs **MAY** expose language-idiomatic variations (e.g., async iterators in
TypeScript, channels in Go, context managers in Python) provided the
semantics above are preserved.

#### 4.2 The conformance test harness

A reusable test harness that any `Transport` implementation can be run
against. The harness **MUST**:

1. Exercise every MCP method, notification, result, and error defined by
   the protocol version the SDK targets, plus the full `initialize` and
   shutdown lifecycle.
2. Include the round-trip test required by §3.1 (encode a corpus of
   JSON-RPC messages into the transport's wire encoding and decode them
   back, asserting semantic equality against the published mapping).
3. Cover framing edge cases (partial writes, oversized messages,
   interleaved notifications) regardless of wire encoding.
4. Be invocable by downstream transport authors as a library — i.e.,
   transport Extensions (§5) import the harness to self-certify before
   release.

At least one worked third-party transport example **MUST** be referenced
in the SDK's documentation to demonstrate the interface.

### 5. Transport implementations live outside SDK core

Concrete non-Standard transports (WebSocket, gRPC, SSH, QUIC, …) are not
part of SDK core and do not factor into SDK tier compliance. They ship as
**separate implementations** distributed independently of the SDK, and
consume the interface and harness from §4.

This SEP recognizes two tiers of transport implementation:

- **Third-party packages (the default).** Anyone **MAY** publish a
  `Transport` implementation as a standalone package. It **MUST** implement
  the interface from §4.1, preserve MCP semantics per §3, publish a
  JSON-RPC mapping per §3.1, and pass the SDK's conformance harness
  (§4.2) before release. It **MAY** add its own transport-specific tests
  on top of the shared harness (reconnection behavior, auth flow, wire
  encoding edge cases). No MCP governance step is required to ship one;
  it is simply a package that depends on an SDK.
- **Formalized SDK Extensions (the exception).** A small number of
  transport implementations with broad ecosystem adoption **MAY** be
  promoted to official SDK Extensions under
  [SEP-2133](./2133-extensions.md). Formalization buys governance,
  review, co-maintenance, and the visibility of appearing in Extension
  indexes. It does not change what the implementation has to do
  technically — the bar above applies either way. The vast majority of
  transport implementations are expected to remain in the third-party
  tier; Extension promotion is reserved for transports the ecosystem
  converges on.

SEP-2133 already carves Extension support out of SDK conformance tiering
("Extension support is not required for ... SDK conformance tiers"). This
SEP's Tier 1 requirement therefore applies only to the interface and
harness in §4, never to any particular transport implementation in either
tier.

In all cases, transport implementations are selected by the application
at client/server construction time. They are **not** negotiated over MCP
`initialize` — that would be a bootstrap paradox, since the transport
must already exist to carry `initialize`.

### 6. SDK tiering

Under [SEP-1730](./1730-sdks-tiering-system.md), a **Tier 1** SDK **MUST**:

- Ship the `Transport` interface (§4.1).
- Ship the conformance test harness (§4.2).
- Include tests in the SDK's own conformance suite that verify its
  stdio and Streamable HTTP adapters pass the harness.

Shipping any particular transport Extension (WebSocket, gRPC, SSH) is
**not** a Tier 1 requirement and is explicitly delegated to the Extension
ecosystem. Tier 2 and Tier 3 SDKs **MAY** skip the `Transport` interface
and harness entirely; their stdio/Streamable HTTP implementations remain
valid.

#### 6.1 Grandfathering for existing stable SDKs

SDKs that have already shipped a **stable major version** at the time
this SEP is accepted **MAY** retain Tier 1 status without implementing
§4.1 and §4.2 until their next major version bump. This is a one-time
grace window: the material refactor described in Backward Compatibility
(moving the JSON-RPC serializer out of the Transport contract) is
disruptive enough that forcing it into a patch or minor release would
violate semver guarantees downstream consumers rely on.

SDKs that reach their **first** stable release after this SEP is
accepted **MUST** comply from that release; no grandfathering applies.

Grandfathered SDKs **SHOULD** publish a target release for §4
compliance and link to it from their README so ecosystem transport
authors can plan against it.

## Rationale

### Why a small Standard set is load-bearing

Promoting a transport into the Standard set is the most expensive move the
protocol can make, on two axes:

- **Protocol complexity.** Each Standard transport lives in the spec
  forever. Its framing, lifecycle, security, and authorization chapters
  must be maintained in lockstep with every other transport and every
  future protocol change. Small additions today become large review
  surfaces tomorrow.
- **SDK maintainer workload.** Every Standard transport is a permanent
  implementation obligation for every official SDK. Three additions turn
  what was a two-transport workload into a five-transport workload across
  every language, with the corresponding test matrices and bug reports.

Keeping the Standard set at stdio and Streamable HTTP is therefore not a
minimalist aesthetic — it is the mechanism that keeps both the
specification and the SDK maintainer team tractable as the ecosystem
grows.

### Why the interface lives in the SDK, not the spec

- The spec governs wire format and semantics; it does not mandate SDK
  shape.
- An interface in the spec would drift from language-idiomatic SDK APIs or
  force all SDKs into an awkward shared shape.
- Pinning the interface at the SDK layer lets each SDK evolve it
  language-idiomatically while the tiering system enforces a common
  contract.

### Why a formal interface beats the status quo for auditability

Today's custom transports are typically SDK forks or monkey-patches that
are hard to audit and drift out of sync with upstream security fixes. A
formal, public `Transport` interface lets third-party transports ship as
independently reviewable packages that sit alongside an un-forked SDK.
Vulnerability discovery, coordinated disclosure, and upstream security
patches all become more tractable when the extension point is explicit
rather than a private contract with SDK internals.

### Why require a JSON-RPC mapping (§3.1)

Relaxing the JSON-RPC preservation requirement without any replacement
constraint would let a custom transport drift into being its own protocol.
Requiring a published bidirectional mapping to JSON-RPC pins the transport
to MCP's actual semantics and gives the ecosystem a concrete way to bridge
across transports: a Standard-only client can reach a custom-transport
server (and vice versa) through a generic translating proxy whose behavior
is fully specified by the mapping. JSON-RPC remains the lingua franca even
when it is not the wire format.

### Alternatives considered

- **Add gRPC / WebSocket to the spec.** Rejected: produces the
  compatibility matrix the core goal prevents. See draft SEP-1288 and
  draft SEP-1352 for concrete instances. (SSH/draft SEP-2325 is not in
  this category — it is already framed as Informational and custom, not
  a core-spec proposal.)
- **Leave custom transports informal (status quo).** Rejected: produces no
  SDK parity, no conformance story, and no supported distribution path.
- **Central registry of blessed custom transports.** Considered. The
  Extensions mechanism from SEP-2133 already provides this pattern; a
  parallel transport registry would duplicate governance.
- **Specify a wire-level transport negotiation handshake.** Rejected as
  scope creep. Negotiation is a higher-order concern; this SEP deliberately
  limits itself to the SDK extension point.

### Prior art

The "small core + SDK extension points" pattern is well-established:

- **OpenTelemetry Exporters.** The OTel specification keeps the core data
  model small and defines a pluggable
  [`SpanExporter` / `LogRecordExporter` / `MetricExporter` interface](https://opentelemetry.io/docs/specs/otel/trace/sdk/#span-exporter)
  that third parties implement. A given language SDK ships a handful of
  first-party exporters (OTLP, stdout); the rich ecosystem of backend
  integrations (Jaeger, Zipkin, Prometheus, vendor-specific) lives in
  separate packages per language, all conforming to the same interface
  shape. This is the closest direct analogue to what this SEP proposes.
- **Python WSGI / ASGI.** [PEP 3333](https://peps.python.org/pep-3333/)
  and the [ASGI spec](https://asgi.readthedocs.io/en/latest/specs/main.html)
  define a single narrow interface between Python web servers and web
  applications. Dozens of servers (Gunicorn, uWSGI, Uvicorn, Daphne,
  Hypercorn, …) and hundreds of frameworks compose freely against that
  contract, without the HTTP spec itself needing to name any of them.
- **Java JDBC.** The [`java.sql.Driver` / `Connection` interfaces](https://docs.oracle.com/javase/8/docs/api/java/sql/Driver.html)
  define a contract; every database vendor ships a driver implementing it.
  The Java platform does not need to bless Postgres, MySQL, or Oracle —
  the interface is the blessing.
- **gRPC interceptors and transport credentials.** gRPC keeps its wire
  protocol fixed and exposes
  [interceptors](https://grpc.io/docs/guides/interceptors/) and
  [credential plugins](https://grpc.io/docs/guides/auth/) for
  cross-cutting behavior. Applications extend behavior without modifying
  the protocol.

In each case, the ecosystem kept wire-level or protocol-level scope small
and moved flexibility into a stable library-surface contract — exactly the
trade this SEP applies to MCP transports.

## Backward Compatibility

- No normative changes to stdio or Streamable HTTP. Both continue to carry
  JSON-RPC with the existing framing rules.
- No change to the JSON-RPC wire protocol itself.
- **Normative changes to the transports chapter (§3).** Two clauses are
  amended: the chapter-opening sentence is scoped to Standard transports,
  and the Custom Transports JSON-RPC preservation requirement is replaced
  with a semantics-only one. The wire-format relaxation is strictly more
  permissive, but §3.1 adds a new obligation — every custom transport
  **MUST** publish a bidirectional JSON-RPC mapping. Existing
  JSON-RPC-preserving custom transports therefore remain technically
  compliant on the wire but **MUST** publish a (near-trivial) identity
  mapping to meet §3.1. Custom transports that previously transcoded
  JSON-RPC into another encoding were non-compliant under the old rule
  and become compliant under the new rule once they ship a mapping.
- SDKs that already expose a transport abstraction **MAY** need signature
  adjustments to match §4.1, plus the conformance harness described in
  §4.2. SDKs that do not expose an abstraction **MUST** add one to retain
  Tier 1 status per SEP-1730; this is a material refactor (moving the
  JSON-RPC serializer to the Standard-transport adapter rather than
  hard-wiring it into the Transport contract), not a cosmetic change.
- **Grandfathering for existing stable SDKs (§6.1).** SDKs already at a
  stable major version when this SEP is accepted retain Tier 1 status
  without §4 compliance until their next major version bump. The §4
  refactor is too disruptive to land in a patch or minor release without
  breaking semver. SDKs whose first stable release is after acceptance
  comply from day one.
- Existing third-party transports written against SDK internals **MAY**
  need to migrate to the new public interface. This is a one-time cost and
  eliminates the ongoing fork-maintenance burden.

## Security Implications

The trust model for custom transports is largely unchanged by this SEP —
custom transports are already permitted today, and the concerns that apply
to them (third-party code in the data path, full visibility into MCP
message contents) apply identically whether the transport is built against
the new interface or today's ad-hoc escape hatch. This section surfaces
only the risks specifically introduced or shaped by this SEP.

- **Transcoding fidelity is a new correctness boundary.** Because custom
  transports **MAY** use a non-JSON-RPC wire encoding (§3), transcoding
  becomes a place where MCP semantics can be silently lost, reordered, or
  forged. The conformance harness (§4.2) and the round-trip mapping test
  (§3.1) exist specifically to bound this risk; transport Extensions
  **MUST** pass the harness before release.

## Reference Implementation

TODO — to be completed before this SEP reaches `Final`. Planned scope:

- Prototype the `Transport` interface in the TypeScript SDK and the Python
  SDK (branches linked from the PR).
- Port one non-Standard transport (WebSocket, following SEP-1288) as an
  SDK Extension demonstrating the interface end-to-end.
- Publish a transport conformance test harness that exercises the full
  MCP lifecycle against any `Transport` implementation.

## Related SEPs and Issues

**Accepted SEPs this proposal builds on:**

- [SEP-1730](./1730-sdks-tiering-system.md) — SDK tiering system; this
  SEP adds Tier 1 conformance requirements (interface + harness).
- [SEP-2133](./2133-extensions.md) — Extensions framework; the
  distribution path for formalized transport implementations.

**Draft / in-review proposals this SEP addresses:**

- Draft SEP-1288 —
  [issue #1288](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1288)
  — WebSocket transport, in-review, sponsored. Addressed by this SEP via
  the third-party-package / Extension path rather than core inclusion.
- Draft SEP-1352 —
  [issue #1352](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1352)
  — gRPC transport, draft, unsponsored. Also
  [issue #966](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/966)
  (earlier gRPC proposal). Addressed via the third-party-package /
  Extension path.
- Draft SEP-2325 —
  [PR #2325](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2325)
  — SSH custom transport, Informational. A concrete example of the
  custom-transport path this SEP formalizes; aligned in spirit.
