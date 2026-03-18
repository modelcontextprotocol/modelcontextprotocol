# SEP-0000: Standardize `cache_hint` as a Well-Known Key in `CallToolResult._meta`

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-03-18
- **Author(s)**: Hugues Clouatre (@clouatre)
- **Sponsor**: None (seeking sponsor)
- **Issue**: https://github.com/modelcontextprotocol/modelcontextprotocol/issues/2400
- **PR**: (assigned on open)

## Abstract

This SEP standardizes `cache_hint` as a well-known key in `CallToolResult._meta`, with values
`"no-cache"` and `"cache"`. The key allows a server to advise MCP clients whether to cache or
skip caching a particular tool result. This follows the existing hint-style, non-mandatory
pattern established by `progressToken` and the well-known `_meta` key pattern established by
SEP-1686 and SEP-414. No schema interface changes are required; the key is declared in
specification prose and is backward-compatible.

## Motivation

MCP clients may apply caching to tool results -- for example, LLM-backed clients that support
prompt caching may insert tool results into their cache to reduce token costs on repeated calls.
For stateless, read-only, deterministic tools, this is beneficial in long-running sessions where
the same result may be requested multiple times.

However, for single-pass sessions (subagents, benchmarks, one-shot pipelines), the cache entry
is written once and never read again: a net token cost with zero benefit. Today, the server has
no mechanism to advise the client against caching its results. The only available workaround
(`DISABLE_PROMPT_CACHING=1` in Claude Code, for example) is a global opt-out that disables
caching for the entire session, not a per-result signal.

This gap is documented in an open upstream request (anthropics/claude-code#34334) asking that
Claude Code honor a per-result `_meta.cache_hint: "no-cache"` signal.

The MCP spec states:

> "The `_meta` property/parameter is reserved by MCP to allow clients and servers to attach
> additional metadata to their interactions. Additionally, definitions in the schema may reserve
> particular names for purpose-specific metadata, as declared in those definitions."

`cache_hint` is exactly this: a purpose-specific name declared for `CallToolResult._meta`.

The need generalizes beyond a single client. Any MCP client that applies caching at the tool
result level faces the same mismatch. Standardizing the key in the MCP specification enables
interoperability across clients without requiring bilateral coordination between server and client
authors.

## Specification

### Well-Known Key

The key `cache_hint` is a well-known key in `CallToolResult._meta`. Its value is a string. The
following values are defined:

| Value | Meaning |
|---|---|
| `"no-cache"` | The server advises the client not to cache this result. |
| `"cache"` | The server advises the client that this result is safe to cache. |

If `cache_hint` is absent, no caching preference is expressed. Clients MAY apply their default
caching policy.

### Semantics

`cache_hint` is a hint. The receiver is not obligated to honor it. This matches the precedent
established by `progressToken` (spec: "The receiver is not obligated to provide these
notifications").

A server SHOULD set `cache_hint: "no-cache"` on results that are expensive to cache without
benefit -- for example, large read-only results returned in single-pass contexts where the cache
entry will never be read again.

A server MAY set `cache_hint: "cache"` to affirmatively signal that a result is safe to cache,
useful when the client's default policy would otherwise skip caching.

### Schema

No TypeScript schema interface change is required. The key is declared in specification prose
under the `CallToolResult` definition. For reference, the existing definition is:

```typescript
interface CallToolResult {
  _meta?: { [key: string]: unknown };
  content: ContentBlock[];
  isError?: boolean;
  structuredContent?: { [key: string]: unknown };
}
```

The `cache_hint` key is a well-known name within the open `_meta` map. Implementations that
do not recognize `cache_hint` ignore it, as the index signature requires.

### Non-Normative Example

A server returning a large file tree result in a single-pass context:

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "result": {
    "content": [
      { "type": "text", "text": "..." }
    ],
    "isError": false,
    "_meta": {
      "cache_hint": "no-cache"
    }
  }
}
```

A client receiving this result SHOULD skip inserting it into its cache, if it has the capability
to do so at the per-result level.

## Rationale

### Why `cache_hint` and not `io.modelcontextprotocol/cache_hint`?

The DNS-prefix convention for `_meta` keys (proposed in #1788) applies to keys reserved by the
MCP project. SEP-414 establishes a precedent for plain names as an exception when compatibility
or simplicity requires it (`traceparent`, `tracestate`, `baggage`). `progressToken` is the only
existing plain-name key in the spec and is already in `_meta`.

`cache_hint` is proposed as a plain name for two reasons:

1. The draft `MetaObject` (from #1788) explicitly places bare keys in the free-use zone. Adopting
   the prefix now, before #1788 is settled, would lock in a naming decision that #1788 may revise.
2. A plain name is simpler to set, read, and document. The HTTP ecosystem uses `Cache-Control`
   (plain) rather than a namespaced equivalent.

If #1788 is eventually adopted and the community prefers a prefixed name, the transition
(`cache_hint` -> `io.modelcontextprotocol/cache_hint`) is non-breaking: both names can coexist
during a deprecation window, as the schema allows arbitrary keys.

### Why values `"no-cache"` and `"cache"` and not a boolean?

HTTP `Cache-Control` semantics are widely understood by protocol designers. A string enum is
extensible -- future values (e.g., `"immutable"`) can be added without a breaking change. A
boolean (`cache: true/false`) cannot be extended.

### Why on `CallToolResult` and not on the tool definition?

Tool-definition annotations (`read_only_hint`, `destructive_hint`, etc.) are static -- they
describe the tool's general behavior, not the characteristics of a specific result. A tool may
return cacheable results in some invocations and non-cacheable results in others (e.g., depending
on the size of the output or the session context). Placing `cache_hint` on the result enables
per-result control.

### Alternatives Considered

**A new `cache_control` field on `CallToolResult`**: Adds schema surface and a required schema
version bump. The `_meta` mechanism is already present and designed for this use case.

**Client-side heuristics only**: Clients could infer cacheability from result size or tool
annotations. This is less precise and requires bilateral convention rather than an explicit
signal.

**A new capability or negotiation step**: Unnecessarily complex for a hint that has no effect
if ignored.

## Backward Compatibility

This SEP introduces no breaking changes.

Existing clients that do not recognize `cache_hint` continue to operate correctly. The open
index signature on `_meta` requires implementations to tolerate unknown keys.

Existing servers that do not set `cache_hint` are unaffected. Clients apply their existing
default caching policy when the key is absent.

## Security Implications

`cache_hint` is a server-to-client hint with no enforcement requirement. A malicious server
setting `cache_hint: "cache"` on a mutable or sensitive result cannot force a client to cache
it; a malicious server setting `cache_hint: "no-cache"` cannot prevent a client from caching.

Clients that choose to honor `cache_hint` should apply the same validation they apply to any
`_meta` value: verify the key is a known string, ignore unrecognized values, and do not
propagate the key to the model or to downstream systems.

No authentication, authorization, or data-validation changes are required.

## Reference Implementation

https://github.com/clouatre-labs/code-analyze-mcp (Apache-2.0)

All four tool success paths (`analyze_directory`, `analyze_file`, `analyze_symbol`,
`analyze_module`) set `_meta: { "cache_hint": "no-cache" }` on every `CallToolResult` via a
shared helper:

```rust
fn no_cache_meta() -> Meta {
    let mut m = serde_json::Map::new();
    m.insert(
        "cache_hint".to_string(),
        serde_json::Value::String("no-cache".to_string()),
    );
    Meta(m)
}
```

An integration test (`tests/integration_tests.rs`,
`test_call_tool_result_cache_hint_metadata`) validates round-trip serialization:
`_meta.cache_hint == "no-cache"` in the JSON output.

The implementation uses rmcp 1.2.0. The `CallToolResult::with_meta(Some(Meta(map)))` API
serializes arbitrary key-value pairs into `_meta` without schema changes.

This satisfies the SEP "prototype implementation" requirement for Accepted status. Full SDK
implementations (TypeScript, Python, Java, C#, Go, Kotlin) are required for Final status and
will be tracked in the PR thread.
