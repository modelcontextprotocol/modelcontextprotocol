# SEP-0000: Standardize Rate-Limiting Errors

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-08-25
- **Author(s)**: Stephen Tyree (@tyree731)
- **Sponsor**: None (seeking sponsor)
- **PR**: None

## Abstract

The current MCP specification recommends clients and servers rate-limit in different circumstances, but has no
protocol-level way to indicate that a request has been rate limited, or to say when to retry.

This SEP standardizes on `-32023` / `RateLimited` from the reserved sub-range, with a typed response indicating when to
retry after, with optional quota fields, binding the response to the HTTP 429 to additionally allow for middleware
proxies to detect this.

## Motivation

There are a couple of reasons for this specification. stdio has no HTTP layer: For the stdio protocol, no header
exchange can occur at present, meaning that relying on the HTTP layer to communicate a rate limit being hit cannot work
with the stdio protocol. The Transports WG, in the current roadmap, has committed to changing the stdio protocol to
speak Streamable HTTP, but there is no timeframe for this as of now.

In addition, the current SDK implementations do not define rate limiting errors, and are inconsistent in how they
surface HTTP 429 errors:

### How Each SDK Surfaces an HTTP 429

| SDK        | HTTP 429 Surfaces As                                                                                                                         | Status Preserved                            | Source                                                                                                                                                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript | `SdkHttpError(SdkErrorCode.ClientHttpNotImplemented, "Error POSTing to endpoint: ...")`                                                      | Yes, as `status` on the error object        | [streamableHttp.ts#L1101](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/client/src/client/streamableHttp.ts#L1101)                                                                                |
| Python     | `ErrorData(code=INTERNAL_ERROR, message="Server returned an error response")` (`-32603`)                                                     | No, collapsed to an internal error          | [streamable_http.py#L370](https://github.com/modelcontextprotocol/python-sdk/blob/main/src/mcp/client/streamable_http.py#L370)                                                                                                |
| C#         | `HttpRequestException` with the response body appended to the message                                                                        | Yes, via `HttpRequestException.StatusCode`  | [HttpResponseMessageExtensions.cs#L22](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/src/Common/HttpResponseMessageExtensions.cs#L22)                                                                          |
| Rust       | `StreamableHttpError::UnexpectedServerResponse("HTTP 429 Too Many Requests: <body>")`                                                        | Formatted text only                         | [streamable_http_client.rs#L302](https://github.com/modelcontextprotocol/rust-sdk/blob/main/crates/rmcp/src/transport/common/reqwest/streamable_http_client.rs#L302)                                                          |
| Java       | `McpTransportException("Invalid request. Status code: 429")`                                                                                 | Message string only                         | [HttpClientStreamableHttpTransport.java#L700](https://github.com/modelcontextprotocol/java-sdk/blob/main/mcp-core/src/main/java/io/modelcontextprotocol/client/transport/HttpClientStreamableHttpTransport.java#L700)         |
| Go         | Classified as transient alongside 500/502/503/504 and wrapped as `jsonrpc2.ErrRejected`, so the connection is preserved                      | `http.StatusText` only                      | [streamable.go#L2824](https://github.com/modelcontextprotocol/go-sdk/blob/main/mcp/streamable.go#L2824), [streamable.go#L2580](https://github.com/modelcontextprotocol/go-sdk/blob/main/mcp/streamable.go#L2580)              |
| Kotlin     | `StreamableHttpError(code = 429, message = body)`                                                                                            | Yes, as a numeric `code` property           | [StreamableHttpClientTransport.kt#L195](https://github.com/modelcontextprotocol/kotlin-sdk/blob/main/kotlin-sdk-client/src/commonMain/kotlin/io/modelcontextprotocol/kotlin/sdk/client/StreamableHttpClientTransport.kt#L195) |
| PHP        | Not detected. `send()` branches only on `Content-Type` and never inspects the status code, so a 429 with a non-JSON body is silently dropped | No                                          | [HttpTransport.php#L165](https://github.com/modelcontextprotocol/php-sdk/blob/main/src/Client/Transport/HttpTransport.php#L165)                                                                                               |
| Ruby       | Falls to the `Faraday::Error` catch-all, raising `RequestHandlerError(error_type: :internal_error)`                                          | Only via `original_error.response[:status]` | [http.rb#L509](https://github.com/modelcontextprotocol/ruby-sdk/blob/main/lib/mcp/client/http.rb#L509)                                                                                                                        |
| Swift      | `MCPError.internalError("Too many requests")`                                                                                                | No, mapped to a fixed string                | [HTTPClientTransport.swift#L418](https://github.com/modelcontextprotocol/swift-sdk/blob/main/Sources/MCP/Base/Transports/HTTPClientTransport.swift#L418)                                                                      |

This inconsistency means that clients cannot reliably report or detect rate limits being hit across implementations.

## Specification

If a user has sent too many requests in a given amount of time, and the server wishes to indicate
this, the server MUST return a JSON-RPC error response. For HTTP, the response status code MUST
be `429 Too Many Requests`. The error MUST conform to the following structure:

```ts
export const RATE_LIMITED = -32023;

export interface RateLimitedError extends Omit<JSONRPCErrorResponse, "error"> {
  error: Error & {
    code: typeof RATE_LIMITED;
    data: {
      /** Milliseconds the client SHOULD wait before retrying. @minimum 0 */
      retryAfterMs: number;
      /** Requests permitted in the current window. @minimum 0 */
      limit?: number;
      /** Requests remaining in the current window. @minimum 0 */
      remaining?: number;
    };
  };
}
```

Rules for different parties in the protocol to follow:

| ID   | Party  | Rule                                                                                                                                                    |
| ---- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RL-1 | Server | Servers **MUST** include `retryAfterMs` in `error.data` whenever they emit `-32023`.                                                                    |
| RL-2 | Server | For HTTP, servers **MUST** respond with status `429 Too Many Requests`.                                                                                 |
| RL-3 | Server | For HTTP, servers **SHOULD** set an integer decimal `Retry-After` header consistent with `retryAfterMs`.                                                |
| RL-4 | Server | For HTTP, servers **MUST** set an integer decimal `RateLimit-Limit` header consistent with `limit`, if `limit` is set.                                  |
| RL-5 | Server | For HTTP, servers **MUST** set an integer decimal `RateLimit-Remaining` header consistent with `remaining`, if `remaining` is set.                      |
| RL-6 | Server | Servers **MUST NOT** emit `-32023` for a rate limit encountered by an upstream API inside a tool; those remain tool execution errors (`isError: true`). |
| RL-7 | Client | Clients **SHOULD** apply jitter to the retry delay.                                                                                                     |
| RL-8 | Client | Clients **SHOULD** clamp implausibly large `retryAfterMs` values to a locally configured maximum.                                                       |
| RL-9 | Client | When both a `Retry-After` header and `retryAfterMs` are present, clients **MUST** use `retryAfterMs`.                                                   |

## Rationale

### Is this an error?

Yes. For much the same reason that `InvalidParamsError` is an error, namely that the client has made a mistake which
it needs to respond to, `RateLimitedError` communicates that the client has requested the server too rapidly, and needs
to back off appropriately.

### Why milliseconds for retryAfterMs?

The [Retry-After](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Retry-After) HTTP header supports
both a decimal integer for its value, in addition to an [HTTP date](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Date),
so it's worth asking why we would use milliseconds here. The rationale is that other SEPs have standardized on
milliseconds for their post-dated timings, such as [SEP-2549](./2549-TTL-for-list-results.md), so we do so for
consistency.

### Related SEPs

- [SEP-1699](./1699-support-sse-polling-via-server-side-disconnect.md): Support SSE polling via server-side disconnect
- [SEP-2243](./2243-http-standardization.md): HTTP Header Standardization for Streamable HTTP Transport
- [SEP-2549](./2549-TTL-for-list-results.md): TTL for List Results
- [SEP-2663](./2663-tasks-extension.md): Tasks Extension

## Backward Compatibility

The error code being used here is within the range of reserved codes for the MCP specification, so no existing client
should be relying on it. Older clients will see the same error shape they have previously with HTTP 429 errors, so only
clients which have implemented custom request and response handling using HTTP 429 errors will need to consider the new
response shape.

## Security Implications

- `retryAfterMs` is an attacker-controlled input to a client, allowing a malicious or compromised server to pin a client
  down for an arbitrary amount of time. Clients **SHOULD** clamp the `retryAfterMs` to reasonable local maximums
- Synchronized retries after identical `retryAfterMs` can lead to the thundering herd problem. Clients **SHOULD** apply
  jitter to the returned `retryAfterMs` value in order to mitigate this.
- `limit` / `remaining` are information oracles for fingerprinting and quota enumeration. Servers **MAY** omit these
  values as they see fit.

## Reference Implementation

TBD.
