# SEP-2342: Memory Interchange Format (MIF)

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-03-03
- **Author(s)**: Varun Sharma <29.varuns@gmail.com> (@varun29ankuS)
- **Sponsor**: None
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2342

## Abstract

This SEP proposes a vendor-neutral JSON schema for exchanging AI agent memories between MCP servers. As multiple memory implementations emerge in the MCP ecosystem — each with different storage formats — there is no way to move memories between systems. MIF defines a minimal, extensible schema for memories and optional knowledge graph data, enabling portability across providers.

## Motivation

Memory is becoming a standard MCP server capability. Multiple implementations exist: some store memories as plain text with timestamps, others as JSON objects with metadata, others as markdown with YAML frontmatter. Each representation captures useful information, but none can interoperate.

This creates a practical problem for users:

- A team evaluating memory providers cannot trial System B without abandoning context built in System A
- A user switching AI clients loses months of accumulated context
- Memory servers cannot compose — a retrieval-focused server cannot import from a storage-focused server

Other domains solved this with interchange formats: vCard for contacts, iCalendar for events, OPML for feeds. MIF applies the same approach to AI agent memories.

The format is deliberately minimal. It defines the common subset that all memory systems can produce and consume, with an extension mechanism for system-specific metadata.

## Specification

### 1. Document Structure

A MIF document is a JSON object:

```json
{
  "mif_version": "2.0",
  "generator": { "name": "example-memory", "version": "1.0.0" },
  "export_meta": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "created_at": "2026-03-03T10:00:00Z",
    "user_id": "user-1",
    "checksum": "sha256:abc123...",
    "privacy": {
      "pii_detected": false,
      "redacted_fields": []
    }
  },
  "memories": [],
  "knowledge_graph": null,
  "vendor_extensions": {}
}
```

**Required:** `mif_version`, `memories`
**Optional:** Everything else. A minimal conforming document is `{"mif_version": "2.0", "memories": []}`.

### 2. Memory Object

Each entry in the `memories` array:

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "content": "User prefers dark mode across all applications",
  "memory_type": "decision",
  "created_at": "2026-01-15T10:30:00Z",
  "tags": ["preferences", "ui"],
  "entities": [
    { "name": "dark mode", "entity_type": "concept", "confidence": 1.0 }
  ],
  "metadata": {},
  "embeddings": {
    "model": "minilm-l6-v2",
    "dimensions": 384,
    "vector": [0.012, -0.034],
    "normalized": true
  },
  "source": {
    "source_type": "user",
    "session_id": "session-42",
    "agent_name": "claude-code"
  },
  "parent_id": null,
  "related_memory_ids": [],
  "agent_id": null,
  "external_id": null,
  "version": 1
}
```

**Required:** `id` (UUID v4), `content` (string), `created_at` (ISO 8601)
**Optional:** Everything else.

#### 2.1 Memory Types

Lowercase snake_case strings. Standard types:

| Type | Description |
|------|-------------|
| `observation` | Factual observation about user or environment |
| `decision` | A decision made by or for the user |
| `learning` | Something learned during interaction |
| `error` | An error and its context |
| `context` | Session or project context |
| `conversation` | Conversation excerpt or summary |

Implementations MUST accept unknown types without error and SHOULD preserve them on round-trip.

#### 2.2 Entity References

```json
{ "name": "RocksDB", "entity_type": "technology", "confidence": 0.95 }
```

Standard entity types: `person`, `organization`, `location`, `technology`, `concept`, `event`, `product`, `unknown`. Implementations MUST accept unknown types.

#### 2.3 Embeddings

Optional. When present, `model` identifies the embedding model used.

- Importers using the **same model** MAY reuse the vector directly.
- Importers using a **different model** SHOULD discard the vector and regenerate from `content`.
- Importers **without embedding capability** SHOULD ignore this field entirely.

### 3. Knowledge Graph (Optional)

For systems that maintain entity relationships:

```json
{
  "entities": [
    {
      "id": "...",
      "name": "Rust",
      "types": ["technology"],
      "attributes": { "category": "programming_language" },
      "summary": "Systems programming language",
      "created_at": "2026-01-01T00:00:00Z",
      "last_seen_at": "2026-03-01T00:00:00Z"
    }
  ],
  "relationships": [
    {
      "id": "...",
      "source_entity_id": "...",
      "target_entity_id": "...",
      "relation_type": "works_with",
      "context": "User builds projects in Rust",
      "confidence": 0.9,
      "created_at": "2026-01-15T00:00:00Z",
      "invalidated_at": null
    }
  ]
}
```

Systems without graph support SHOULD omit this field. Systems that encounter unknown fields SHOULD preserve them on round-trip.

### 4. Vendor Extensions

System-specific metadata lives in `vendor_extensions`, keyed by system name:

```json
"vendor_extensions": {
  "shodh-memory": {
    "memory_metadata": {
      "<uuid>": { "importance": 0.85, "access_count": 12, "activation": 0.73 }
    }
  },
  "mem0": {
    "organization_id": "org-123"
  }
}
```

Implementations MUST preserve vendor extensions from other systems on round-trip, even if unrecognized. This enables lossless export → import → re-export without losing system-specific data.

### 5. Privacy

The `export_meta.privacy` field communicates PII handling:

```json
{ "pii_detected": true, "redacted_fields": ["email", "phone"] }
```

When PII redaction is requested, implementations SHOULD replace detected PII with `[REDACTED:type]` markers and record types in `redacted_fields`. Recognized categories: `email`, `phone`, `ssn`, `api_key`, `credit_card`.

### 6. Import Behavior

- **UUID preservation:** Imported memories SHOULD retain original IDs when possible.
- **Deduplication:** Implementations SHOULD deduplicate by content hash (SHA-256 of `content`), not UUID collision.
- **Partial failure:** Individual memory import failures MUST NOT abort the batch. Errors SHOULD be collected and returned.
- **Unknown fields:** Importers MUST ignore unknown top-level or nested fields (forward compatibility).

Import result:

```json
{
  "memories_imported": 150,
  "entities_imported": 45,
  "edges_imported": 78,
  "duplicates_skipped": 3,
  "errors": []
}
```

### 7. MCP Tools

Memory servers implementing MIF SHOULD expose:

| Tool | Purpose |
|------|---------|
| `export_memories` | Export user memories as MIF JSON |
| `import_memories` | Import MIF JSON into the memory system |

### 8. JSON Schema

A formal JSON Schema for validation is provided as a companion file: `mif-v2.schema.json`. Implementations SHOULD validate incoming MIF documents against this schema before import.

## Concrete Example: Cross-System Round-Trip

**Step 1 — User exports from a plain-text memory system:**

```
[2026-01-15] - User prefers dark mode
[2026-02-01] - User works with Rust and TypeScript
[2026-02-20] - Always use concise responses
```

**Step 2 — Convert to MIF** (parser splits `[date] - content` lines):

```json
{
  "mif_version": "2.0",
  "memories": [
    { "id": "a1b2c3d4-...", "content": "User prefers dark mode", "created_at": "2026-01-15T00:00:00Z", "memory_type": "observation" },
    { "id": "d4e5f6a7-...", "content": "User works with Rust and TypeScript", "created_at": "2026-02-01T00:00:00Z", "memory_type": "observation" },
    { "id": "g7h8i9j0-...", "content": "Always use concise responses", "created_at": "2026-02-20T00:00:00Z", "memory_type": "decision" }
  ]
}
```

**Step 3 — Import into any MIF-compatible system.** The receiving system generates embeddings, extracts entities, and builds its own graph. MIF carries the content, not the implementation.

**Step 4 — Re-export.** UUIDs preserved. If the system added entities or graph data, those are included. Vendor-specific metadata goes in `vendor_extensions`. The document is richer but backward-compatible with Step 2.

## Rationale

**Why memories + graph only?** Keeping the initial scope minimal maximizes adoption. Task management, reminders, and projects are separate concerns that can be addressed in future SEPs.

**Why JSON?** Universally supported, human-readable, native to MCP communication.

**Why UUIDs?** Enables lossless round-trip. Export from A → import to B → export from B preserves IDs, preventing duplicate accumulation.

**Why vendor extensions?** Different memory systems track different metadata (learning weights, activation scores, organization IDs). Extensions preserve this without requiring all implementers to understand every system's internals.

**Why content-hash dedup?** UUIDs may collide when importing from systems that generate new IDs on export. Content hash catches true semantic duplicates regardless of ID scheme.

## Backward Compatibility

Purely additive. No changes to existing MCP messages, tool schemas, or transport. Servers can adopt MIF alongside existing APIs.

## Security Implications

- Export/import endpoints MUST require authentication.
- Exports MUST be scoped to the authenticated user — no cross-user access.
- PII redaction SHOULD be surfaced prominently in UIs.
- MIF documents SHOULD NOT be transmitted over unencrypted connections.
- Vendor extensions from untrusted sources SHOULD be treated as untrusted input.

## Reference Implementation

A reference implementation exists in [shodh-memory](https://github.com/varun29ankuS/shodh-memory) (~3,000 lines across schema, export, import, format adapters, and HTTP handlers). Format adapters exist for mem0 JSON arrays, YAML-frontmatter markdown, and generic JSON. Deployed in production since February 2026.

Additional implementations and adapter contributions are welcome.
