# SEP-2127: MCP Server Cards - HTTP Server Discovery via .well-known

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-01-21
- **Author(s)**: David Soria Parra (@dsp-ant), Nick Cooper (@nickcoai), Tadas Antanavicius (@tadasant)
- **Sponsor**: None
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127

## Abstract

This SEP proposes adding a standardized, self-contained format to describe MCP servers, e.g. for discovery using a `.well-known` endpoint. This enables clients to automatically discover server capabilities, available transports, authentication requirements, protocol versions and descriptions of primitives before establishing a connection.

## Motivation

MCP clients currently lack efficient mechanisms to discover information about MCP servers before establishing a full connection. To obtain even basic metadata like server name and version, clients must complete an entire initialization handshake. This creates friction for discovery, integration, and optimization scenarios.

### Current Pain Points

- **Manual Endpoint Configuration**: Users must manually configure transport URLs for each server, with no standardized discovery mechanism.
- **No Domain-Level Discovery**: Clients cannot automatically discover available MCP servers on a domain. This prevents automated integration scenarios, such as registry crawling or service auto-detection.
- **Expensive Initialization**: Every capability query requires a full initialization sequence. This round-trip is costly, difficult to cache efficiently, and creates unnecessary latency for simple metadata retrieval.

### Proposed Solution

This SEP introduces **MCP Server Cards** – structured metadata documents that servers expose through standardized mechanisms. The primary mechanism is a `.well-known` endpoint and similar mechanism appropriate for the transport. These provide static server information without requiring connection establishment. In addition the same information is served via a well known MCP resource.

### Enabled Use Cases

- **Autoconfiguration**: IDE extensions can automatically configure themselves when pointed at a domain, eliminating manual setup.
- **Automated Discovery**: Clients and registries can crawl domains to discover available MCP servers, enabling ecosystem-wide server indexes.
- **Static Verification**: Clients can validate tool descriptions against security classifiers and cache these validations, improving safety without repeated checks.
- **Reduced Latency:** Display server information, capabilities, and metadata without waiting for full initialization sequences.

### Design Philosophy

The discovery mechanism complements rather than replaces initialization. Discovery answers where to connect and what is available, while initialization handles how to communicate.

### Discovery

#### Relationship to AI Card

The [AI Card](https://github.com/Agent-Card/ai-card) standard is paving a path to providing decentralized, protocol-agnostic mechanisms for identifying agent entrypoints. For example, a `.well-known` path and file format for discovering services (`.well-known/ai-catalog.json`).

#### MCP Connection Details

MCP Server Cards will provide a richer, MCP-specific definition that can be used by MCP clients to actually connect and start performing MCP operations. We will store these values at `.well-known/mcp/server-card`.

Example:

- "Restaurant A" works with platform "Restaurant Reservations SaaS" to provide MCP-powered bookings for their restaurant
- Restaurant A also works with platform "Jobs SaaS" to provide MCP-powered job listings to prospective job seekers
- Restaurant A would advertise the two relevant AI Cards at `restaurant-a.com/.well-known/ai-catalog.json`
- Restaurant Reservations SaaS would have many Server Cards at `restaurant-reservations-saas.com/.well-known/mcp/server-card/*`, including entries for each of Restaurant A (`restaurant-reservations-saas.com/.well-known/mcp/server-card/restaurant-a`), Restaurant B (`restaurant-reservations-saas.com/.well-known/mcp/server-card/restaurant-b`), etc.
- Jobs Saas would have many Server Cards at `jobs-saas.com/.well-known/mcp/server-card/*`, including entries for each of Restaurant A (`jobs-saas.com/.well-known/mcp/server-card/restaurant-a`), Coffee Shop B (`jobs-saas.com/.well-known/mcp/server-card/coffee-shop-b`), etc.

We can develop and iterate on MCP Server Cards largely independently from the broader effort to integrate with AI Cards, as long as we maintain some integration point so it is possible to understand when an entry in an AI Card references an MCP Server Card that is hosted and maintained elsewhere.

## Specification

This section provides the technical specification for MCP Server Cards.

### MCP Server Card Schema

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
  "name": "io.modelcontextprotocol.anonymous/brave-search",
  "version": "1.0.2",
  "description": "MCP server for Brave Search API integration",
  "title": "Brave Search",
  "websiteUrl": "https://anonymous.modelcontextprotocol.io/examples",
  "repository": {
    "url": "https://github.com/modelcontextprotocol/servers",
    "source": "github",
    "subfolder": "src/everything"
  },
  "icons": [ ... ],
  "remotes": [ ... ],
  "packages": [ ... ],
  "capabilities":  { ... },
  "requires": { ... },
  "resources": [ ... ],
  "tools": [ ... ],
  "prompts": [ ... ],
  "_meta": { ... }
}
```

Fleshed out (contrived values) example:

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
  "name": "io.modelcontextprotocol.anonymous/brave-search",
  "version": "1.0.2",
  "description": "MCP server for Brave Search API integration",
  "title": "Brave Search",
  "websiteUrl": "https://anonymous.modelcontextprotocol.io/examples",
  "repository": {
    "url": "https://github.com/modelcontextprotocol/servers",
    "source": "github",
    "subfolder": "src/everything"
  },
  "icons": [
    {
      "src": "https://example.com/icons/weather-icon-48.png",
      "sizes": ["48x48"],
      "mimeType": "image/png",
      "theme": "light"
    }
  ],
  "remotes": [
    {
      "type": "streamable-http",
      "url": "https://mcp.anonymous.modelcontextprotocol.io/http",
      "supportedProtocolVersions": [ "2025-03-12", "2025-06-15" ],
      "headers": [
        {
          "name": "X-API-Key",
          "description": "API key for authentication",
          "isRequired": true,
          "isSecret": true
        },
        {
          "name": "X-Region",
          "description": "Service region",
          "default": "us-east-1",
          "choices": [
            "us-east-1",
            "eu-west-1",
            "ap-southeast-1"
          ]
        }
      ],
      "authentication": {
        "required": true,
        "schemes": ["bearer", "oauth2"]
      },
    },
    {
      "type": "sse",
      "url": "https://mcp.anonymous.modelcontextprotocol.io/sse",
      "supportedProtocolVersions": [ "2025-03-12", "2025-06-15" ],
      "authentication": {
        "required": true,
        "schemes": ["bearer", "oauth2"]
      },
    }
  ],
  "packages": [
    {
      "registryType": "npm",
      "registryBaseUrl": "https://registry.npmjs.org",
      "identifier": "@modelcontextprotocol/server-brave-search",
      "version": "1.0.2",
      "supportedProtocolVersions": [ "2025-03-12", "2025-06-15" ],
      "transport": {
        "type": "stdio"
      },
      "runtimeArguments": [
        {
          "type": "named",
          "description": "Mount a volume into the container",
          "name": "--mount",
          "value": "type=bind,src={source_path},dst={target_path}",
          "isRequired": true,
          "isRepeated": true,
          "variables": {
            "source_path": {
              "description": "Source path on host",
              "format": "filepath",
              "isRequired": true
            },
            "target_path": {
              "description": "Path to mount in the container. It should be rooted in `/project` directory.",
              "isRequired": true,
              "default": "/project"
            }
          }
        }
      ],
      "packageArguments": [
        {
          "type": "positional",
          "value": "mcp"
        },
        {
          "type": "positional",
          "value": "start"
        }
      ],
      "environmentVariables": [
        {
          "name": "BRAVE_API_KEY",
          "description": "Brave Search API Key",
          "isRequired": true,
          "isSecret": true
        }
      ]
    }
  ],
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
  "resources": [
    {
      "uri": "file:///project/src/main.rs",
      "name": "main.rs",
      "title": "Rust Software Application Main File",
      "description": "Primary application entry point",
      "mimeType": "text/x-rust",
      "icons": [
        {
          "src": "https://example.com/rust-file-icon.png",
          "mimeType": "image/png",
          "sizes": ["48x48"]
        }
      ]
    }
  ],
  "tools": [
    {
      "name": "get_weather",
      "title": "Weather Information Provider",
      "description": "Get current weather information for a location",
      "inputSchema": {
        "type": "object",
        "properties": {
          "location": {
            "type": "string",
            "description": "City name or zip code"
          }
        },
        "required": ["location"]
      },
      "icons": [
        {
          "src": "https://example.com/weather-icon.png",
          "mimeType": "image/png",
          "sizes": ["48x48"]
        }
      ]
    }
  ],
  "prompts": [
    {
      "name": "code_review",
      "title": "Request Code Review",
      "description": "Asks the LLM to analyze code quality and suggest improvements",
      "arguments": [
        {
          "name": "code",
          "description": "The code to review",
          "required": true
        }
      ],
      "icons": [
        {
          "src": "https://example.com/review-icon.svg",
          "mimeType": "image/svg+xml",
          "sizes": ["any"]
        }
      ]
    }
  ],
  "_meta": { ... }
}

```

### Field Descriptions

Most fields follow the current MCP Registry `server.json` standard: https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/server-json/generic-server-json.md

0. **$schema** (string, required): The Server Card JSON schema URI that evolves in-place per major version iteration
1. **name** (string, required): Server name in reverse-DNS format. Must contain exactly one forward slash separating namespace from server name.
2. **version** (string, required): Version string for this server. SHOULD follow semantic versioning (e.g., '1.0.2', '2.1.0-alpha'). Equivalent of Implementation.version in MCP specification. Non-semantic versions are allowed but may not sort predictably. Version ranges are rejected (e.g., '^1.2.3', '~1.2.3', '\u003e=1.2.3', '1.x', '1.\*').
3. **description** (string, optional): Clear human-readable explanation of server functionality. Should focus on capabilities, not implementation details.
4. **title** (string, optional): Optional human-readable title or display name for the MCP server.
5. **websiteUrl** (string, optional): Optional URL to the server's homepage, documentation, or project website. This provides a central link for users to learn more about the server. Particularly useful when the server has custom installation instructions or setup requirements.
6. **repository** (object, optional): Repository metadata for the MCP server source code. [See details](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/server-json/server.schema.json#L371).
7. **icons** (array of object, optional): Optional set of sized icons that the client can display in a user interface. Clients that support rendering icons MUST support at least the following MIME types: image/png and image/jpeg (safe, universal compatibility). Clients SHOULD also support: image/svg+xml (scalable but requires security precautions) and image/webp (modern, efficient format). [See details](https://github.com/modelcontextprotocol/registry/blob/3f3383bb6199990c853ae8be3715e150af5e8bcb/docs/reference/server-json/server.schema.json#L18).
8. **remotes** (array of object, optional): Metadata helpful for making HTTP-based connections to this MCP server.
9. **supportedProtocolVersions** (array of string, optional): list of MCP protocol versions actively supported by this Remote.
10. **authentication** (object, optional): Authentication requirements
11. **required** (boolean, required): Whether authentication is mandatory
12. **schemes** (array, required): Supported schemes (e.g., ["bearer", "oauth2"])
13. [See details](https://github.com/modelcontextprotocol/registry/blob/3f3383bb6199990c853ae8be3715e150af5e8bcb/docs/reference/server-json/server.schema.json#L344) for other fields.
14. **packages** (array of object, optional): Metadata helpful for running and connecting to local instances of this MCP server.
15. **supportedProtocolVersions** (array of string, optional): list of MCP protocol versions actively supported by this Remote.
16. [See details](https://github.com/modelcontextprotocol/registry/blob/3f3383bb6199990c853ae8be3715e150af5e8bcb/docs/reference/server-json/server.schema.json#L207) for other fields.
17. **capabilities** (object, required): Server capabilities following `ServerCapabilities`
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
18. **requires** (object, optional): Required client capabilities following `ClientCapabilities`
    1. **experimental** (object, optional): Required experimental capabilities
    2. **roots** (object, optional): Root access requirement
    3. **sampling** (object, optional): LLM sampling requirement
    4. **elicitation** (object, optional): User elicitation requirement
19. **resources** (string | array, optional): Resource definitions
    1. If "dynamic": Must be discovered via protocol
    2. If array: Static list following the `Resource` interface
20. **tools** (string | array, optional): Tool definitions
    1. If "dynamic": Must be discovered via protocol
    2. If array: Static list following the `Tool` interface
21. **prompts** (string | array, optional): Prompt definitions
    1. If "dynamic": Must be discovered via protocol
    2. If array: Static list following the `Prompt` interface
22. **\_meta** (object, optional): Additional metadata following [\_meta definition](https://modelcontextprotocol.io/specification/2025-06-18/basic/index#meta)

### Dynamic Primitives

MCP primitives are dynamic in nature and can change. To indicate that a list of primitives is dynamic in nature, authors can provide the reserved string "dynamic" (as an array with a single element) for the resources, tools, or prompts field. This indicates that the full list of primitives must be discovered through the protocol's standard list operations.

### Endpoints

MCP Server Cards can be provided through multiple endpoints. All endpoints are optional, but at least one endpoint is recommended for servers that wish to support discovery.

- All MCP Servers _SHOULD_ provide server cards via an MCP resource.
- MCP servers supporting HTTP-based transports (including Streamable HTTP and SSE) _SHOULD_ provide a server card via a .well-known URI.

#### MCP Resource

Servers SHOULD provide their server card as an MCP resource with:

- **URI**: `mcp://server-card.json`
- **MIME type**: `application/json`
- **Resource type**: Static resource containing the server card JSON

This enables clients to discover server metadata after establishing an MCP connection, without requiring HTTP access.

#### .well-known URI

Servers using HTTP-based transports SHOULD provide their server card at:

```
/.well-known/mcp/server-card
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

### Why Mirror `server.json`'s shape?

MCP Server Cards aim to provide a static representation of server metadata and capabilities so that clients can discover and connect to them without prior knowledge of their existence.

The MCP Registry and conformant internal Sub-Registry implementations share the same goal, just distributed via a centralized rather than decentralized manner.

By avoiding inducing breaking changes to the `server.json` shape, we also leave intact dozens, perhaps hundreds of systems that are already in production across the MCP Registry-related ecosystem.

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

Exposing tool descriptions in server cards before connection establishment creates an opportunity for clients to perform security analysis. This is a security _improvement_ as it enables:

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

Servers SHOULD implement rate limiting on `.well-known/mcp/server-card` endpoints to prevent abuse. Clients SHOULD respect cache headers and avoid excessive polling.

### Man-in-the-Middle Attacks

Server cards SHOULD be served over HTTPS. Clients SHOULD validate TLS certificates when fetching server cards. However, because server cards are advisory (the actual connection still requires initialization and authentication), compromised server cards primarily affect discoverability rather than security.

## Reference Implementation

_To be added. A reference implementation is required before this SEP can be given "Final" status._

## IETF Registration

`.well-known/` URIs must be registered with the IETF per RFC 8615. The SEP authors are responsible for submitting a registration request to IANA for the `.well-known/mcp/` URI suffix once this SEP is approved.

The registration will include:

- URI suffix: `mcp`
- Change controller: Model Context Protocol Steering Committee
- Specification document: This SEP
- Related information: Link to MCP specification

## References

- [RFC 8414: OAuth 2.0 Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414)
- [RFC 8615: Well-Known URIs](https://datatracker.ietf.org/doc/html/rfc8615)
- [MCP Protocol Specification](https://modelcontextprotocol.io/specification)
- [Original GitHub Issue #1649](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1649)
