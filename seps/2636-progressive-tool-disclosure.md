# SEP-0000: Progressive Tool Disclosure

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-04-21
- **Author(s)**: Sai Prakash <sylonzero@gmail.com> (@SylonZero)
- **Sponsor**: None (seeking sponsor)
- **PR**: TBD

## Abstract

This SEP introduces **Progressive Tool Disclosure**: a two-stage discovery lifecycle that decouples the lightweight catalog payload returned to a model from the full invocation contract required to call a tool.

Two new methods are added: `tools/catalog` returns a compact `ToolCatalogEntry` per tool — name, one-line summary, tags, optional annotations, and a content hash of the underlying schema; `tools/describe` returns the complete `Tool` (including `inputSchema` and `outputSchema`) for an explicitly named subset. A new server capability, `tools.progressiveDisclosure`, gates both methods. The existing `tools/list` method is unchanged and remains the backward-compatible floor.

The `tools/catalog` method also accepts an optional opaque `query` string with semantics drawn from [SEP-1821](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1821), allowing servers to return a search-filtered subset of the catalog. Together these primitives let agents perform a `query → describe → call` flow that loads full JSON Schemas only for the small set of tools actually being considered for invocation, materially reducing the per-turn context footprint of MCP integrations with tool catalogs of more than a handful of entries.

## Motivation

The current `tools/list` method returns a single monolithic `Tool` record per available tool, comprising `name`, `description`, full `inputSchema`, optional `outputSchema`, and `annotations`. For real-world MCP servers — particularly those wrapping enterprise applications — this record is large: 300–2000 tokens per tool is typical, dominated by JSON Schema for parameters with rich enums, format hints, and nested object shapes.

In every MCP host that exposes tools to an LLM today, this entire payload is materialised in the model's context on every turn, before the model has even decided whether tools are relevant to the user's request. The cost scales linearly with catalog size and is paid on every chat completion.

A worked example from the MindStaq MCP service (project, task, OKR, and issue management for a SaaS work-management platform):

| Metric                                | Value          |
| ------------------------------------- | -------------- |
| Distinct tools exposed                | ~25            |
| Mean tool record size                 | ~700 tokens    |
| Per-turn `tools/list` context cost    | ~17,500 tokens |
| Tools actually invoked per turn (p95) | 0–2            |
| Wasted tokens per turn (p95)          | ~16,000+       |

The community has converged on the symptom from several angles:

- **[SEP-1821](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1821)** (Dynamic Tool Discovery, Egor Orlov) adds a `query` parameter so `tools/list` returns a filtered subset. This reduces _how many_ records are returned but does not reduce the per-record payload — matching tools still ship full schemas.
- **[SEP-1862](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1862)** (Tool Resolution, Nick Cooper) adds `tools/resolve` for refining per-call annotations once arguments are known. Orthogonal to upfront catalog cost.
- **[SEP-1881](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1881)** (Scope-Filtered Tool Discovery, Kevin Gao) standardises auth-driven filtering. Also orthogonal: a user with full scopes legitimately holding 200 tools is not helped.
- **[Issue #2470](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/2470)** (Capability-Aware Tool Presentation) proposes per-tool tier hints. Reduces individual record size but leaves the catalog enumeration model unchanged.
- **[SEP-2564](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2564)** (Server-Side Filtering for List Methods, LucaButBoring) adds glob-based name filters. Pattern matching only; matching tools still ship full schemas.

What is missing across all of these is the structural change: separating the **discovery contract** (what tools exist, what they roughly do) from the **invocation contract** (the exact schema needed to call them). Once those are separate, every other proposal in this space composes more cleanly: search filters operate on the cheap surface, scope filtering hides records at the catalog layer, capability tiers describe how the catalog summary is generated, and tool resolution refines annotations after `describe`.

## Specification

### 1. Capability Negotiation

A new optional capability, `tools.progressiveDisclosure`, signals support for both new methods:

```typescript
interface ServerCapabilities {
  tools?: {
    listChanged?: boolean;
    progressiveDisclosure?: boolean;
  };
}
```

- `progressiveDisclosure: true`: the server implements `tools/catalog` and `tools/describe` as specified below, and supports the `query` parameter on `tools/catalog`.
- Absent or `false`: the server supports only `tools/list`. Clients MUST NOT issue `tools/catalog` or `tools/describe` requests.

A future SEP MAY split this into a more granular capability object (`{ describe?: boolean; query?: boolean; hashing?: boolean }`) if partial implementations become motivated. v1 deliberately keeps the surface minimal.

### 2. `tools/catalog` Method

`tools/catalog` returns a paginated list of `ToolCatalogEntry` records. Each record contains the minimum information an agent needs to decide whether a tool is a candidate for the current task, without including the invocation schema.

#### Request

```typescript
interface ListToolsCatalogRequest {
  method: "tools/catalog";
  params?: {
    /** Pagination cursor from a prior response. */
    cursor?: string;

    /**
     * Optional opaque search string. Semantics inherited from SEP-1821:
     * the server interprets the query (substring, semantic, fuzzy, tag,
     * etc.). Clients SHOULD use simple natural-language phrases or
     * keywords. Servers SHOULD document the expected format in the
     * `instructions` field of the InitializeResult.
     */
    query?: string;
  };
}
```

#### Response

```typescript
interface ListToolsCatalogResult {
  tools: ToolCatalogEntry[];
  nextCursor?: string;
}

interface ToolCatalogEntry {
  /** Unique tool identifier; same value used by tools/call. */
  name: string;

  /** Optional human-readable title. */
  title?: string;

  /**
   * REQUIRED. A single-sentence description suitable for surfacing in
   * a model's tool catalog. Servers SHOULD keep this under 200
   * characters. Distinct from the canonical `description` returned by
   * tools/describe, which MAY be longer and more detailed.
   */
  summary: string;

  /**
   * Optional categorical tags. Used both for client-side filtering
   * and to give the model a coarse-grained sense of the tool family.
   */
  tags?: string[];

  /**
   * REQUIRED when `tools.progressiveDisclosure` is true.
   * Hex-encoded SHA-256 of the canonical JSON serialization of the
   * full `Tool` object (as returned by tools/describe). Provides a
   * stable invalidation key for clients that choose to cache full
   * schemas. See §5 for canonicalization rules and change semantics.
   */
  schemaHash: string;

  /**
   * Optional. Lightweight annotations safe to surface in the catalog
   * (e.g., `readOnlyHint`, `destructiveHint`, `openWorldHint`).
   * Clients SHOULD treat these as advisory and prefer per-call
   * refinement via tools/resolve (SEP-1862) when available.
   */
  annotations?: ToolAnnotations;
}
```

#### A note on `summary` quality

`summary` is REQUIRED so clients can rely on its presence. Servers MAY auto-generate it (the reference implementation derives it from the first sentence of `description`, truncated to 200 characters) and MAY curate it for higher routing quality. Auto-generated summaries are acceptable for adoption; **curated summaries are RECOMMENDED** when the underlying `description` is long, jargon-heavy, or written for a different audience than the LLM that will route on it. Servers operating with capability-tiered consumers (per [Issue #2470](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/2470)) MAY use this field as the natural carrier for the small-model tier description.

#### Server Behaviour

1. When `query` is present, the server SHOULD return a filtered subset of the catalog that the server considers relevant to the query.
2. When `query` is absent, the server MUST return all tools the current session is authorised to see, paginated via `cursor`.
3. The server MUST NOT include `inputSchema`, `outputSchema`, or any field other than those defined on `ToolCatalogEntry`. Clients rely on this to bound the per-record size.
4. The set of tools and the contents of each `ToolCatalogEntry` MUST be consistent with what `tools/describe` and `tools/list` return for the same session.
5. The server MUST emit `notifications/tools/list_changed` (existing notification) when the catalog, the schemas, or any `schemaHash` value changes. See §5 for the change-domain semantics.

### 3. `tools/describe` Method

`tools/describe` returns the full `Tool` record for one or more named tools.

#### Request

```typescript
interface DescribeToolsRequest {
  method: "tools/describe";
  params: {
    /**
     * REQUIRED. One or more tool names previously surfaced via
     * tools/catalog (or tools/list). Servers MUST support requests
     * containing 1..N names in a single call. N is implementation-
     * defined; servers MAY return a `RequestTooLarge` error if N
     * exceeds an internal bound, in which case clients SHOULD batch.
     */
    names: string[];
  };
}
```

#### Response

```typescript
interface DescribeToolsResult {
  tools: Tool[]; // existing Tool type, schemas included
}
```

#### Server Behaviour

1. The order of `tools` in the response MUST match the order of `names` in the request, so clients can pair results positionally.
2. If one or more requested names are not present in the current authorised catalog, the server MUST return a single JSON-RPC error response with code **`-32002` `RESOURCE_NOT_AVAILABLE`** and a `data.unknownNames: string[]` field listing every offending name. Partial success responses are not permitted.
3. The full `Tool` returned MUST be byte-identical (modulo whitespace) to whatever the same name would yield from `tools/list`, ensuring `schemaHash` consistency.

The `-32002` code is in the JSON-RPC server-defined range (`-32000` to `-32099`) and is reserved by this SEP for "one or more requested resources are not available to the current session." It is deliberately distinct from `-32602` (Invalid params), which signals a malformed request shape rather than a not-found / not-authorised resource. Reusing `-32602` here would conflate a structurally valid request against a missing-or-unauthorised resource with a structurally invalid request, and would force clients to inspect `data` to disambiguate. Future SEPs MAY adopt `-32002` for analogous semantics on other methods.

### 4. Interaction with `tools/list`

`tools/list` is unchanged. Servers advertising `tools.progressiveDisclosure` MUST continue to support `tools/list` and MUST return identical content for the same session.

A trivial server-side polyfill — implementing `tools/catalog` and `tools/describe` as views over an existing `tools/list` — is provided in the reference implementation. This means SDK authors can ship the new methods with no application-code changes for servers that already implement `tools/list`.

Clients SHOULD prefer `tools/catalog` + `tools/describe` over `tools/list` whenever the server advertises the capability, _unless_ the client genuinely needs the full catalog (e.g., a tool inspector UI).

### 5. Schema Hash Canonicalization

`schemaHash` is the lowercase hex-encoded SHA-256 digest of the canonical JSON serialization of the full `Tool` object returned by `tools/describe`, where canonical JSON is defined as:

1. Object keys are sorted lexicographically by Unicode code point.
2. No insignificant whitespace.
3. Strings serialised with the JSON escaping rules in RFC 8259, using the shortest valid escape for each character.
4. Numbers serialised in their shortest round-trip form per ECMA-404.

This matches RFC 8785 (JCS) section 3.2 and is implementable in ~30 lines in any language. A reference implementation in TypeScript is included with the prototype.

The hash is computed over the full `Tool` object — including `name`, `title`, `description`, `inputSchema`, `outputSchema`, and `annotations` — but NOT including `ToolCatalogEntry`-only fields like `summary`, `tags`, or `schemaHash` itself.

#### Change domains

The deliberate exclusion of `summary` and `tags` from the hash creates two distinct change domains, both signalled by the existing `notifications/tools/list_changed` notification:

- **Invocation-contract changes** (`schemaHash` changes): the underlying `Tool`'s name, title, description, schemas, or annotations have changed in a way that affects how the tool is called or what it returns. Clients that have cached the full `Tool` for that name MUST treat the cache entry as stale.
- **Discovery-metadata changes** (`schemaHash` unchanged): the server's `ToolCatalogEntry` view of the tool — typically `summary` or `tags` — has changed, but the invocation contract has not. Cached schemas remain valid; clients that surface summaries to a model may want to refresh their catalog view but need not re-fetch schemas.

`notifications/tools/list_changed` does not distinguish between the two. The hash is the authoritative invalidation signal for any cached `Tool`. Servers MUST regenerate `schemaHash` whenever any field of the underlying `Tool` changes.

#### Caching

The protocol provides `schemaHash` precisely so that clients which choose to cache full schemas have a stable, low-cost invalidation key; the protocol itself does not prescribe a cache strategy or persistence model. The reference implementation includes a working in-memory cache with the recommended hit/miss/reconcile pattern, and serves as the canonical example for client implementors.

### 6. Interaction with Other SEPs

This SEP is intentionally composable with related in-flight proposals:

- **SEP-1821 (Dynamic Tool Discovery)**: This SEP standardises the preferred query-bearing discovery surface for token-efficient catalogs by hosting the `query` parameter on `tools/catalog`. It does not propose deprecating `query` on `tools/list`; the two surfaces target different cost regimes. Whether `tools/list` ultimately retains a `query` parameter is left to that SEP's authors and the broader community to decide.
- **SEP-1862 (Tool Resolution)**: Fully orthogonal. `tools/resolve` operates on the full `Tool` returned by `tools/describe` (or `tools/list`), refining annotations once arguments are known.
- **SEP-1881 (Scope-Filtered Tool Discovery)**: Fully orthogonal. Scope filtering applies at the catalog layer; this SEP simply lets that filtering manifest through a cheaper surface.
- **Issue #2470 (Capability-Aware Tool Presentation)**: Complementary. The `summary` field is a natural place for a tier-aware short description; the full tier hints, if adopted, would live on the `Tool` returned by `tools/describe`.
- **SEP-2564 (Server-Side Filtering for List Methods)**: Compatible. Glob `filter` parameters could be added to `tools/catalog` in a follow-up SEP without disturbing the structure here.

## Rationale

### Why a separate method instead of a `verbose: false` flag on `tools/list`?

Three reasons. First, a flag overloads a single method with two distinct response shapes, which is awkward to type in statically-typed SDKs (Python, TypeScript, Rust, Go). Second, separate methods make caching contracts explicit: clients know that `tools/catalog` is cheap and idempotent, while `tools/describe` is a targeted lookup. Third, the rate of evolution of the two surfaces is likely to differ — e.g., we may want to add embedding vectors or routing scores to `ToolCatalogEntry` without touching `Tool`.

### Why include `schemaHash` rather than relying on `notifications/tools/list_changed`?

The notification tells you something changed somewhere in the catalog; it doesn't tell you what. Without per-tool versioning, a client that has cached schemas for 100 tools must refetch all 100 on any change, defeating the purpose of caching. Per-tool hashes turn invalidation into a set-difference operation. The §5 change-domain separation is a direct consequence: hashes describe the invocation contract, the catalog itself describes discovery metadata, and the two evolve independently.

### Why `summary` separate from `description`?

`description` on the existing `Tool` type is canonically used by the model to decide whether to invoke the tool. It is often a paragraph or more, with examples and edge cases. The catalog needs something deliberately shorter — closer to a function signature comment — so that 50–500 tools can fit in a few thousand tokens at most. Forcing the existing `description` to do double duty would either inflate catalog size or starve the LLM of context at call time.

### Why batched `tools/describe` rather than per-tool fetches?

Tool selection in practice produces 1–5 candidates per turn. A single round trip to fetch all candidate schemas is materially better than 1–5 sequential round trips, especially over high-latency transports (stdio with subprocess startup, network HTTP). The ordering guarantee makes positional pairing trivial.

### Why `tools/catalog` rather than `tools/index` or `tools/discover`?

The method name was the subject of meaningful early discussion. `tools/index` was the working name during prototype development, and remains a reasonable choice — "index" is CS-idiomatic for a compact lookup pointing to fuller records (database indexes, book indexes). The objection is that "index" can also be read as either "list of names" or "search index," and combined with the `query` parameter some readers may infer a search-primitive intent rather than a catalog-enumeration intent. `tools/catalog` is more precise about the intent: a catalog is a curated, discoverable inventory; entries point to invocation details that live elsewhere. `tools/discover` was also considered but reads more like an action ("perform discovery") than the resource-oriented framing the rest of MCP uses (`tools/list`, `tools/call`). Community input on the final name is welcome — see Open Questions.

### Why not mandate a query format?

SEP-1821 made the right call here: query format is server-defined, and the server documents it via `instructions`. Substring matching, BM25, semantic search via embeddings, tag matching — all are valid implementations, with sharply different cost/quality tradeoffs that should be a server-operator decision, not a protocol decision.

### Alternatives considered

1. **Single `tools/list` method with a `fields` projection parameter** (à la GraphQL field selection or Google APIs partial responses). Rejected: pushes complexity into both client and server for a use case that has only two practical projections (lightweight vs. full).
2. **Inverting the surfaces**: keep the lightweight payload on `tools/list` and add a new `tools/search` for full-schema fetches. Concretely: redefine `tools/list` so it returns the compact `ToolCatalogEntry[]` proposed here, and add `tools/search` returning full `Tool[]` for matching names. Rejected for two reasons. First, redefining `tools/list` to return a fundamentally different payload shape (no `inputSchema`, no `outputSchema`) under the same method name is a silent backward-compatibility break — every existing client expecting full schemas from `tools/list` would still receive a structurally valid response, but with the schemas they need silently absent. The worst kind of break, because it doesn't error. Second, `list` is a poor name for the catalog-style payload: a method named `list` should return the things themselves, the way `ls` does, not a directory of references-plus-summaries pointing to where the things live. The compact surface is genuinely a catalog, and naming it as such avoids both the compatibility hazard and the semantic mismatch.
3. **Embedding the catalog in `InitializeResult`**. Rejected: catalogs change, and `initialize` is the wrong place to gate the connection on a potentially expensive enumeration.
4. **Reusing `-32602` (Invalid params) for unknown tool names in `tools/describe`**. Rejected: see §3. Conflates resource-availability with request-shape validity, and forces clients to inspect `data` to disambiguate.

## Backward Compatibility

This SEP is fully backward-compatible.

- Servers that do not advertise `tools.progressiveDisclosure` are unaffected. Clients MUST NOT issue `tools/catalog` or `tools/describe` against such servers.
- Clients that do not implement progressive disclosure continue to use `tools/list` and observe no change in behaviour.
- Servers that advertise the capability MUST also continue to support `tools/list`, ensuring older clients keep working unchanged.
- The polyfill described in §Reference Implementation lets SDK authors light up the capability for any server that already implements `tools/list`, with zero application-code changes.

There are no breaking changes to existing types: `Tool`, `ToolAnnotations`, and `ServerCapabilities.tools` are extended additively only.

## Security Implications

- **`schemaHash` does not leak schema contents.** SHA-256 is a one-way function; the hash discloses only whether two schemas are byte-identical, which is already trivially observable by any authorised client via `tools/describe`.
- **Catalog-layer scope filtering.** When a server applies authorisation filtering (per SEP-1881 or any pre-existing implementation), it MUST filter at the `tools/catalog` layer with the same rules as `tools/list`. A tool hidden from `tools/list` MUST also be hidden from `tools/catalog`, and `tools/describe` MUST treat its name as unknown. Failure to maintain this invariant is an authorisation bypass.
- **Unknown-name handling MUST NOT distinguish missing from unauthorised.** `tools/describe` returns the same `-32002 RESOURCE_NOT_AVAILABLE` error regardless of whether a requested name does not exist in the underlying catalog or exists but is filtered out for the current session. Returning a distinct error for the two cases would let unauthorised clients enumerate the existence of tools they cannot see.
- **Query injection.** The `query` parameter is opaque to the protocol; servers parsing it MUST treat it as untrusted user input, particularly if backed by a search engine, vector database, or LLM-based retriever.

No new authentication, authorisation, or transport surface is introduced.

## Reference Implementation

A reference prototype has been published as a self-contained workspace package on a branch of the official TypeScript SDK fork:

**Branch**: [`SylonZero/typescript-sdk@sep/progressive-tool-disclosure`](https://github.com/SylonZero/typescript-sdk/tree/sep/progressive-tool-disclosure/examples/progressive-disclosure)

The prototype is intentionally not wired into the SDK's internal `Server` / `Client` request-handler API yet — per the SDK's `CONTRIBUTING.md`, spec-touching changes require a SEP first. The integration pattern is mechanical and identical to `packages/server/src/experimental/tasks/server.ts` (SEP-1686). The prototype demonstrates the API surface, validates the design, and produces the reproducible token-cost numbers cited in §Performance Implications.

### What is included

- **`src/types.ts`** — wire-format types (`ToolCatalogEntry`, request/response shapes, `ProgressiveDisclosureCapability`, `UnknownToolNamesError` with code `-32002`)
- **`src/canonicalJson.ts`** — RFC 8785 (JCS) subset, sufficient for stable `Tool` hashing
- **`src/schemaHash.ts`** — SHA-256 over the canonical JSON serialization
- **`src/server.ts`** — `ProgressiveDisclosureServer` polyfill: derives `tools/catalog` and `tools/describe` from any existing tool catalog, with configurable `pageSize`, `describeBatchLimit`, `deriveSummary`, `deriveTags`, and `queryMatcher`
- **`src/client.ts`** — `listToolsCatalog`, `describeTools`, and `ProgressiveDisclosureCache` demonstrating the recommended cache hit/miss/reconcile pattern referenced in §5
- **`src/demo.ts`** — runnable in-process end-to-end lifecycle showing turn-by-turn cache hit/miss accounting
- **`bench/sampleTools.ts`** — 37 synthetic tools modelled on the MindStaq MCP service (projects, tasks, issues, OKRs, meta)
- **`bench/runBench.ts`** + **`bench/results.md`** — the benchmark and its captured output
- **`tests/`** — 35 vitest tests across canonical JSON, schema hash stability, polyfill behaviour (pagination, query matching, batch limits, unknown name handling), and cache lookup (cold cache, partial cache, reconcile, persistence, namespace isolation)

### Validation

Run on the branch as committed:

```
$ npm install
$ npm run typecheck    # strict TypeScript clean (noUncheckedIndexedAccess + exactOptionalPropertyTypes)
$ npm test             # 35 tests pass across 4 suites
$ npm run bench        # produces the table in §Performance Implications
$ npm run demo         # in-process lifecycle: cold cache → 1 describe; warm → 0; reconcile → evict
```

### What the prototype does not yet do

Out of scope for this prototype, intentionally:

- Network transport. The server and client run in-process via a synchronous `RequestFn`; wiring stdio or HTTP is mechanical.
- Integration with the SDK's `Server.setRequestHandler` registry. Deferred until the SEP is accepted.
- Compositional integration with related SEPs (1862 resolve, 1881 scope filtering, 2564 glob filtering). The composition story is in §6 and would land as follow-on SEPs or implementations.

## Performance Implications

The intended impact is a substantial reduction in per-turn context cost for hosts that route tools through MCP. The reference implementation ships a benchmark over a 37-tool synthetic catalog modelled on the MindStaq MCP service; the table below is its actual output, measured with the `cl100k_base` tokenizer via `js-tiktoken`.

| Scenario                                 |  Bytes | Tokens (cl100k_base) | Savings vs baseline |
| ---------------------------------------- | -----: | -------------------: | ------------------: |
| Baseline `tools/list` (n=37)             | 20,709 |                5,238 |                   — |
| `tools/catalog` only                     |  9,639 |                2,919 |               44.3% |
| `tools/catalog` + `tools/describe(k=1)`  | 10,796 |                3,223 |               38.5% |
| `tools/catalog` + `tools/describe(k=3)`  | 11,771 |                3,458 |               34.0% |
| `tools/catalog` + `tools/describe(k=5)`  | 12,938 |                3,767 |               28.1% |
| `tools/catalog` + `tools/describe(k=10)` | 16,654 |                4,732 |                9.7% |
| Steady state (cache hit, catalog only)   |  9,639 |                2,919 |               44.3% |

`cl100k_base` is the encoding used by GPT-3.5-turbo, GPT-4, and GPT-4o. It is a defensible proxy for Anthropic's tokenizer on schema-heavy JSON payloads — the two differ by single-digit percentages on the workloads measured here. Reviewers can reproduce the table exactly with `cd examples/progressive-disclosure && npm install && npm run bench`. Two heuristic estimators (chars/4 and JSON-aware) are retained in `bench/tokenize.ts` for sanity-check comparison; the SEP cites only the tiktoken column.

The shape of the curve is the meaningful artifact: at the typical operating point — agent picks 1–3 tools per turn, with caching warm — the reduction is in the 34–45% range. As the per-turn pick count grows, the marginal benefit shrinks (at k=10, only 9.7%) because at some point materialising every schema costs as much as `tools/list` did to begin with. The win is largest for the common case (small k, high cache hit rate) and degrades gracefully toward baseline for catalogs that genuinely need most tools per turn.

For larger catalogs the relative improvement holds and the absolute win grows: a 200-tool catalog of similar shape would be on the order of ~28k baseline tokens, ~16k catalog-only — a ~12k token saving on every turn that the cache hits.

There is a per-turn cost: `tools/describe` adds one additional round trip when the agent picks tools whose schemas are not yet cached. For stdio transports this is sub-millisecond; for network transports it is a single HTTP request. Steady state (with client-side caching as demonstrated in the reference implementation) is one round trip per _new_ tool, not per turn.

## Testing Plan

The reference prototype already covers most of the conformance surface. The 35 tests at `examples/progressive-disclosure/tests/` exercise:

1. Canonical JSON: primitive serialization, object key ordering, undefined-vs-null handling, deep nesting, whitespace invariants, non-finite number rejection.
2. Schema hash: lowercase hex SHA-256 format, stability across encode/decode round-trips, invariance to top-level and nested key ordering, change detection on schema and annotation mutation.
3. Polyfill (`tools/catalog` and `tools/describe`): one `ToolCatalogEntry` per source `Tool`, hash equivalence with `computeSchemaHash`, summary truncation, custom summary derivation, cursor pagination across multiple pages, default and custom query matchers, request-order preservation, empty/oversized batch rejection, `UnknownToolNamesError` semantics with the `-32002` code, and round-trip equivalence between `describe(all_names)` and the source catalog.
4. Cache: cold-cache batched describe, repeat-lookup cache hits, partial-cache miss extraction, `reconcile()` eviction on hash change, persistence hook invocation, and namespace isolation between server identities.

Two areas are still open and worth covering before final acceptance:

5. Wire-format conformance against an SDK-integrated implementation (deferred to the SDK PR that follows acceptance).
6. Authorization-bypass test confirming that scope filtering (SEP-1881) applied at `tools/list` is also applied at `tools/catalog` and `tools/describe`, and that `tools/describe` returns `-32002` indistinguishably for missing-vs-unauthorised names.

## Open Questions

1. **Method name.** `tools/catalog` is the current proposal; `tools/index` was the working name during prototype development; `tools/discover` was considered. Community input welcome before the name is finalised.
2. **Catalog entry size guidance.** Should the spec set a normative upper bound on `summary` length (e.g., 200 chars), or leave it as a SHOULD with a recommended target?
3. **Embedding vectors in `ToolCatalogEntry`.** Some servers will want to ship pre-computed embeddings to enable client-side semantic routing. This SEP omits that surface to keep v1 minimal; reserving an `embedding?` field for a future SEP is one option.
4. **Granularity of the capability flag.** As noted in §1, a single boolean covers the common case but may need to split into `{ describe, query, hashing }` if partial implementations emerge.
5. **Long-term relationship to SEP-1821.** Whether `query` on `tools/list` remains useful, or is deprecated in favour of `tools/catalog`, is a question for the broader community to answer in concert with that SEP's authors.

## Acknowledgments

This proposal stands directly on the work of Egor Orlov ([SEP-1821](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1821)) and Nick Cooper ([SEP-1862](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1862)), whose framing of the problem made the gap addressed by this SEP visible. The Yantrikos team's empirical data in [Issue #2470](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/2470) provides much of the quantitative motivation for taking the catalog-cost problem seriously.
