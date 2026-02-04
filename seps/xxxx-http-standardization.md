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

**Client Requirement**: While the use of `x-mcp-header` is optional for servers, clients MUST support this feature. When a server's tool definition includes `x-mcp-header` annotations, conforming clients MUST mirror the designated parameter values into HTTP headers as specified in this document.

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

**Whitespace Handling**

HTTP parsers typically trim leading and trailing whitespace from header values. To preserve leading and trailing spaces in parameter values, clients MUST use Base64 encoding when the value:

- Starts with a space (0x20) or horizontal tab (0x09)
- Ends with a space (0x20) or horizontal tab (0x09)

**Encoding Rules**

Clients MUST apply the following encoding rules in order:

1. **Type conversion**: Convert the parameter value to its string representation:
   - `string`: Use the value as-is
   - `number`: Convert to decimal string representation (e.g., `42`, `3.14`)
   - `boolean`: Convert to lowercase `"true"` or `"false"`

2. **Whitespace check**: If the string starts or ends with whitespace (space or tab):
   - Apply Base64 encoding (see below)

3. **ASCII validation**: Check if the string contains only valid ASCII characters (0x20-0x7E):
   - If valid, proceed to step 4
   - If invalid (contains non-ASCII characters), apply Base64 encoding (see below)

4. **Control character check**: If the string contains any control characters (0x00-0x1F or 0x7F):
   - Apply Base64 encoding (see below)

5. **Length validation**: If the encoded value exceeds 8192 bytes, the client MUST omit the header and MAY log a warning

**Base64 Encoding for Unsafe Values**

When a value cannot be safely represented as a plain ASCII header value, clients MUST use Base64 encoding with the following format:

```
Mcp-Param-{Name}: =?base64?{Base64EncodedValue}?=
```

The prefix `=?base64?` and suffix `?=` indicate that the value is Base64-encoded. Servers and intermediaries that need to inspect these values MUST decode them accordingly.

**Examples**:

| Original Value | Reason | Encoded Header Value |
|----------------|--------|---------------------|
| `"us-west1"` | Plain ASCII | `Mcp-Param-Region: us-west1` |
| `"Hello, 世界"` | Contains non-ASCII | `Mcp-Param-Greeting: =?base64?SGVsbG8sIOS4lueVjA==?=` |
| `" padded "` | Leading/trailing spaces | `Mcp-Param-Text: =?base64?IHBhZGRlZCA=?=` |
| `"line1\nline2"` | Contains newline | `Mcp-Param-Text: =?base64?bGluZTEKbGluZTI=?=` |

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

The `x-mcp-header` extension is optional for servers. Existing tools without this property continue to work unchanged. However, clients implementing the MCP version that includes this specification MUST support the feature. Older clients that do not support `x-mcp-header` will still function but will not provide the header-based routing benefits that servers may depend on.

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

## Conformance Test Cases

This section defines edge cases that conformance tests MUST cover to ensure interoperability between implementations.

### Standard Header Edge Cases

#### Case Sensitivity

| Test Case | Input | Expected Behavior |
|-----------|-------|-------------------|
| Header name case variation | `mcp-method: tools/call` | Server MUST accept (header names are case-insensitive) |
| Header name mixed case | `MCP-METHOD: tools/call` | Server MUST accept |
| Method value case | `Mcp-Method: TOOLS/CALL` | Server MUST reject (method values are case-sensitive) |

#### Header/Body Mismatch

| Test Case | Header Value | Body Value | Expected Behavior |
|-----------|--------------|------------|-------------------|
| Method mismatch | `Mcp-Method: tools/call` | `"method": "prompts/get"` | Server MUST reject with 400 |
| Tool name mismatch | `Mcp-Tool-Name: foo` | `"params": {"name": "bar"}` | Server MUST reject with 400 |
| Missing required header | (no `Mcp-Method`) | Valid body | Server MUST reject with 400 |
| Extra whitespace in header | `Mcp-Tool-Name:  foo ` | `"params": {"name": "foo"}` | Server MUST accept (trim whitespace per HTTP spec) |

#### Special Characters in Values

| Test Case | Value | Expected Behavior |
|-----------|-------|-------------------|
| Tool name with hyphen | `my-tool-name` | Client sends as-is; server accepts |
| Tool name with underscore | `my_tool_name` | Client sends as-is; server accepts |
| Resource URI with special chars | `file:///path/to/file%20name.txt` | Client sends as-is; server accepts |
| Resource URI with query string | `https://example.com/resource?id=123` | Client sends as-is; server accepts |

### Custom Header Edge Cases

#### x-mcp-header Name Conflicts

| Test Case | Schema | Expected Behavior |
|-----------|--------|-------------------|
| Duplicate header names (same case) | Two properties with `"x-mcp-header": "Region"` | Server MUST reject tool definition |
| Duplicate header names (different case) | `"x-mcp-header": "Region"` and `"x-mcp-header": "REGION"` | Server MUST reject tool definition (case-insensitive uniqueness) |
| Header name matches standard header | `"x-mcp-header": "Method"` | Allowed (produces `Mcp-Param-Method`, not `Mcp-Method`) |
| Empty header name | `"x-mcp-header": ""` | Server MUST reject tool definition |

#### Invalid x-mcp-header Values

| Test Case | x-mcp-header Value | Expected Behavior |
|-----------|-------------------|-------------------|
| Contains space | `"x-mcp-header": "My Region"` | Server MUST reject tool definition |
| Contains colon | `"x-mcp-header": "Region:Primary"` | Server MUST reject tool definition |
| Contains non-ASCII | `"x-mcp-header": "Région"` | Server MUST reject tool definition |
| Contains control character | `"x-mcp-header": "Region\t1"` | Server MUST reject tool definition |

#### Value Encoding Edge Cases

| Test Case | Parameter Value | Expected Header Value |
|-----------|-----------------|----------------------|
| Plain ASCII string | `"us-west1"` | `Mcp-Param-Region: us-west1` |
| String with leading space | `" us-west1"` | `Mcp-Param-Region: =?base64?IHVzLXdlc3Qx?=` |
| String with trailing space | `"us-west1 "` | `Mcp-Param-Region: =?base64?dXMtd2VzdDEg?=` |
| String with leading/trailing spaces | `" us-west1 "` | `Mcp-Param-Region: =?base64?IHVzLXdlc3QxIA==?=` |
| String with internal spaces only | `"us west 1"` | `Mcp-Param-Region: us west 1` |
| Boolean true | `true` | `Mcp-Param-Flag: true` |
| Boolean false | `false` | `Mcp-Param-Flag: false` |
| Integer | `42` | `Mcp-Param-Count: 42` |
| Floating point | `3.14159` | `Mcp-Param-Value: 3.14159` |
| Non-ASCII characters | `"日本語"` | `Mcp-Param-Text: =?base64?5pel5pys6Kqe?=` |
| String with newline | `"line1\nline2"` | `Mcp-Param-Text: =?base64?bGluZTEKbGluZTI=?=` |
| String with carriage return | `"line1\r\nline2"` | `Mcp-Param-Text: =?base64?bGluZTENCmxpbmUy?=` |
| String with leading tab | `"\tindented"` | `Mcp-Param-Text: =?base64?CWluZGVudGVk?=` |
| Empty string | `""` | `Mcp-Param-Name: ` (empty value) |
| String exceeding length limit | 10000 character string | Client MUST omit header |

#### Type Restriction Violations

| Test Case | Property Type | x-mcp-header Present | Expected Behavior |
|-----------|---------------|---------------------|-------------------|
| Array type | `"type": "array"` | Yes | Server MUST reject tool definition |
| Object type | `"type": "object"` | Yes | Server MUST reject tool definition |
| Null type | `"type": "null"` | Yes | Server MUST reject tool definition |
| Nested property | Property inside object | Yes | Server MUST reject tool definition |

### Server Validation Edge Cases

#### Base64 Decoding

| Test Case | Header Value | Expected Behavior |
|-----------|--------------|-------------------|
| Valid Base64 | `=?base64?SGVsbG8=?=` | Server decodes to `"Hello"` and validates |
| Invalid Base64 padding | `=?base64?SGVsbG8?=` | Server MUST reject with 400 |
| Invalid Base64 characters | `=?base64?SGVs!!!bG8=?=` | Server MUST reject with 400 |
| Missing prefix | `SGVsbG8=` | Server treats as literal value, not Base64 |
| Missing suffix | `=?base64?SGVsbG8=` | Server treats as literal value, not Base64 |
| Malformed wrapper | `=?BASE64?SGVsbG8=?=` | Server MUST accept (case-insensitive prefix) |

#### Null and Missing Values

| Test Case | Scenario | Expected Behavior |
|-----------|----------|-------------------|
| Parameter with x-mcp-header is null | `"region": null` | Client MUST omit header |
| Parameter with x-mcp-header is missing | Parameter not in arguments | Client MUST omit header |
| Optional parameter present | Optional parameter provided | Client MUST include header |

## Reference Implementation

_To be provided before this SEP reaches Final status._

Implementation requirements:

- **Server SDKs**: Provide a mechanism (attribute/decorator) for marking parameters with `x-mcp-header`
- **Client SDKs**: Implement the client behavior for extracting and encoding header values
- **Validation**: Both sides must validate header/body consistency
