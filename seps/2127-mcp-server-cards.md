# SEP-2127: MCP Server Cards - HTTP Server Discovery via .well-known

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2025-01-21
- **Author(s)**: David Soria Parra (@dsp-ant), Nick Cooper (@nickcoai)
- **Sponsor**: None
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127

## Abstract

This SEP proposes adding a standardized discovery mechanism for HTTP-based MCP servers using a `.well-known/mcp.json` endpoint. This enables clients to automatically discover server capabilities, available transports, authentication requirements, protocol versions and descriptions of primitives before establishing a connection.

## Motivation

MCP clients currently lack efficient mechanisms to discover information about MCP servers before establishing a full connection. To obtain even basic metadata like server name and version, clients must complete an entire initialization handshake. This creates friction for discovery, integration, and optimization scenarios.

### Current Pain Points

* **Manual Endpoint Configuration**: Users must manually configure transport URLs for each server, with no standardized discovery mechanism.
* **No Domain-Level Discovery**: Clients cannot automatically discover available MCP servers on a domain. This prevents automated integration scenarios, such as registry crawling or service auto-detection.
* **Expensive Initialization**: Every capability query requires a full initialization sequence. This round-trip is costly, difficult to cache efficiently, and creates unnecessary latency for simple metadata retrieval.

### Proposed Solution

This SEP introduces **MCP Server Cards** – structured metadata documents that servers expose through standardized mechanisms. The primary mechanism is a `.well-known/mcp.json` endpoint and similar mechanism appropriate for the transport. These provide static server information without requiring connection establishment. In addition the same information is served via a well known MCP resource.

### Enabled Use Cases

* **Autoconfiguration**: IDE extensions can automatically configure themselves when pointed at a domain, eliminating manual setup.
* **Automated Discovery**: Clients and registries can crawl domains to discover available MCP servers, enabling ecosystem-wide server indexes.
* **Static Verification**: Clients can validate tool descriptions against security classifiers and cache these validations, improving safety without repeated checks.
* **Reduced Latency:** Display server information, capabilities, and metadata without waiting for full initialization sequences.

### Design Philosophy

The discovery mechanism complements rather than replaces initialization. Discovery answers where to connect and what is available, while initialization handles how to communicate. By providing initialization-equivalent data in .well-known/mcp.json, we enable round-trip optimizations while maintaining protocol flexibility for dynamic scenarios.

## Specification

This section provides the technical specification for MCP Server Cards.

### MCP Server Card Schema

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json",
  "version": "1.0",
  "protocolVersion": "2025-06-18",
  "serverInfo": {
    "name": "example-mcp-server",
    "title": "Example MCP Server",
    "version": "1.2.0"
  },
  "description": "Example MCP server for demonstration",
  "iconUrl": "https://example.com/icon.png",
  "documentationUrl": "https://example.com/documentation",
  "transport": {
    "type": "streamable-http",
    "endpoint": "/mcp"
  },
  "capabilities": {
    "tools": {
      "listChanged": true
    },
    "prompts": {
      "listChanged": true
    },
    "resources": {
      "subscribe": true,
      "listChanged": true
    }
  },
  "requires": {
    "sampling": {},
    "roots": {}
  },
  "authentication": {
    "required": true,
    "schemes": ["bearer", "oauth2"]
  },
  "instructions": "Optional instructions for using this server",
  "resources": ["dynamic"],
  "tools": ["dynamic"],
  "prompts": ["dynamic"]
}
```

Example with static resource definitions:

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json",
  "version": "1.0",
  "protocolVersion": "2025-06-18",
  "serverInfo": {
    "name": "example-static-server",
    "title": "Example Static Server",
    "version": "1.0.0"
  },
  "transport": {
    "type": "streamable-http",
    "endpoint": "/mcp"
  },
  "capabilities": {
    "resources": {}
  },
  "resources": [
    {
      "name": "example_resource",
      "title": "Example Resource",
      "uri": "resource://example/data",
      "description": "An example resource",
      "mimeType": "text/plain"
    }
  ],
  "tools": [
    {
      "name": "example_tool",
      "title": "Example Tool",
      "description": "An example tool",
      "inputSchema": {
        "type": "object",
        "properties": {
          "input": {
            "type": "string"
          }
        }
      }
    }
  ],
  "prompts": [
    {
      "name": "example_prompt",
      "title": "Example Prompt",
      "description": "An example prompt",
      "arguments": []
    }
  ],
  "_meta": {}
}
```

### Field Descriptions

Most fields follow the initialization result from: https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle#initialization

1. **$schema** (string, required): URL to the JSON schema definition for the MCP Server Card format
2. **version** (string, required): Schema version for the server card document (e.g., "1.0")
3. **protocolVersion** (string, required): The MCP protocol version the server supports (e.g., "2025-06-18")
4. **serverInfo** (object, required): Server identification following the `Implementation` interface
   1. **name** (string, required): Server identifier for programmatic use
   2. **title** (string, optional): Human-readable server display name
   3. **version** (string, required): Server software version
5. **description** (string, optional): Human-readable description of the server
6. **iconUrl** (string, optional): URL to an icon representing the server
7. **documentationUrl** (string, optional): URL to the server's documentation
8. **transport** (object, required): Transport configuration
   1. **type** (string, required): Transport type (e.g., "streamable-http", "stdio", "sse")
   2. **endpoint** (string, required for HTTP): Transport endpoint path (e.g., "/mcp")
9. **capabilities** (object, required): Server capabilities following `ServerCapabilities`
   1. **experimental** (object, optional): Experimental capabilities
   2. **logging** (object, optional): Log message support
   3. **completions** (object, optional): Argument autocompletion support
   4. **prompts** (object, optional): Prompt template support
      1. **listChanged** (boolean, optional): Change notification support
   5. **resources** (object, optional): Resource support
      1. **subscribe** (boolean, optional): Subscription support
      2. **listChanged** (boolean, optional): Change notification support
   6. **tools** (object, optional): Tool support
      1. **listChanged** (boolean, optional): Change notification support
10. **requires** (object, optional): Required client capabilities following `ClientCapabilities`
    1. **experimental** (object, optional): Required experimental capabilities
    2. **roots** (object, optional): Root access requirement
    3. **sampling** (object, optional): LLM sampling requirement
    4. **elicitation** (object, optional): User elicitation requirement
11. **authentication** (object, optional): Authentication requirements
    1. **required** (boolean, required): Whether authentication is mandatory
    2. **schemes** (array, required): Supported schemes (e.g., ["bearer", "oauth2"])
12. **instructions** (string, optional): Usage instructions for the server
13. **resources** (string | array, optional): Resource definitions
    1. If "dynamic": Must be discovered via protocol
    2. If array: Static list following the `Resource` interface
14. **tools** (string | array, optional): Tool definitions
    1. If "dynamic": Must be discovered via protocol
    2. If array: Static list following the `Tool` interface
15. **prompts** (string | array, optional): Prompt definitions
    1. If "dynamic": Must be discovered via protocol
    2. If array: Static list following the `Prompt` interface
16. **_meta** (object, optional): Additional metadata following [_meta definition](https://modelcontextprotocol.io/specification/2025-06-18/basic/index#meta)

### Dynamic Primitives

MCP primitives are dynamic in nature and can change. To indicate that a list of primitives is dynamic in nature, authors can provide the reserved string "dynamic" (as an array with a single element) for the resources, tools, or prompts field. This indicates that the full list of primitives must be discovered through the protocol's standard list operations.

### Endpoints

MCP Server Cards can be provided through multiple endpoints. All endpoints are optional, but at least one endpoint is recommended for servers that wish to support discovery.

- All MCP Servers *SHOULD* provide server cards via an MCP resource.
- MCP servers supporting HTTP-based transports (including Streamable HTTP and SSE) *SHOULD* provide a server card via a .well-known URI.

#### MCP Resource

Servers SHOULD provide their server card as an MCP resource with:
- **URI**: `mcp://server-card.json`
- **MIME type**: `application/json`
- **Resource type**: Static resource containing the server card JSON

This enables clients to discover server metadata after establishing an MCP connection, without requiring HTTP access.

#### .well-known URI

Servers using HTTP-based transports SHOULD provide their server card at:

```
/.well-known/mcp/server-card.json
```

This endpoint:
- MUST be accessible via HTTPS (HTTP MAY be supported for local/development use)
- MUST return `Content-Type: application/json`
- MUST include appropriate CORS headers (see below)
- SHOULD include appropriate caching headers (see below)

See [RFC 8615](https://datatracker.ietf.org/doc/html/rfc8615) for details on constructing .well-known URIs.

##### CORS Requirements

Discovery endpoints MUST include appropriate CORS headers to allow browser-based clients:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET
Access-Control-Allow-Headers: Content-Type
```

##### Caching

Servers MAY include cache headers for the discovery document:

```
Cache-Control: public, max-age=3600
```

#### Registry

The registry should expose the MCP Server Card for a given registry entry.

### Other Considered Endpoints

**DNS-based discovery**: We considered using DNS TXT records for discovery, similar to DKIM or SPF. However, this approach would be limited to domain-level discovery and wouldn't work for path-based or port-based MCP servers, making it too restrictive.

**Header-based discovery**: We considered using HTTP headers (similar to Link headers) to advertise server card locations. While this could work, it requires an HTTP request to the main endpoint first, eliminating many of the benefits of pre-connection discovery.

## Rationale

### Why .well-known?

The `.well-known` URI pattern is an established IETF standard (RFC 8615) used by many protocols for service discovery, including OAuth 2.0 Authorization Server Metadata (RFC 8414). This approach:

- Provides a predictable, standardized location for discovery
- Requires no prior knowledge of server configuration
- Works with standard HTTP infrastructure (caches, CDNs, load balancers)
- Is already familiar to developers working with web services

### Why Mirror Initialization Data?

By structuring server cards to mirror the initialization response, we:

- Minimize implementation complexity for servers
- Allow clients to use the same parsing logic for both discovery and initialization
- Enable round-trip optimizations where discovery data can be used directly
- Maintain consistency between advertised and actual capabilities

### Why Support Both Static and Dynamic Primitives?

Some servers have fixed tool sets that never change, while others generate tools dynamically based on user context or external data. Supporting both patterns:

- Allows static servers to fully describe themselves in the server card
- Enables security scanning of static tool sets before connection
- Preserves flexibility for dynamic use cases
- Makes the "dynamic" marker explicit rather than implicit

## Backward Compatibility

This SEP is fully backward compatible with existing MCP implementations:

- Server cards are **optional**. Servers that don't implement them continue to work normally through standard initialization.
- Clients that don't support server cards can ignore them and use the initialization handshake as before.
- The server card schema is designed to mirror the initialization response structure, minimizing implementation complexity for servers that want to support both.
- No changes to the core MCP protocol messages or initialization flow are required.

### Migration Path

1. **Phase 1** (Optional): Servers can begin exposing server cards without requiring client support
2. **Phase 2** (Recommended): Clients can implement server card fetching for enhanced discovery and pre-connection validation
3. **Phase 3** (Future): The ecosystem can develop tooling around server cards for registries, security scanning, and automated discovery

## Security Implications

### Information Disclosure

Server cards are publicly accessible by design. Servers MUST NOT include sensitive information in server cards, including:
- Authentication credentials or tokens
- Internal network topology or private endpoints
- Proprietary business logic or algorithms
- User-specific or session-specific data

### Tool Description Security

Exposing tool descriptions in server cards before connection establishment creates an opportunity for clients to perform security analysis. This is a security *improvement* as it enables:
- Offline security scanning of tool capabilities
- Automated classification before user exposure
- Cached security validations reducing runtime overhead

However, clients MUST still validate that the actual tools provided during initialization match the advertised tools in the server card. Servers MAY omit sensitive tool descriptions from the server card and mark tools as "dynamic" if pre-connection disclosure is undesirable.

### CORS Requirements

Server cards MUST be served with appropriate CORS headers to enable browser-based client discovery. The recommended configuration (`Access-Control-Allow-Origin: *`) is safe for server cards because:
1. Server cards contain only public metadata (no credentials or secrets)
2. They are read-only (no state-changing operations)
3. Wide accessibility benefits the discovery use case

### Denial of Service

Servers SHOULD implement rate limiting on `.well-known/mcp/server-card.json` endpoints to prevent abuse. Clients SHOULD respect cache headers and avoid excessive polling.

### Man-in-the-Middle Attacks

Server cards SHOULD be served over HTTPS. Clients SHOULD validate TLS certificates when fetching server cards. However, because server cards are advisory (the actual connection still requires initialization and authentication), compromised server cards primarily affect discoverability rather than security.

## Reference Implementation

*To be added. A reference implementation is required before this SEP can be given "Final" status.*

## IETF Registration

`.well-known/` URIs must be registered with the IETF per RFC 8615. The SEP authors are responsible for submitting a registration request to IANA for the `.well-known/mcp/` URI suffix once this SEP is approved.

The registration will include:
- URI suffix: `mcp`
- Change controller: Model Context Protocol Steering Committee
- Specification document: This SEP
- Related information: Link to MCP specification

## References

* [RFC 8414: OAuth 2.0 Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414)
* [RFC 8615: Well-Known URIs](https://datatracker.ietf.org/doc/html/rfc8615)
* [MCP Protocol Specification](https://modelcontextprotocol.io/specification)
* [Original GitHub Issue #1649](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1649)
