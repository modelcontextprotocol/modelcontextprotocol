# SEP-xxxx: HTTP Header Standardization for Streamable HTTP Transport

<!-- cspell:ignore streamable -->

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-02-04
- **Author(s)**: MCP Transports Working Group
- **Sponsor**: None
- **PR**: https://github.com/modelcontextprotocol/specification/pull/xxxx

## Abstract

This SEP proposes exposing critical routing and context information in standard HTTP header locations for the Streamable HTTP transport. By mirroring key fields from the JSON-RPC payload into HTTP headers, network intermediaries such as load balancers, proxies, and observability tools can route and process MCP traffic without deep packet inspection, reducing latency and computational overhead.

## Motivation

Current MCP implementations over HTTP bury all routing information within the JSON-RPC payload. This creates friction for network infrastructure:

- **Load balancers** must terminate TLS and parse the entire JSON body to extract routing information (e.g., region, tool name)
- **Proxies and gateways** cannot make routing decisions without deep packet inspection
- **Observability tools** have limited visibility into MCP traffic patterns
- **Rate limiters and WAFs** cannot apply policies based on MCP-specific fields

By exposing key fields in HTTP headers, we enable standard network infrastructure to work with MCP traffic using existing, well-supported mechanisms.

## Specification

### Standard Headers

The Streamable HTTP transport will require POST requests to include the following headers mirrored from the request body:

| Header Name       | Source Field   | Required For              |
| ----------------- | -------------- | ------------------------- |
| `Mcp-Method`      | `method`       | All requests              |
| `Mcp-Tool-Name`   | `params.name`  | `tools/call` requests     |
| `Mcp-Resource`    | `params.uri`   | `resources/read` requests |
| `Mcp-Prompt-Name` | `params.name`  | `prompts/get` requests    |

These headers are **required** for compliance with the MCP version in which they are introduced.

**Server Behavior**: Servers MUST reject requests where the values specified in the headers do not match the values in the request body.

**Case Sensitivity**: Header names (called "field names" in [RFC 9110](https://datatracker.ietf.org/doc/html/rfc9110#name-field-names)) are case-insensitive. Clients and servers MUST use case-insensitive comparisons for header names.

#### Example: tools/call Request

```http
POST /mcp HTTP/1.1
Content-Type: application/json
Mcp-Session-Id: 1f3a4b5c-6d7e-8f9a-0b1c-2d3e4f5a6b7c
Mcp-Method: tools/call
Mcp-Tool-Name: get_weather

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": {
      "location": "Seattle, WA"
    }
  }
}
```

#### Example: resources/read Request

```http
POST /mcp HTTP/1.1
Content-Type: application/json
Mcp-Session-Id: 1f3a4b5c-6d7e-8f9a-0b1c-2d3e4f5a6b7c
Mcp-Method: resources/read
Mcp-Resource: file:///projects/myapp/config.json

{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "resources/read",
  "params": {
    "uri": "file:///projects/myapp/config.json"
  }
}
```

#### Example: prompts/get Request

```http
POST /mcp HTTP/1.1
Content-Type: application/json
Mcp-Session-Id: 1f3a4b5c-6d7e-8f9a-0b1c-2d3e4f5a6b7c
Mcp-Method: prompts/get
Mcp-Prompt-Name: code_review

{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "prompts/get",
  "params": {
    "name": "code_review",
    "arguments": {
      "language": "python"
    }
  }
}
```

#### Example: Other Request Methods

For requests that don't involve tools, resources, or prompts, only the `Mcp-Method` header is required:

```http
POST /mcp HTTP/1.1
Content-Type: application/json
Mcp-Method: initialize

{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "capabilities": {},
    "clientInfo": {
      "name": "ExampleClient",
      "version": "1.0.0"
    }
  }
}
```

### Custom Headers from Tool Parameters

MCP servers MAY designate specific tool parameters to be mirrored into HTTP headers using an `x-mcp-header` extension property in the parameter's schema within the tool's `inputSchema`.

#### Schema Extension

The `x-mcp-header` property specifies the name portion used to construct the header name `Mcp-Param-{name}`.

**Constraints on `x-mcp-header` values**:

- MUST contain only ASCII characters (excluding space and `:`)
- MUST be case-insensitively unique among all `x-mcp-header` values in the `inputSchema`
- MUST only be applied to parameters with primitive types (number, string, boolean)

**Example Tool Definition**:

```json
{
  "name": "execute_sql",
  "description": "Execute SQL on Google Cloud Spanner",
  "inputSchema": {
    "type": "object",
    "properties": {
      "region": {
        "type": "string",
        "description": "The region to execute the query in",
        "x-mcp-header": "Region"
      },
      "query": {
        "type": "string",
        "description": "The SQL query to execute"
      }
    },
    "required": ["region", "query"]
  }
}
```

#### Client Behavior

When constructing a `tools/call` request via HTTP transport, the client:

1. Inspects the tool's `inputSchema` for properties marked with `x-mcp-header`
2. Extracts the value provided for that parameter
3. Encodes the value according to the rules in [Value Encoding](#value-encoding)
4. Appends a header to the request: `Mcp-Param-{Name}: {Value}`

#### Value Encoding

Clients MUST encode parameter values before including them in HTTP headers to ensure safe transmission and prevent injection attacks.

**Character Restrictions**

Per [RFC 9110](https://datatracker.ietf.org/doc/html/rfc9110#name-field-values), HTTP header field values must consist of visible ASCII characters (0x21-0x7E), space (0x20), and horizontal tab (0x09). The following characters are explicitly prohibited:

- Carriage return (`\r`, 0x0D)
- Line feed (`\n`, 0x0A)
- Null character (`\0`, 0x00)
- Any character outside the ASCII range (> 0x7F)

**Encoding Rules**

Clients MUST apply the following encoding rules in order:

1. **Type conversion**: Convert the parameter value to its string representation:
   - `string`: Use the value as-is
   - `number`: Convert to decimal string representation (e.g., `42`, `3.14`)
   - `boolean`: Convert to lowercase `"true"` or `"false"`

2. **ASCII validation**: Check if the string contains only valid ASCII characters (0x20-0x7E):
   - If valid, proceed to step 3
   - If invalid (contains non-ASCII or control characters), apply Base64 encoding (see below)

3. **Control character check**: If the string contains any control characters (0x00-0x1F or 0x7F):
   - Apply Base64 encoding (see below)

4. **Length validation**: If the encoded value exceeds 8192 bytes, the client MUST omit the header and MAY log a warning

**Base64 Encoding for Unsafe Values**

When a value cannot be safely represented as a plain ASCII header value, clients MUST use Base64 encoding with the following format:

```
Mcp-Param-{Name}: =?base64?{Base64EncodedValue}?=
```

The prefix `=?base64?` and suffix `?=` indicate that the value is Base64-encoded. Servers and intermediaries that need to inspect these values MUST decode them accordingly.

**Example**:

A parameter value of `"Hello, 世界"` (contains non-ASCII) would be encoded as:

```
Mcp-Param-Greeting: =?base64?SGVsbG8sIOS4lueVjA==?=
```

**Server Validation**

Servers MUST validate that encoded header values, after decoding if Base64-encoded, match the corresponding values in the request body. Servers MUST reject requests with a `400 Bad Request` status if:

- A required header is missing
- A header value does not match the request body value
- A Base64-encoded value cannot be decoded
- A header value contains invalid characters

#### Example: Geo-Distributed Database

Consider a server exposing an `execute_sql` tool for Google Cloud Spanner, which requires a `region` parameter.

**Tool Definition**:

```json
{
  "name": "execute_sql",
  "description": "Execute SQL on Google Cloud Spanner",
  "inputSchema": {
    "type": "object",
    "properties": {
      "region": {
        "type": "string",
        "description": "The region to execute the query in",
        "x-mcp-header": "Region"
      },
      "query": {
        "type": "string",
        "description": "The SQL query to execute"
      }
    },
    "required": ["region", "query"]
  }
}
```

**Scenario**: A client requests to execute SQL in `us-west1`.

**Current Friction**: The global load balancer receives the request but must terminate TLS and parse the entire JSON body to find `"region": "us-west1"` before it knows whether to route the packet to the Oregon or Belgium cluster.

**With This Proposal**: The client detects the `x-mcp-header` annotation and automatically adds the header `Mcp-Param-Region: us-west1` to the HTTP request. The load balancer can now route based on the header without parsing the body.

**Request**:

```http
POST /mcp HTTP/1.1
Content-Type: application/json
Mcp-Session-Id: 1f3a4b5c-6d7e-8f9a-0b1c-2d3e4f5a6b7c
Mcp-Method: tools/call
Mcp-Tool-Name: execute_sql
Mcp-Param-Region: us-west1

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "execute_sql",
    "arguments": {
      "region": "us-west1",
      "query": "SELECT * FROM users"
    }
  }
}
```

#### Example: Multi-Tenant SaaS Application

A SaaS platform exposes tools that operate on different customer tenants. By exposing the tenant ID in a header, the platform can route requests to tenant-specific infrastructure.

**Tool Definition**:

```json
{
  "name": "query_analytics",
  "description": "Query analytics data for a tenant",
  "inputSchema": {
    "type": "object",
    "properties": {
      "tenant_id": {
        "type": "string",
        "description": "The tenant identifier",
        "x-mcp-header": "TenantId"
      },
      "metric": {
        "type": "string",
        "description": "The metric to query"
      },
      "start_date": {
        "type": "string",
        "description": "Start date for the query range"
      },
      "end_date": {
        "type": "string",
        "description": "End date for the query range"
      }
    },
    "required": ["tenant_id", "metric", "start_date", "end_date"]
  }
}
```

**Request**:

```http
POST /mcp HTTP/1.1
Content-Type: application/json
Mcp-Session-Id: 1f3a4b5c-6d7e-8f9a-0b1c-2d3e4f5a6b7c
Mcp-Method: tools/call
Mcp-Tool-Name: query_analytics
Mcp-Param-TenantId: acme-corp

{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tools/call",
  "params": {
    "name": "query_analytics",
    "arguments": {
      "tenant_id": "acme-corp",
      "metric": "page_views",
      "start_date": "2026-01-01",
      "end_date": "2026-01-31"
    }
  }
}
```

#### Example: Priority-Based Request Handling

A server can expose a priority parameter to allow infrastructure to prioritize certain requests.

**Tool Definition**:

```json
{
  "name": "generate_report",
  "description": "Generate a complex report",
  "inputSchema": {
    "type": "object",
    "properties": {
      "report_type": {
        "type": "string",
        "description": "Type of report to generate"
      },
      "priority": {
        "type": "string",
        "description": "Request priority: low, normal, or high",
        "x-mcp-header": "Priority"
      }
    },
    "required": ["report_type"]
  }
}
```

**Request**:

```http
POST /mcp HTTP/1.1
Content-Type: application/json
Mcp-Session-Id: 1f3a4b5c-6d7e-8f9a-0b1c-2d3e4f5a6b7c
Mcp-Method: tools/call
Mcp-Tool-Name: generate_report
Mcp-Param-Priority: high

{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "tools/call",
  "params": {
    "name": "generate_report",
    "arguments": {
      "report_type": "quarterly_summary",
      "priority": "high"
    }
  }
}
```

## Rationale

### Headers vs Path

This proposal mirrors request data into headers rather than the path for:

1. **Simplicity**: All widely-used network load balancers support routing based on HTTP headers
2. **Multi-version support**: Easier to support multiple MCP versions in clients and servers
3. **Compatibility**: Headers work with the existing Streamable HTTP transport design

### Infrastructure Support

HTTP header-based routing and processing is supported by:

- **Load Balancers**: All major load balancers (HAProxy, NGINX, Cloudflare, F5, Envoy/Istio)
- **Rate Limiting**: 9 of 11 popular rate-limiting solutions
- **Authorization**: Kong, Tyk, AWS API Gateway, Google Cloud Apigee, Azure API Gateway, NGINX, Apache APISIX, Istio/Envoy
- **Web Application Firewalls**: Cloudflare WAF, AWS WAF, Azure WAF, F5 Advanced WAF, FortiWeb, Imperva WAF, Barracuda WAF, ModSecurity, Akamai, Wallarm
- **Observability**: Most observability solutions can extract data from HTTP headers

### Explicit Header Names in x-mcp-header

The design uses an explicit name value in `x-mcp-header` rather than deriving the header name from the parameter name because:

1. **Case sensitivity mismatch**: Header names are case-insensitive, but JSON Schema property names are case-sensitive
2. **Character set constraints**: Header names are limited to ASCII characters, but tool parameter names may contain arbitrary Unicode
3. **Simplicity**: No complex scheme needed for constructing header names from nested properties

### Placement Within JSON Schema

The `x-mcp-header` extension is placed directly within the JSON Schema of the property to be mirrored, rather than in a separate metadata field outside the schema. This design choice offers several advantages:

1. **Co-location**: The header mapping is defined alongside the property it affects, making it immediately clear which parameter will be mirrored. Developers don't need to cross-reference between the schema and a separate metadata structure.

2. **Established pattern**: JSON Schema explicitly supports extension keywords (properties starting with `x-`), and this pattern is widely used in ecosystems like OpenAPI. Tool authors and SDK developers are already familiar with this approach.

3. **Schema composability**: When schemas are composed, extended, or referenced using `$ref`, the `x-mcp-header` annotation travels with the property definition. A separate metadata structure would require complex synchronization logic to maintain consistency.

4. **Tooling compatibility**: Existing JSON Schema validators ignore unknown keywords by default, so adding `x-mcp-header` doesn't break existing schema validation. Tools that don't understand this extension simply skip it.

5. **Reduced complexity**: A separate metadata structure would require defining a mapping mechanism (e.g., JSON Pointer or property paths) to associate headers with properties, adding implementation complexity and potential for errors.

## Backward Compatibility

### Standard Headers

Existing clients and SDKs will be required to include the standard headers when using the new MCP version. This is a minor addition since clients already include headers like `Mcp-Protocol-Version`, adding only one or two new headers per message.

Servers implementing the new version MUST reject requests missing required headers. Servers MAY support older clients by accepting requests without headers when negotiating an older protocol version.

### Custom Headers from Tool Parameters

This is a new, optional feature. Existing tools without `x-mcp-header` properties continue to work unchanged. Clients that do not support this feature will still function but will not provide the header-based routing benefits.

## Security Implications

### Header Injection

Header injection attacks occur when malicious values containing control characters (especially `\r\n`) are included in headers, potentially allowing attackers to inject additional headers or terminate the header section early.

Clients MUST follow the [Value Encoding](#value-encoding) rules defined in this specification. These rules ensure that:

- Control characters are never included in header values
- Non-ASCII values are safely encoded using Base64
- Values exceeding safe length limits are omitted

### Header Spoofing

Servers MUST validate that header values match the corresponding values in the request body. This prevents clients from sending mismatched headers to manipulate routing while executing different operations.

For example, a malicious client could attempt to:
- Route a request to a less-secured region while executing operations intended for a high-security region
- Bypass rate limits by spoofing tenant identifiers
- Evade security policies by misrepresenting the operation being performed

### Information Disclosure

Tool parameter values designated for headers will be visible to network intermediaries (load balancers, proxies, logging systems). Server developers:

- SHOULD NOT mark sensitive parameters (passwords, API keys, tokens, PII) with `x-mcp-header`
- SHOULD document which parameters are exposed as headers
- SHOULD consider that Base64 encoding provides no confidentiality—it is merely an encoding, not encryption

## Reference Implementation

_To be provided before this SEP reaches Final status._

Implementation requirements:

- **Server SDKs**: Provide a mechanism (attribute/decorator) for marking parameters with `x-mcp-header`
- **Client SDKs**: Implement the client behavior for extracting and encoding header values
- **Validation**: Both sides must validate header/body consistency
