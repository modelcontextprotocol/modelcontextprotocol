# SEP-2636: Tool Manifests for Incremental Catalog Synchronization

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-04-21
- **Author(s)**: Sai Prakash (@SylonZero)
- **Sponsor**: None (seeking sponsor)
- **PR**: 2636

## Abstract

This SEP adds two coordination primitives to the tools capability that let a client obtain and maintain a server's tool definitions incrementally rather than wholesale.

The first is `tools/manifest`, which returns, for every tool the session may see, a compact manifest entry: the tool's identity, a server-computed `digest` and byte `size` of its full definition, and optional annotations, but no invocation schema. The second is `tools/describe`, which returns the complete `Tool` definitions for an explicitly named subset. A server capability, `tools.manifest`, advertises both. `tools/list` is unchanged and remains the compatibility floor. The manifest and `tools/list` MUST return the same set of tools for a session, and every name in the manifest MUST be describable.

The relationship between the two methods is the one between a manifest and the content it indexes. The manifest lists entries by name with a digest, `tools/describe` fetches the full definition by name, and a client reconciles its cached copy by comparing digests. The digest is computed over the full `Tool` object under a defined canonical serialization, so two parties that hold the same definition compute the same value. It gives a client a per-tool freshness key that neither the catalog-wide `notifications/tools/list_changed` notification nor the result-wide TTL fields of SEP-2549 provide.

This SEP makes no claim about model context tokens. How and when a host places definitions in front of a model is a host concern, already addressed by client-side progressive discovery and by native provider tool search. This SEP addresses the step before that: how a client, or an intermediary acting for many clients, acquires and keeps current the definitions those mechanisms depend on, when the catalog is large or changes often.

## Motivation

### The host side of the problem is solved; the wire side is not

Hosts that connect to many servers no longer place every tool definition in front of the model. The recommended pattern is to fetch definitions with `tools/list`, hold them outside the model's context, expose a search meta-tool, and load a definition only when the model selects it. Several model providers now offer this natively. Context cost is therefore a host optimisation, and this SEP does not attempt to improve on it.

Every such pattern, however, begins with the host holding a complete and current copy of every definition, and the protocol offers exactly one way to obtain that: `tools/list`, which returns every tool with its full schema. This is adequate for a server with a few dozen tools. It stops being adequate in two situations that are now common.

### Situation 1: catalogs too large to fetch wholesale

Servers that front an entire product surface, and intermediaries that aggregate many upstream servers, routinely expose hundreds to thousands of tools. An aggregator that fronts several hundred upstream servers must, on every cold start and every reconnect, pull every definition from every server to rebuild the index its own search depends on. The transfer is dominated by JSON Schema that the aggregator will not read until a tool is actually selected, and most of it is unchanged since the last fetch.

There is no way today to ask a server for the definitions of three named tools. A client that already knows which tools it needs still pays for the whole catalog.

### Situation 2: catalogs that change while cached

`notifications/tools/list_changed` tells a client that something in the catalog changed. It does not say what. The TTL fields introduced by SEP-2549 tell a client how long a whole list result may be trusted. Neither lets a client that has cached a thousand definitions discover that one of them is stale without refetching all of them. For a server whose tools are generated from a live schema, a permission model, or a plugin system, the catalog changes frequently and the whole-catalog refetch is paid frequently.

### The pattern is being reinvented privately

Implementations that hit these limits have converged on the same shape: a lightweight index entry per tool, a fetch of the full definition by a stable identifier, and invocation by that identifier. Publicly visible examples include tool aggregators that return search hits with an inline schema for some entries and a reference to fetch it for others, and servers that group operations behind domain entrypoints whose result data carries the child definitions and a content-derived generation number.

Because the protocol has no primitive for this, each implementation defines its own identifiers, its own fetch contract, and its own staleness signal. The practical cost falls on hosts. A tool discovered through one of these private layers arrives as result data behind a generic wrapper tool. The host cannot register it as a native tool with the model provider, cannot read its annotations before deciding to inspect it, and cannot apply per-tool policy, because from the host's point of view the only tool that exists is the wrapper. The wrapper's author, not the host, ends up owning authorisation and audit for every call that passes through it.

### Why this belongs in the protocol

The two capabilities this SEP adds fail the "do it client-side" test in the strict sense: a client cannot fetch a subset of definitions unless the server offers a method that accepts names, and a client cannot know whether its cached copy of a definition matches the server's without a value the server computes over its own copy. Both require the client and server to agree on a contract, and both are useful to every implementation that has outgrown wholesale `tools/list`, whether it is a host, an aggregator, or a server-side polyfill over an existing catalog.

Standardising the shape also restores tool identity across intermediaries. An aggregator that speaks these primitives to its upstream servers can keep its index current at the cost of the entries that actually changed. An aggregator that speaks them to its downstream hosts hands over real `Tool` definitions that the host can treat exactly as it treats tools from any other server, including registering them with a provider's native tool search.

### What this SEP measures

The claims above are about transfer cost and freshness, not tokens. The reference implementation therefore reports, for a synthetic server of one thousand tools: bytes and definitions transferred at cold start with and without the manifest; bytes and definitions transferred to reconcile a warm cache after one, ten, and one hundred tools change; and the number of round trips in each case. Those figures, not context tokens, are the basis on which this proposal should be judged.

## Specification

### 1. Capability Negotiation

A new optional capability, `tools.manifest`, signals support for both new methods:

```typescript
interface ServerCapabilities {
  tools?: {
    listChanged?: boolean;
    manifest?: boolean;
  };
}
```

- `manifest: true`: the server implements `tools/manifest` and `tools/describe` as specified below.
- Absent or `false`: the server supports only `tools/list`. Clients MUST NOT issue `tools/manifest` or `tools/describe` requests.

The two methods are always advertised together. A manifest without a way to fetch the definitions it indexes is not useful, and a describe method without a manifest gives a client no way to learn what is describable or whether its cache is current.

### 2. `tools/manifest` Method

`tools/manifest` returns a paginated list of `ToolManifestEntry` records, one per tool the session is authorised to see. Each record identifies a tool and carries a digest of its full definition, but not the definition itself.

The criterion for what belongs in an entry is deliberate and narrow: an entry carries what a client needs to decide whether to fetch a definition and to tell whether a cached one is current, and nothing a client needs in order to use the tool. This is the opposite of the choice made for skills in SEP-2640, whose listing entries are complete because a skill's metadata is small and its content is fetched lazily by design. For tools, the definition is the payload, so the entry excludes it.

#### Request

```typescript
interface ListToolManifestRequest extends PaginatedRequest {
  method: "tools/manifest";
  params?: {
    /** Pagination cursor from a prior response. */
    cursor?: string;
  };
}
```

#### Response

```typescript
interface ListToolManifestResult extends PaginatedResult, CacheableResult {
  entries: ToolManifestEntry[];
  nextCursor?: string;
}

interface ToolManifestEntry extends BaseMetadata {
  /** Unique tool identifier; the same value used by tools/call and tools/describe. */
  name: string;

  /** Optional human-readable title, identical to the `title` on the full Tool. */
  title?: string;

  /**
   * REQUIRED. Digest of the full Tool definition that tools/describe would
   * return for this name, in the form "<algorithm>:<lowercase hex>".
   * This SEP defines "sha256". See §5 for the canonical serialization
   * and for how clients use the digest to reconcile a cache.
   */
  digest: string;

  /**
   * REQUIRED. Length in bytes of the canonical serialization of the
   * full Tool definition, the same bytes the digest covers. Lets a
   * client budget a tools/describe batch before issuing it.
   */
  size: number;

  /**
   * Optional. The tool's annotations, identical to (or a key-subset of)
   * the `annotations` on the full Tool. Servers SHOULD include the
   * action-risk hints so a client can rank candidates by risk before
   * fetching any definition.
   */
  annotations?: ToolAnnotations;
}
```

`ListToolManifestResult` extends `CacheableResult` so that a server MAY attach the `ttlMs` and `cacheScope` fields defined by SEP-2549. The TTL bounds how long a client may treat the manifest as fresh; the per-entry digest tells the client which definitions it must refetch once it does refresh. The two mechanisms are complementary and are discussed in §5.

#### Action risk in the manifest

A common reason a client inspects a tool is to decide whether it is safe or appropriate to call. To keep that decision cheap, servers SHOULD populate the action-risk hints already defined on `ToolAnnotations` (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) in the manifest entry rather than deferring them to `tools/describe`. These fields are small, stable, and do not depend on the invocation schema.

The `annotations` object in a `ToolManifestEntry` MUST be equal to the `annotations` object of the corresponding `Tool`, or a subset of its keys. A server MUST NOT report an annotation value in the manifest that differs from the value on the full `Tool`. Because `annotations` is part of the `Tool` object, any change to it changes the digest.

Richer risk signals, such as a required authorisation scope or whether a call needs prior approval, are not part of `ToolAnnotations` today. Defining them is out of scope for this SEP. If they are standardised elsewhere they will flow into the manifest through the same `annotations` field without changing the structure here.

#### Server Behaviour

1. The server MUST return an entry for every tool the current session is authorised to see, paginated via `cursor`. The set of names returned across all pages MUST be identical to the set `tools/list` would return for the same session at the same time.
2. The server MUST NOT include `inputSchema`, `outputSchema`, `description`, `icons`, `_meta`, or any field other than those defined on `ToolManifestEntry`. Clients rely on this to bound the per-entry cost.
3. Each entry's `digest` MUST equal the digest, computed per §5, of the `Tool` that `tools/describe` would return for that name at the same time, and each entry's `size` MUST equal the byte length of the canonical serialization that digest was computed over.
4. The server MUST emit `notifications/tools/list_changed` when the set of names changes or when any digest changes, if it advertises `listChanged`. The notification carries no detail; the manifest is how a client learns what changed.

### 3. `tools/describe` Method

`tools/describe` returns the full `Tool` definitions for one or more named tools.

#### Request

```typescript
interface DescribeToolsRequest {
  method: "tools/describe";
  params: {
    /**
     * REQUIRED. One or more tool names taken from tools/manifest (or
     * tools/list). Servers MUST accept at least one name per request
     * and MAY impose an implementation-defined upper bound on the
     * number of names. See "Batch bound" below.
     */
    names: string[];
  };
}
```

#### Response

```typescript
interface DescribeToolsResult {
  /** Full Tool definitions, in the same order as the requested names. */
  tools: Tool[];
}
```

#### Server Behaviour

1. The order of `tools` in the response MUST match the order of `names` in the request, so clients can pair results positionally.
2. Each returned `Tool` MUST be the same object, field for field, that `tools/list` would return for that name at the same time. This is what makes the manifest digest meaningful.
3. If one or more requested names are not present in the set of tools the session is authorised to see, the server MUST return a single JSON-RPC error with code `-32602` (Invalid params). The error's `data` MUST include an `unknownNames` array listing every offending name. Partial success responses are not permitted; a client that wants the describable subset removes the listed names and retries.
4. If `names` is empty, the server MUST return `-32602` with `data.reason` set to `"empty"`.

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "error": {
    "code": -32602,
    "message": "Unknown tool names",
    "data": {
      "unknownNames": ["projects_archive", "okr_delete"]
    }
  }
}
```

This follows SEP-2164, which settled on `-32602` with a descriptive `data` object for "the client named something that does not exist" and retired the implementation-defined `-32002` code. An unknown tool name is semantically an invalid parameter in the same sense as an unknown resource URI.

#### Batch bound

Servers MAY bound the number of names accepted in one request. A server that receives more names than it accepts MUST return `-32602` with `data.maxNames` set to its bound, and MUST NOT process a prefix of the request. Servers SHOULD accept at least 50 names, which covers the reconciliation case where a client refetches every entry whose digest changed after a typical catalog update. Clients receiving `data.maxNames` SHOULD split the request and retry.

### 4. Relationship to `tools/list`

`tools/list` is unchanged. Servers advertising `tools.manifest` MUST continue to support `tools/list`.

The relationship between the three methods is the relationship between a manifest and the content it indexes:

- **The manifest and `tools/list` index the same set.** For a given session at a given time, the set of names returned by `tools/manifest` MUST equal the set returned by `tools/list`. They differ only in per-entry shape: `ToolManifestEntry` versus `Tool`.
- **`tools/describe` resolves every name in the manifest.** Every name in the manifest MUST be describable, and describing it MUST return the `Tool` whose digest the manifest reported. Names outside the manifest MUST be rejected as unknown (§3).
- **The digest is the join key.** A client holding a cached `Tool` compares the digest it computed over that object with the digest in the current manifest. Equal means current; different means refetch through `tools/describe`.

Clients MAY rely on these relationships. In particular, a client that has synchronised once via the manifest and `tools/describe` holds exactly what `tools/list` would have given it, and MAY treat the two paths as interchangeable for every subsequent use, including `tools/call`.

A server-side polyfill that derives `tools/manifest` and `tools/describe` from an existing `tools/list` handler is trivial and is provided in the reference implementation. SDK authors can therefore light up the capability for any server that already implements `tools/list` with no application-code changes, at the cost of computing digests over definitions the application already holds.

Clients SHOULD prefer `tools/manifest` and `tools/describe` over `tools/list` whenever the server advertises the capability and the client maintains a cache across sessions or expects the catalog to change. A client that will use every definition immediately and has no cache gains nothing from the manifest and SHOULD use `tools/list`.

### 5. The Digest

#### Format

A digest is a string of the form `<algorithm>:<encoded value>`. This SEP defines one algorithm, `sha256`, whose encoded value is the lowercase hexadecimal SHA-256 of the canonical JSON serialization of the full `Tool` object. Servers MUST emit `sha256` digests. Clients MUST treat a digest with an algorithm they do not recognise as "unknown", which for reconciliation purposes means "refetch".

The algorithm prefix follows the convention used by container image registries and lets a future SEP introduce another algorithm without changing the field's shape. It is the same format SEP-2640 uses for skill file digests, so a host that implements both extensions handles one digest shape.

The `size` field alongside the digest is the byte length of the canonical serialization, the same bytes the digest covers. It exists so a client can sum the sizes of the entries it intends to describe and split the batch, or defer part of it, before issuing the request. A client MAY also use it as a cheap pre-check: a definition whose canonical serialization has a different length than the manifest's `size` cannot match the digest, and need not be hashed to be known stale. SEP-2640 applies the same pairing of digest and size to skill files for the same two reasons.

#### Canonical serialization

The canonical JSON serialization of a `Tool` is defined as:

1. Object keys are sorted lexicographically by Unicode code point.
2. No insignificant whitespace.
3. Strings are serialised with the JSON escaping rules in RFC 8259, using the shortest valid escape for each character.
4. Numbers are serialised in their shortest round-trip form per ECMA-404.

This matches RFC 8785 (JSON Canonicalization Scheme) section 3.2 and is implementable in a few dozen lines in any language. A reference implementation in TypeScript is included with the prototype.

#### What the digest covers

The digest is computed over the entire `Tool` object exactly as `tools/describe` returns it: `name`, `title`, `description`, `inputSchema`, `outputSchema`, `annotations`, `icons`, and `_meta`. Nothing on the `Tool` is excluded. The rule is simple to state and simple to test: if `tools/describe` would return a different object, the digest is different.

Servers whose `_meta` carries values that change on every request, such as a timestamp, will see the digest change on every request and will defeat the purpose of the manifest. Such servers SHOULD move volatile values out of the `Tool` definition; the definition is a contract, not a status report.

The `digest` field itself is not part of the `Tool` and is not covered.

#### Reconciliation

The protocol does not prescribe a cache strategy. It provides the digest so that a client which chooses to cache definitions has a per-tool freshness key. The expected use, which the reference implementation demonstrates, is:

1. Fetch the manifest (all pages).
2. For each entry, compare its digest with the digest the client computed over its cached `Tool` for that name. Collect the names with no cached entry or a different digest.
3. Drop cached entries whose names are no longer in the manifest.
4. Fetch the collected names via `tools/describe`, in batches no larger than the server's bound, using the entries' `size` values to keep each batch to a response the client is prepared to handle.
5. Recompute the digest over each returned `Tool` and confirm it matches the manifest. A mismatch indicates the definition changed between steps 1 and 4; repeat from step 1.

At a cold start, step 4 fetches everything. Afterwards it fetches only what changed.

#### Interaction with `notifications/tools/list_changed` and with SEP-2549

`notifications/tools/list_changed` tells a client that it should re-run reconciliation. The SEP-2549 `ttlMs` on the manifest result tells a client how long it may skip reconciliation in the absence of a notification. The digest tells the client what to fetch once it reconciles. None of the three replaces another: the notification and the TTL decide when, the digest decides what.

### 6. Relationship to Other SEPs and Groups

- **SEP-2640 (Skills Extension)**: Precedent. That extension's `skills/list` returns entries carrying `sha256:` digests and byte sizes for content fetched lazily by URI, reuses the SEP-2549 cache fields on the listing with the same freshness-not-integrity framing, uses `-32602` for unknown items, and states that a digest match proves consistency between listing and content rather than trustworthiness. This SEP applies the same shape to tool definitions and adopts the same digest format, cache fields, error code, and security framing so that a host implementing both handles one pattern. The two differ in entry completeness for the reason given in §2, and in that `tools/describe` is batched where `skills/get` retrieves one item.
- **SEP-2549 (TTL for List Results)**: Complementary, as described in §5. `ListToolManifestResult` reuses the `CacheableResult` fields directly.
- **SEP-2164 (Resource Not Found Error)**: Followed. `tools/describe` uses `-32602` with a `data` object for unknown names, matching the convention that SEP established for resources.
- **SEP-1821 (Dynamic Tool Discovery)**: Orthogonal. That proposal adds server-side search to `tools/list`. This SEP deliberately carries no query surface; a server that implements both would apply the same authorisation filtering to all three listing methods, and a client would use SEP-1821 to find candidates and this SEP to keep their definitions current.
- **SEP-1862 (Tool Resolution)**: Orthogonal. `tools/resolve` operates on the full `Tool` returned by `tools/describe` or `tools/list`.
- **SEP-1881 (Scope-Filtered Tool Discovery)**: Orthogonal. Scope filtering determines the set of tools a session may see; that set is what the manifest lists.
- **SEP-2564 (Server-Side Filtering for List Methods)**: Compatible. A `filter` parameter could be added to `tools/manifest` by that SEP without disturbing the structure here.
- **Primitive Grouping Interest Group**: This SEP is designed as the substrate for that group's work rather than a competitor to it. Discovery metadata such as short summaries, tags, and group membership was removed from earlier drafts of this SEP specifically so that it can be defined as an extension that layers additional fields onto `ToolManifestEntry`. The manifest gives such an extension a cheap listing surface and a per-tool change signal; the extension supplies the domain structure.
- **Issue #2470 (Capability-Aware Tool Presentation)**: Not addressed here. Tier-aware descriptions are discovery metadata and belong with the grouping work above.

#### Extension points

This SEP is intended to be extended, and two extension points are defined so that extensions compose with it predictably.

**Additional fields on the manifest entry.** An extension MAY define additional optional fields on `ToolManifestEntry`, such as a short summary, tags, or group membership. Clients MUST ignore entry fields they do not recognise. An extension MUST NOT change the meaning of `name`, `digest`, or `annotations`, and MUST NOT make any of its own fields required, since a client that does not implement the extension must still be able to reconcile from the base entry alone. Fields that exist only on the entry are not covered by the digest; an extension that adds them is responsible for its own change signal if one is needed.

**Metadata in the tool's `_meta` object.** The digest covers the entire `Tool`, including `_meta`. An extension that stores its per-tool metadata under a namespaced key in `_meta`, rather than only on the manifest entry, therefore gets change detection without defining anything new: when the metadata changes, the digest changes, and a reconciling client refetches the definition. This is the RECOMMENDED placement for metadata that a client caches and acts on, such as group membership or a tier-aware description. The manifest entry is the RECOMMENDED placement for a projection of that metadata that a client needs before deciding whether to fetch the definition at all.

An extension MAY use both: the authoritative value in `_meta`, covered by the digest, and a copy on the entry for cheap listing. Where it does, the copy on the entry MUST equal the value in `_meta` for the same tool at the same time, following the same rule this SEP applies to `annotations`.

## Rationale

### Why a separate method rather than a parameter on `tools/list`?

A `compact` parameter on `tools/list` would return entries without an `inputSchema`. `ListToolsResult` declares its entries as `Tool`, and `Tool` requires `inputSchema`. Honouring the parameter therefore means either making `inputSchema` optional on `Tool`, which weakens the core type for every consumer that reads it, or turning `ListToolsResult.tools` into a union type, which changes a type every SDK already exposes. A new method adds a new result type and leaves the existing contract untouched.

A second reason is failure mode. A server that predates this SEP ignores unknown parameters and returns the full list; the client discovers this only by noticing the schemas are present. The same server receiving `tools/manifest` returns method-not-found, which is unambiguous. The capability flag reduces the risk either way, but the method's failure is cleaner.

The protocol's own precedent points the same way: resource templates got their own list method rather than a flag on `resources/list`, because the entry shape differs.

### Why a per-tool digest rather than the existing notification or the SEP-2549 TTL?

The notification says something changed. The TTL says how long to trust a whole result. Neither identifies which entries changed, so a client that has cached a thousand definitions must refetch a thousand definitions on any change. A per-tool digest turns invalidation into a set difference: fetch the entries whose digest differs, drop the entries whose names are gone. That is the whole gain of this SEP, and it cannot be obtained without a value the server computes over its own copy of each definition.

### Why is the digest computed over the whole `Tool`?

Earlier drafts excluded manifest-only fields such as a summary from the hash, creating two change domains. With discovery metadata removed from the manifest entry, every field the entry carries is also on the `Tool`, and the two-domain model collapses. Covering the whole object gives one rule with no exceptions: if `tools/describe` would return something different, the digest is different.

### Why an algorithm prefix on the digest?

A bare hex string commits the protocol to SHA-256 forever, or forces a new field when the algorithm changes. The `sha256:` prefix costs seven bytes per entry and makes the field self-describing. It is the convention used by container registries for exactly this purpose, and it is familiar to most implementers.

### Why batched `tools/describe`?

Reconciliation after a catalog change typically identifies a handful of changed entries; cold start identifies all of them. A single round trip per batch is materially better than one round trip per tool over any transport, and the ordering guarantee makes positional pairing trivial. The batch bound lets servers protect themselves without forcing clients to guess.

### Why "manifest"?

Earlier drafts called the compact listing a catalog and the SEP "progressive tool disclosure". Both names invited comparison with client-side progressive discovery and native provider tool search, which solve a different problem and which this SEP does not compete with. "Manifest" names the actual mechanism: an index of entries by identity with a content digest, from which the full content is fetched separately. That is how package lockfiles and container image manifests work, and readers who know those systems understand this SEP's shape at once.

### Why leave discovery metadata out?

Short summaries, tags, groups, and tier-aware descriptions are all useful and all belong to the same design space, which the Primitive Grouping Interest Group is working through with several implementations in hand. Defining a subset of that metadata here would either pre-empt that work or produce two overlapping definitions. Keeping the manifest entry to identity, digest, and the existing annotations gives the grouping work a stable base to extend and keeps this SEP small enough to evaluate on its own.

### Precedent in SEP-2640

The pattern this SEP proposes is not new to the protocol. SEP-2640, the Skills Extension, was accepted with a listing whose entries carry per-file digests and sizes, a single-item retrieval method used to refresh one entry after a digest mismatch without re-enumerating the catalog, the SEP-2549 cache fields on the listing, and host guidance to fetch lazily, cache what is fetched, and validate the cache by digest. Its rationale for a complete listing entry, that a host connecting to many servers should not pay a second round trip per skill, is the mirror image of this SEP's rationale for an incomplete one: for tools the second round trip is the point, because the definition it fetches is what a wholesale listing would otherwise force on every client. Where the two designs can align without cost, on digest format, size, cache fields, error code, and the security status of a digest, this SEP aligns with SEP-2640 deliberately.

### Prior art

Progressive loading of tool definitions on the model side is well established. The Anthropic tool search tool and the OpenAI Responses API tool search both defer loading a definition into context until the model selects it, and the MCP client best-practices guide documents the same pattern for hosts that implement it themselves. [MCP-Zero](https://arxiv.org/abs/2506.01056) frames active tool discovery as an agent capability rather than a prompt-construction step. Section 12 of [arXiv 2602.18764](https://arxiv.org/html/2602.18764v2#S12) surveys progressive disclosure approaches across agent frameworks.

All of this work assumes the host already holds the definitions. None of it addresses how the host obtains them from a server or learns which have changed. That is the gap this SEP occupies, and it is why the SEP is careful not to claim the model-side benefits that the prior art already delivers.

### Alternatives considered

1. **A `fields` projection parameter on `tools/list`**, in the style of GraphQL field selection. Rejected: it has the same type-contract problem as a `compact` flag, and pushes generality into every client and server for a use case with exactly two practical projections.
2. **Inverting the surfaces**, so that `tools/list` returns the compact form and a new method returns full definitions. Rejected: redefining what `tools/list` returns is a silent break for every existing client. They would receive a structurally valid response with the schemas they need absent.
3. **Putting a digest on `Tool` inside `tools/list`** with no compact listing. Rejected as insufficient: a client still has to fetch every full definition to read the digests, so cold start and reconciliation cost the same as today. The digest only helps when it can be read without the definition.
4. **A whole-catalog ETag** in the style of HTTP conditional requests. Rejected as too coarse: it tells a client that something changed, which the existing notification already does, without telling it what.
5. **Embedding the manifest in `InitializeResult`**. Rejected: manifests change, and `initialize` is the wrong place to gate the connection on a potentially large enumeration.
6. **A custom `-32002` error for unknown names**, as in earlier drafts. Rejected after SEP-2164 retired that code for resources and established `-32602` with a `data` object as the convention. Diverging from it for tools would be inconsistent for no benefit.

## Backward Compatibility

This SEP is fully backward-compatible.

- Servers that do not advertise `tools.manifest` are unaffected. Clients MUST NOT issue `tools/manifest` or `tools/describe` against such servers.
- Clients that do not implement this SEP continue to use `tools/list` and observe no change in behaviour.
- Servers that advertise the capability MUST also continue to support `tools/list`, so older clients keep working unchanged.
- The polyfill described under Reference Implementation lets SDK authors enable the capability for any server that already implements `tools/list`, with no application-code changes.

There are no breaking changes to existing types. `ServerCapabilities.tools` gains one optional boolean. `Tool` and `ToolAnnotations` are not modified. `ToolManifestEntry`, `ListToolManifestRequest`, `ListToolManifestResult`, `DescribeToolsRequest`, and `DescribeToolsResult` are new.

## Security Implications

- **The digest does not leak definition contents.** SHA-256 is a one-way function. The digest discloses only whether two definitions are identical, which any authorised client can already observe via `tools/describe`.
- **The digest is not an integrity guarantee.** It is computed by the server and transmitted over the same channel as the definitions. A client MUST NOT treat a matching digest as evidence that a definition is authentic or unmodified in transit; that is the transport's job. The digest is a freshness key, nothing more.
- **Scope filtering MUST apply uniformly.** When a server applies authorisation filtering, per SEP-1881 or any pre-existing mechanism, it MUST apply the same rules to `tools/list`, `tools/manifest`, and `tools/describe`. A tool hidden from `tools/list` MUST be absent from the manifest, and `tools/describe` MUST treat its name as unknown. Failure to maintain this invariant is an authorisation bypass.
- **Unknown-name handling MUST NOT distinguish missing from unauthorised.** `tools/describe` returns the same `-32602` error with the same `data.unknownNames` shape whether a name does not exist or exists but is filtered for the current session. A distinct response for the two cases would let a client enumerate tools it cannot see.
- **The batch bound is a resource control.** Servers SHOULD set it low enough that a single `tools/describe` cannot be used to force serialization of an entire large catalog in one response.

No new authentication, authorisation, or transport surface is introduced. The `query` parameter present in earlier drafts, and the untrusted-input concerns that came with it, are gone.

## Reference Implementation

A reference prototype exists as a self-contained workspace package on a branch of the TypeScript SDK fork:

**Branch**: [`SylonZero/typescript-sdk@sep/progressive-tool-disclosure`](https://github.com/SylonZero/typescript-sdk/tree/sep/progressive-tool-disclosure/examples/progressive-disclosure)

The prototype predates the current revision of this SEP. It implements the same two-method shape and the same canonical-JSON digest under the earlier names (`tools/catalog`, `schemaHash`, `tools.progressiveDisclosure`), and it also implements the `query`, `summary`, and `tags` surfaces that this revision removed. It is being updated to match this revision; the items marked _pending_ below are the parts that update will change.

### What is included

- **`src/types.ts`**: wire-format types for the manifest entry, request and response shapes, capability, and the unknown-names error. _Pending_: rename to the identifiers in this revision, drop `query`, `summary`, and `tags`, switch the error to `-32602`.
- **`src/canonicalJson.ts`**: RFC 8785 subset sufficient for stable `Tool` digests. Unchanged by this revision.
- **`src/schemaHash.ts`**: SHA-256 over the canonical serialization. _Pending_: emit the `sha256:` prefix and cover `icons` and `_meta`.
- **`src/server.ts`**: polyfill deriving the manifest and describe methods from any existing tool list, with configurable page size and batch bound. _Pending_: remove the summary, tag, and query derivation.
- **`src/client.ts`**: manifest fetch, batched describe, and a cache implementing the reconciliation steps in §5. Unchanged in shape.
- **`src/demo.ts`**: in-process end-to-end lifecycle showing cold start, warm hit, and reconciliation after a change.
- **`bench/`**: _Pending_: replaced by the wire-cost benchmark described under Performance Implications.
- **`tests/`**: 35 vitest tests across canonical JSON, digest stability, polyfill behaviour, and cache reconciliation. _Pending_: update for the renamed identifiers and the removed surfaces; add the tests listed under Testing Plan.

### What the prototype does not do

- Network transport. Server and client run in-process; wiring stdio or Streamable HTTP is mechanical.
- Integration with the SDK's request-handler registry. Deferred until the SEP is accepted, per the SDK's contribution rules for spec-touching changes.
- Any grouping or discovery-metadata extension. That is the Primitive Grouping Interest Group's work.

## Performance Implications

The claims of this SEP are about bytes on the wire and definitions transferred, not about model context. The benchmark measures a synthetic server of 1,000 tools whose definitions are modelled on a real product surface, with a mix of small and schema-heavy tools, and reports the following. Values marked TBD will be filled in when the updated benchmark is run.

| Scenario                                               | Round trips | Definitions transferred | Bytes transferred | Bytes vs `tools/list` |
| ------------------------------------------------------ | ----------: | ----------------------: | ----------------: | --------------------: |
| Cold start via `tools/list`                            |         TBD |                   1,000 |               TBD |                     — |
| Cold start via manifest + describe (all)               |         TBD |                   1,000 |               TBD |                   TBD |
| Warm cache, no change, via `tools/list`                |         TBD |                   1,000 |               TBD |                     — |
| Warm cache, no change, via manifest                    |         TBD |                       0 |               TBD |                   TBD |
| Warm cache, 1 tool changed, via `tools/list`           |         TBD |                   1,000 |               TBD |                     — |
| Warm cache, 1 tool changed, via manifest + describe    |         TBD |                       1 |               TBD |                   TBD |
| Warm cache, 10 tools changed, via manifest + describe  |         TBD |                      10 |               TBD |                   TBD |
| Warm cache, 100 tools changed, via manifest + describe |         TBD |                     100 |               TBD |                   TBD |

The shape of the result is what matters. At cold start the manifest path transfers every definition plus the manifest itself, so it costs slightly more than `tools/list` in bytes and more in round trips; this is the price of the digests. On every subsequent synchronisation the manifest path transfers the manifest plus only the changed definitions, while `tools/list` transfers everything again. The break-even point is the second synchronisation, and the gain grows with catalog size and with the fraction of the catalog that is unchanged, which for real catalogs is nearly all of it.

Two costs are worth stating plainly:

- **Digest computation on the server.** Canonical serialization plus SHA-256 over each definition. For a polyfill this is done once per definition and cached; it is not per-request work unless definitions change.
- **An additional round trip on cold start.** The manifest must be fetched before `tools/describe` can be issued. For a client that has no cache and will use every definition immediately, `tools/list` remains the better choice, and §4 says so.

## Testing Plan

The prototype's existing tests cover canonical serialization, digest stability under key reordering, change detection on schema and annotation mutation, pagination, batch bounds, unknown-name rejection, and cache reconciliation including eviction of removed names. The following are added or changed for this revision:

1. **Digest format and size.** Every digest has the `sha256:` prefix and a lowercase 64-character hex value, and every `size` equals the byte length of the canonical serialization the digest was computed over.
2. **Digest coverage.** Mutating any field of a `Tool`, including `icons` and `_meta`, changes the digest; the digest is unaffected by key order at any depth.
3. **Set equality.** For a fixed session, the set of names from `tools/manifest` (all pages) equals the set from `tools/list`.
4. **Describe consistency.** For every name in the manifest, `tools/describe` returns a `Tool` whose computed digest equals the manifest's digest.
5. **Error shape.** Unknown names produce `-32602` with `data.unknownNames` listing every unknown name and no others; an empty `names` array produces `-32602` with `data.reason` of `"empty"`; exceeding the batch bound produces `-32602` with `data.maxNames` and no partial result.
6. **Authorisation invariant.** With scope filtering applied, a tool hidden from `tools/list` is absent from the manifest and is reported as unknown by `tools/describe`, with a response indistinguishable from that for a non-existent name.
7. **Reconciliation race.** If a definition changes between the manifest fetch and the describe fetch, the client detects the digest mismatch and reconciles again.
8. **Wire-cost benchmark.** The scenarios in the Performance Implications table are produced by a script that can be re-run by reviewers.

Wire-format conformance against an SDK-integrated implementation, and the conformance test required before Final status, are deferred to the SDK work that follows acceptance.

## Open Questions

1. **Manifest-level digest.** A single digest over the whole manifest would let a client confirm "nothing changed" with one comparison instead of one per entry. It interacts awkwardly with pagination, since the value would have to be stable across pages. Deferred; input welcome.
2. **Icons in the manifest entry.** A tool-picker UI would want icons without fetching definitions. They are excluded to keep the entry minimal. Whether they belong in the core entry or in a display-oriented extension is open.
3. **Minimum batch bound.** The SHOULD of 50 names is a judgement. Implementers with large catalogs may have better data.
4. **Method name for retrieval.** SEP-2640 named its single-item retrieval method `skills/get`. `tools/describe` is batched, which is a reason the names may legitimately differ, but `tools/get` would align with the precedent. Input welcome.
5. **Shape of the grouping extension.** Whether the Primitive Grouping Interest Group's work lands as additional optional fields on `ToolManifestEntry`, as a separate method, or both, is that group's decision. This SEP only commits to keeping the entry extensible.

## Acknowledgments

This revision owes its shape to the people who pushed back on the first one. Peder H P and Casey Chow made the case, on the community Discord, that context-token savings belong to the harness and that a SEP must show where client and server need to coordinate; that argument is now the spine of the Motivation. Andreas Schlapbach pointed to the prior art. On the pull request, modood-alvi asked for the set relationships in §4 to be stated explicitly, blah-mad argued for action-risk hints in the compact entry, and FreeOnePlus contributed independent evidence from a production server and the observation that discovered tools lose their native identity behind private wrapper layers. olaservo connected this work to the Primitive Grouping Interest Group.

The original framing stood on the work of Egor Orlov ([SEP-1821](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1821)) and Nick Cooper ([SEP-1862](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1862)), and on the Yantrikos team's data in [Issue #2470](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/2470).
