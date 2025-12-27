# SEP-2009: Payment Support for MCP Servers

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2025-12-23
- **Author(s)**: shivankgoel
- **Sponsor**: LucaButBoring
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2007

## Abstract

This SEP introduces payment capabilities to the Model Context Protocol (MCP), enabling MCP servers to request payment for premium features, usage-based billing, or access to restricted resources. The specification defines a protocol-agnostic framework that supports multiple payment methods, with X402 Protocol v2 as the first supported payment protocol. The framework includes payment discovery, challenge/response flows, and secure payment verification mechanisms.

## Motivation

As MCP adoption grows, there is increasing demand for monetization capabilities that allow server operators to:

1. **Offer Premium Services**: Provide enhanced functionality or higher-quality responses for paying users
2. **Implement Usage-Based Billing**: Charge based on actual tool usage, API calls, or resource consumption
3. **Control Access to Expensive Resources**: Gate access to costly third-party APIs or compute-intensive operations
4. **Support Sustainable Development**: Enable developers to monetize their MCP servers and continue improving them

Current MCP implementations lack standardized payment mechanisms, leading to:

- **Fragmented Solutions**: Each server implements custom payment flows, reducing interoperability
- **Poor User Experience**: Inconsistent payment interfaces across different MCP servers
- **Security Concerns**: Ad-hoc payment implementations may lack proper security measures
- **Limited Adoption**: Difficulty monetizing MCP servers reduces incentives for development

A standardized payment framework addresses these issues by:

- Providing consistent payment flows across all MCP implementations
- Supporting multiple payment protocols to accommodate different use cases
- Ensuring security through protocol-specific best practices
- Enabling seamless integration with existing payment infrastructure

## Specification

### 1. Core Payment Framework

#### 1.1 Payment Discovery

MCP servers that support payments **SHOULD** provide payment metadata through the `payments/list` JSON-RPC method. This metadata includes:

- Supported payment protocols and their versions
- Protocol-specific payment schemes and parameters
- Optional terms of service and privacy policy links

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "payments/list",
  "params": {}
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocols": {
      "x402": {
        "version": 2,
        "schemes": ["eip155:8453", "eip155:1"],
        "description": "X402 Protocol v2 for micropayments"
      }
    },
    "terms": "https://example.com/terms",
    "privacy": "https://example.com/privacy"
  }
}
```

#### 1.2 Payment Challenge Flow

When payment is required for a tool invocation, servers **MUST** return error code `-32803` with protocol-specific payment information:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32803,
    "message": "Payment Required",
    "data": {
      "protocol": "x402",
      "paymentInfo": {
        // Protocol-specific payment information
      }
    }
  }
}
```

#### 1.3 Payment Processing

Clients **MUST** implement protocol-specific payment handling based on the `protocol` field. After successful payment, clients include payment proof in protocol-specific headers when retrying the tool invocation.

#### 1.4 Payment Verification

Servers **MUST** verify payment proofs through protocol-specific facilitators before granting access to paid tools.

#### 1.5 Settlement Response

Servers **SHOULD** include protocol-specific settlement information in successful responses and **MUST** include settlement details in payment failure responses to provide confirmation and audit trail details.

### 2. X402 Protocol Support

#### 2.1 Protocol Selection

X402 Protocol v2 is the **recommended** payment protocol for MCP implementations due to:

- Mature specification with proven security model
- Support for multiple blockchain networks
- Built-in facilitator ecosystem
- Cryptographic payment proofs

#### 2.2 X402 Integration

For X402 payments:

- Use base64-encoded `X-Payment` header for payment proofs
- Support the `exact` scheme for tool-based payments
- Integrate with X402-compliant facilitators for settlement verification
- Follow X402 security best practices

#### 2.3 X402 Payment Structure

```json
{
  "x402Version": 2,
  "error": "Payment required for premium API access",
  "resource": {
    "url": "https://api.example.com/premium-data",
    "description": "Access to premium market data",
    "mimeType": "application/json"
  },
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:8453",
      "amount": "10000",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "payTo": "0xReceiverAddress",
      "maxTimeoutSeconds": 60,
      "extra": {
        "name": "USDC",
        "version": "2"
      }
    }
  ],
  "extensions": {}
}
```

### 3. Security Requirements

#### 3.1 Error Handling

Payment implementations **MUST** handle various error scenarios with appropriate JSON-RPC error responses:

- **Payment Required (-32803)**: Tool requires payment with structured payment information
- **Payment Settlement Failed (-32803)**: Payment processing failed with settlement details
- **Invalid Payment Proof (-32602)**: Malformed payment data or invalid parameters
- **Payment Timeout (-32603)**: Payment verification timeout or facilitator unavailable
- **Unsupported Protocol (-32601)**: Payment protocol not supported by server
- **Internal Payment Error (-32603)**: Server-side payment processing errors

#### 3.2 Resource Identification

Payment-related resources **SHOULD** use MCP-specific URI schemes:

- Tools: `mcp://tool/{tool_name}`
- Resources: `mcp://resource/{resource_name}`
- Prompts: `mcp://prompt/{prompt_name}`

#### 3.3 General Security

All implementations **MUST**:

- Use secure communication channels (HTTPS for HTTP transport)
- Integrate only with trusted, protocol-compliant facilitators
- Verify all payment proofs through designated facilitators
- Maintain comprehensive audit logs of payment activities

#### 3.4 Privacy Protection

Implementations **MUST** protect user privacy by:

- Collecting only necessary payment information as defined by the protocol
- Relying on facilitator privacy policies for payment data
- Minimizing local storage of payment-related information
- Following applicable privacy regulations

## Rationale

## Rationale

### Design Decisions

**Protocol-Agnostic Framework**: Supports multiple payment methods rather than a single protocol to enable future-proofing, broader market adoption, and risk mitigation across different payment ecosystems.

**X402 as First Protocol**: Chosen for its maturity, decentralization, cryptographic proofs, and existing ecosystem, making it ideal for initial implementation while maintaining protocol flexibility.

**JSON-RPC Integration**: Uses `payments/list` method for discovery and `-32803` error code for payment requirements to maintain transport-agnostic design and consistency with MCP's JSON-RPC approach.

**Structured Payment Proofs**: Uses JSON structure in `paymentProof` field rather than base64 encoding to improve developer experience, debugging capabilities, and protocol consistency while maintaining transport independence.

- **Debugging**: Payment details are human-readable in logs and network traces
- **Validation**: JSON schema validation can verify payment structure correctness
- **Tooling**: Better IDE support, type checking, and documentation generation
- **Transparency**: Clear visibility into what payment data is being transmitted

#### Protocol Consistency

- **MCP Philosophy**: Follows MCP's structured JSON approach throughout the protocol
- **JSON-RPC Alignment**: Consistent with JSON-RPC patterns of structured data over opaque blobs
- **Future Extensions**: Easier to add new fields or modify payment structures

#### X402 Proxy Considerations

While MCP servers proxying X402 endpoints need to convert JSON to base64 headers, this conversion is minimal:

```javascript
// Simple conversion for X402 proxying
const x402Header = btoa(JSON.stringify(paymentProof.proof));
headers["X-Payment"] = x402Header;
```

The trivial nature of this conversion (a single line of base64 encoding) does not justify sacrificing the significant developer experience benefits of structured JSON. Most programming languages provide built-in base64 encoding, and this conversion can be abstracted into helper libraries for common use cases.

## Backward Compatibility

This specification is fully backward compatible with existing MCP implementations:

- **Optional Implementation**: Payment support is entirely optional
- **Graceful Degradation**: Legacy clients see payment errors as standard JSON-RPC errors
- **No Breaking Changes**: Existing implementations require no modifications

## Reference Implementation

A reference implementation will include:

1. **Server Library**: Payment integration for MCP servers with X402 support
2. **Client Library**: Payment handling for MCP clients with wallet integration
3. **Example Server**: Demonstration server with paid tools
4. **Example Client**: Demonstration client with payment UI
5. **Documentation**: Integration guides and best practices

The reference implementation will be provided in TypeScript/JavaScript to align with the existing MCP ecosystem.

## Client Implementation

MCP clients **SHOULD** provide a payment hook interface to enable custom payment integration:

```typescript
interface PaymentHook {
  handlePayment(protocol: string, paymentInfo: any): Promise<PaymentResult>;
}
```

This allows client builders to integrate their preferred payment methods without modifying the core MCP client implementation.

## References

- [SEP-1649: MCP Server Cards](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1649) - HTTP Server Discovery via .well-known
- [X402 Protocol Specification v2](https://github.com/coinbase/x402/blob/main/specs/x402-specification-v2.md)
- [X402 Exact Scheme Specification](https://github.com/coinbase/x402/blob/main/specs/schemes/exact/scheme_exact.md)
- [HTTP/1.1 Status Code 402](https://datatracker.ietf.org/doc/html/rfc9110#section-15.5.3)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
- [RFC 8615: Well-Known URIs](https://datatracker.ietf.org/doc/html/rfc8615)
