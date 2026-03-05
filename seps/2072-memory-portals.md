# SEP-1900: Memory Portals - Portable Context Storage with chDB

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-01-11
- **Author(s)**: Community Proposal
- **Sponsor**: None (seeking sponsor)
- **PR**: TBD

**Implementation Repo (draft):** [ext-memory-portals](https://github.com/modelcontextprotocol/ext-memory-portals)

## Abstract

This SEP proposes Memory Portals, an MCP extension that enables servers to expose persistent, portable context storage using chDB embedded databases. Memory Portals provide a standardized way to store and retrieve conversation context, tool outputs, and user data in portable `.db` files that can be shared across different MCP hosts and tools. The extension introduces the `mem://` URI scheme for declaring memory resources and integrates with MCP Apps (SEP-1865) to provide interactive user interfaces for viewing, managing, importing, and deleting stored data.

## Motivation

Current MCP implementations lack a standardized approach for persistent context storage. While servers can maintain in-memory state during a session, there is no protocol-level mechanism for:

1. **Persistent storage** across sessions that survives server restarts
2. **Portable context** that can be transferred between different MCP hosts or tools
3. **User control** over stored data, including visibility, deletion, and import/export
4. **Structured querying** of historical context and tool outputs
5. **Standardized schemas** for context storage across different MCP servers

This leads to several problems:

- **Fragmentation**: Each MCP server implements its own storage mechanism, making it impossible to share context between tools
- **User privacy concerns**: Users cannot easily inspect or delete data stored by MCP servers
- **Limited context utilization**: Without persistent storage, servers cannot leverage long-term memory to improve responses
- **Portability issues**: Context and tool outputs are trapped within specific host implementations

Memory Portals addresses these issues by providing a standardized, portable, and user-controllable storage layer built on chDB, an embedded SQL database that produces single-file databases compatible with ClickHouse format.

### Why chDB?

chDB was chosen for several key reasons:

1. **Single-file portability**: Each database is a single `.db` file that can be easily copied, shared, or backed up
2. **SQL interface**: Familiar query language for both developers and advanced users
3. **High performance**: Columnar storage optimized for analytics workloads common in AI contexts
4. **Embedded**: No separate database server required, simplifying deployment
5. **Wide language support**: Available in Python, Go, Rust, Node.js, and more
6. **ClickHouse compatibility**: Can leverage the ClickHouse ecosystem for advanced features

## Specification

### Memory Portal Resources

Memory Portals are exposed as MCP resources using the `mem://` URI scheme.

#### Resource Declaration

Servers declare memory portal resources during initialization:

```json
{
  "uri": "mem://conversation/default",
  "name": "Default Conversation Memory",
  "description": "Stores conversation history and context",
  "mimeType": "application/vnd.mcp.memory+json",
  "_meta": {
    "memory": {
      "dbPath": "/path/to/conversation.db",
      "schema": {
        "tables": [
          {
            "name": "messages",
            "columns": [
              { "name": "id", "type": "UUID", "primary": true },
              { "name": "timestamp", "type": "DateTime64(3)" },
              { "name": "role", "type": "String" },
              { "name": "content", "type": "String" },
              { "name": "tool_calls", "type": "Array(String)" }
            ]
          }
        ]
      },
      "viewerUri": "ui://memory/viewer"
    }
  }
}
```

#### URI Scheme

The `mem://` URI follows this structure:

```
mem://{namespace}/{portal-id}[/{table}][?query]
```

Examples:

- `mem://conversation/default` - Root portal reference
- `mem://conversation/default/messages` - Specific table
- `mem://conversation/default/messages?since=2024-01-01` - Filtered query

#### Resource Reading

When a client requests a memory portal resource via `resources/read`, the server returns:

```json
{
  "contents": [
    {
      "uri": "mem://conversation/default",
      "mimeType": "application/vnd.mcp.memory+json",
      "text": "{\"schema\": {...}, \"stats\": {...}, \"dbPath\": \"...\"}"
    }
  ]
}
```

For table-specific queries:

```json
{
  "contents": [
    {
      "uri": "mem://conversation/default/messages?limit=10",
      "mimeType": "application/json",
      "text": "[{\"id\": \"...\", \"timestamp\": \"...\", \"content\": \"...\"}]"
    }
  ]
}
```

### Memory Portal Tools

Servers implementing Memory Portals should provide standard tools for data manipulation:

#### `memory/write`

Writes data to a memory portal:

```json
{
  "name": "memory/write",
  "description": "Write data to a memory portal",
  "inputSchema": {
    "type": "object",
    "properties": {
      "portalUri": {
        "type": "string",
        "description": "mem:// URI of the portal"
      },
      "table": {
        "type": "string",
        "description": "Target table name"
      },
      "data": {
        "type": "array",
        "description": "Array of records to insert",
        "items": { "type": "object" }
      }
    },
    "required": ["portalUri", "table", "data"]
  }
}
```

#### `memory/query`

Queries a memory portal with SQL:

```json
{
  "name": "memory/query",
  "description": "Query a memory portal using SQL",
  "inputSchema": {
    "type": "object",
    "properties": {
      "portalUri": {
        "type": "string",
        "description": "mem:// URI of the portal"
      },
      "sql": {
        "type": "string",
        "description": "SQL query to execute (SELECT only)"
      },
      "parameters": {
        "type": "object",
        "description": "Query parameters for prepared statements"
      }
    },
    "required": ["portalUri", "sql"]
  }
}
```

#### `memory/delete`

Deletes data from a memory portal:

```json
{
  "name": "memory/delete",
  "description": "Delete data from a memory portal",
  "inputSchema": {
    "type": "object",
    "properties": {
      "portalUri": {
        "type": "string",
        "description": "mem:// URI of the portal"
      },
      "table": {
        "type": "string",
        "description": "Table to delete from"
      },
      "where": {
        "type": "object",
        "description": "Conditions for deletion"
      }
    },
    "required": ["portalUri", "table"]
  }
}
```

#### `memory/import`

Imports data from external sources:

```json
{
  "name": "memory/import",
  "description": "Import data into a memory portal",
  "inputSchema": {
    "type": "object",
    "properties": {
      "portalUri": {
        "type": "string",
        "description": "mem:// URI of the portal"
      },
      "source": {
        "type": "string",
        "description": "Source file path or URL"
      },
      "format": {
        "type": "string",
        "enum": ["json", "csv", "parquet", "db"],
        "description": "Source data format"
      },
      "mapping": {
        "type": "object",
        "description": "Column mapping configuration"
      }
    },
    "required": ["portalUri", "source", "format"]
  }
}
```

#### `memory/export`

Exports portal data:

```json
{
  "name": "memory/export",
  "description": "Export data from a memory portal",
  "inputSchema": {
    "type": "object",
    "properties": {
      "portalUri": {
        "type": "string",
        "description": "mem:// URI of the portal"
      },
      "destination": {
        "type": "string",
        "description": "Export destination path"
      },
      "format": {
        "type": "string",
        "enum": ["json", "csv", "parquet", "db"],
        "description": "Export format"
      },
      "query": {
        "type": "string",
        "description": "Optional SQL query to filter exported data"
      }
    },
    "required": ["portalUri", "destination", "format"]
  }
}
```

### Integration with MCP Apps (SEP-1865)

Memory Portals integrate with MCP Apps to provide interactive viewing and management interfaces.

#### UI Resource Declaration

Servers should declare UI resources for memory portal viewers:

```json
{
  "uri": "ui://memory/viewer",
  "name": "Memory Portal Viewer",
  "description": "Interactive interface for viewing and managing memory portals",
  "mimeType": "text/html+mcp"
}
```

#### Tool-UI Linking

Memory portal tools can reference UI resources:

```json
{
  "name": "memory/view",
  "description": "Open interactive viewer for a memory portal",
  "inputSchema": {
    "type": "object",
    "properties": {
      "portalUri": {
        "type": "string",
        "description": "mem:// URI to open"
      }
    },
    "required": ["portalUri"]
  },
  "_meta": {
    "ui/resourceUri": "ui://memory/viewer",
    "ui/params": {
      "portalUri": "{{portalUri}}"
    }
  }
}
```

#### Viewer Capabilities

The interactive viewer should support:

1. **Data browsing**: Paginated table views with sorting and filtering
2. **Schema inspection**: View table structures and relationships
3. **Data deletion**: Select and delete specific records or entire tables
4. **Data import**: Upload files (JSON, CSV, Parquet) to import data
5. **Query execution**: Run custom SQL queries with result visualization
6. **Statistics**: View storage size, row counts, and usage metrics
7. **Export**: Download data in various formats

The viewer communicates with the host using MCP JSON-RPC over `postMessage`, calling memory portal tools as needed.

### Portability Specification

#### File Format

Memory Portal `.db` files use the chDB/ClickHouse format, which:

1. Is a single file containing all tables and data
2. Can be copied or moved between systems
3. Can be opened by any chDB-compatible tool
4. Includes metadata about schema and configuration

#### Metadata Storage

Each `.db` file should include a `_mcp_metadata` table:

```sql
CREATE TABLE _mcp_metadata (
  key String,
  value String,
  created_at DateTime64(3) DEFAULT now64(3),
  updated_at DateTime64(3) DEFAULT now64(3)
) ENGINE = MergeTree()
ORDER BY key;
```

Standard metadata keys:

- `mcp.version` - MCP protocol version
- `mcp.portal.id` - Portal identifier
- `mcp.portal.name` - Human-readable name
- `mcp.portal.description` - Portal description
- `mcp.server.name` - Creating server name
- `mcp.server.version` - Creating server version
- `mcp.created_at` - Creation timestamp
- `mcp.schema_version` - Schema version for migrations

#### Portability Guidelines

To ensure maximum portability:

1. **Use standard SQL types**: Avoid chDB-specific extensions where possible
2. **Document schema**: Include CREATE TABLE statements in metadata
3. **Version schemas**: Track schema versions for migration support
4. **Avoid absolute paths**: Use relative paths for any file references
5. **Include checksums**: Store data integrity hashes in metadata

## Rationale

### Why chDB Over Alternatives?

Several embedded database options were considered:

**SQLite**:

- Pros: Ubiquitous, well-tested, simpler
- Cons: Row-based storage inefficient for llms, lacks advanced types

**DuckDB**:

- Pros: Excellent analytics performance, Parquet support
- Cons: Less mature ecosystem, larger binary size

**chDB** (chosen):

- Pros: Columnar storage for analytics, single-file portability, SQL interface, ClickHouse ecosystem
- Cons: Larger binary, newer project

chDB was selected because MCP contexts often involve analytical queries (searching conversation history, aggregating tool outputs) where columnar storage excels, and the ClickHouse compatibility provides a rich ecosystem.

### URI Scheme Design

The `mem://` scheme was chosen to:

1. **Parallel `ui://`**: Consistent with MCP Apps extension patterns
2. **Distinct from file://**: Memory portals are logical resources, not just files
3. **Support hierarchical addressing**: Namespace/portal/table structure
4. **Enable query parameters**: For filtering and pagination

Alternative schemes considered:

- `mcp-memory://` - Too verbose
- `db://` - Too generic, conflicts with database connection URIs
- `context://` - Too vague, doesn't convey persistence

### Integration with MCP Apps

Rather than defining a custom UI protocol, Memory Portals leverages SEP-1865 (MCP Apps) for interactive interfaces. This provides:

1. **Consistency**: Users get familiar UI patterns across extensions
2. **Security**: Inherit iframe sandboxing and permission model
3. **Flexibility**: Servers can provide custom viewers or use standard ones
4. **Future-proof**: Automatically benefits from MCP Apps improvements

### Standard Tool Set

The defined tools (`memory/write`, `memory/query`, etc.) provide a consistent API while allowing servers flexibility in implementation. This enables:

1. **Interoperability**: Different servers can interact with each other's portals
2. **Tooling**: Third-party tools can manage any memory portal
3. **Composability**: Tools can be combined in workflows
4. **Extensibility**: Servers can add custom tools for specific use cases

## Backward Compatibility

Memory Portals is an **optional extension**. Existing MCP implementations continue working without changes.

### For MCP Hosts

Hosts that don't implement Memory Portals:

- Ignore `mem://` resources during resource listing
- Cannot read or write to memory portals
- Fall back to server-provided text responses for memory tools

Hosts can adopt Memory Portals incrementally:

1. Basic support: Read-only access to view portal contents
2. Full support: Complete CRUD operations
3. UI support: Interactive viewers via MCP Apps integration

### For MCP Servers

Servers that don't implement Memory Portals:

- Continue functioning normally
- Can adopt memory portals for specific use cases without changing existing functionality

Servers implementing Memory Portals should:

- Provide text fallbacks for memory-related tools when UI is unavailable
- Clearly document which features require memory portal support
- Degrade gracefully when hosts don't support the extension

### Migration Path

For existing servers with custom storage:

1. **Phase 1**: Add memory portal resources alongside existing storage
2. **Phase 2**: Provide migration tools to import existing data
3. **Phase 3**: Deprecate custom storage in favor of memory portals

## Reference Implementation

A reference implementation is planned with the following components:

### Server SDK (`@mcp/memory-portals`)

TypeScript SDK providing:

- `MemoryPortal` class for creating and managing portals
- `chDBAdapter` for database operations
- Built-in schema versioning and migrations
- Standard tool implementations
- UI template for portal viewer

### Example Server

A demonstration server showcasing:

- Conversation history storage
- Tool output archiving
- Cross-session context retrieval
- Interactive viewer integration

### Documentation

- Integration guide for server developers
- User guide for working with memory portals
- Security best practices
- Migration guide from custom storage

## Alternatives Considered

### Server-Side Storage Only

Keep storage implementation-specific, no protocol standardization.

**Rejected because**:

- Fragments ecosystem
- Limits portability
- No user control guarantees

### File-Based Resources

Use `file://` URIs to reference database files directly.

**Rejected because**:

- Doesn't convey structured nature
- No standard query interface
- Security concerns with direct file access

### REST API Extension

Add HTTP endpoints for database operations.

**Rejected because**:

- Requires servers to implement HTTP
- Doesn't fit MCP's JSON-RPC model
- Adds complexity

### Vector Database Focus

Use vector stores (Pinecone, Weaviate) instead of SQL.

**Rejected because**:

- Too specialized for embeddings
- Doesn't support general-purpose queries
- Less portable

### In-Memory Only with Snapshots

Keep data in memory, provide snapshot export.

**Rejected because**:

- Loses data on crashes
- No incremental persistence
- Can't handle large datasets

## Open Questions

1. **Schema Evolution**: How should schema migrations be handled when portals are shared between servers with different schema versions?

2. **Multi-Portal Queries**: Should there be a way to query across multiple memory portals in a single operation?

3. **Replication**: Should the spec define portal replication/sync mechanisms for distributed scenarios?

4. **Access Control Model**: Should portals support fine-grained permissions (row-level, column-level)?

5. **Compression Codecs**: Should specific compression algorithms be recommended or required?

6. **Binary Data**: How should large binary objects (images, files) be stored in portals?

7. **Full-Text Search**: Should full-text search capabilities be part of the core spec or an optional extension?

8. **Encryption**: Should at-rest encryption be mandatory, optional, or out-of-scope?

9. **Version Control**: Should portals support version history/time-travel queries?

10. **Federation**: Should there be a discovery mechanism for portals available across multiple servers?

## Acknowledgments

This proposal builds on:

- **SEP-1865 (MCP Apps)** for UI integration patterns
- **chDB project** for the embedded database foundation
- **MCP community feedback** on persistent storage needs
- **Prior art** from knowledge graph and context management systems

Special thanks to the MCP maintainers and community members who provided feedback during the drafting of this specification.
