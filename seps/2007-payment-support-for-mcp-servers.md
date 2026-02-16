# SEP-2007: Payment Support for MCP Servers

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2025-12-23
- **Author(s)**: shivankgoel
- **Sponsor**: LucaButBoring
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2007

## Abstract

This SEP adds payment support to MCP, enabling servers to charge for tool invocations. The specification defines a protocol-agnostic framework supporting multiple payment methods (X402 for blockchain, traditional processors for fiat). It includes capability declaration, tool-based payment discovery, standardized payment challenges (error `-32402`), and payment verification flows.

## Motivation

MCP currently lacks a standardized way for servers to request payment for tool invocations. This creates:

- **Fragmentation**: Each server implements custom payment flows, reducing interoperability
- **Inconsistency**: No standard way for clients to discover pricing or handle payment challenges
- **Security Risks**: Ad-hoc implementations may lack proper security measures

This specification provides:

- **Standard Discovery**: Tools advertise payment requirements in `tools/list`
- **Protocol Flexibility**: Support for multiple payment methods (crypto, fiat, future protocols)
- **Consistent Flow**: Unified error codes and payment challenge/response patterns
- **Security**: Protocol-specific best practices and verification requirements

## Specification

### 1. Core Payment Framework

#### 1.1 Capability Declaration

Servers that support payments **MAY** declare the `payment` capability during initialization:

```json
{
  "capabilities": {
    "payment": {
      "protocols": ["x402"]
    }
  }
}
```

The `protocols` field lists the payment protocols supported by the server.

Declaring the `payment` capability is **OPTIONAL**. Clients can discover payment support by examining the `payment` field in tool definitions from `tools/list`. However, declaring this capability provides clients with upfront knowledge of payment support and available protocols before fetching the full tool list.

Servers **MUST** include payment information in tool definitions regardless of whether they declare the `payment` capability.

#### 1.2 Tool-Based Payment Discovery

MCP servers that support payments **MUST** include payment information directly in tool definitions returned by `tools/list`.

**Example tools/list response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "get_premium_weather",
        "description": "Get detailed weather analysis ($0.01)",
        "inputSchema": {
          "type": "object",
          "properties": {
            "location": { "type": "string" }
          }
        },
        "payment": [
          {
            "protocol": "x402",
            "paymentRequired": {
              /* X402 payment configuration - see section 2.2 for details */
            }
          }
        ]
      }
    ]
  }
}
```

#### 1.3 Payment Challenge Flow

When payment is required for a tool invocation, servers **MUST** return error code `-32402` with protocol-specific payment information.

**Source of Truth**: If there are any discrepancies between the payment amounts or requirements advertised in `tools/list` and those returned in the `-32402` error response, the error response **MUST** be treated as the authoritative source of truth. The payment information in `tools/list` is primarily for LLM context to help agents make informed decisions about tool selection, while the error response contains the actual payment requirements that must be satisfied for tool execution.

**Example payment challenge error:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32402,
    "message": "Payment Required",
    "data": {
      "payment": [
        {
          "protocol": "x402",
          "paymentRequired": {
            /* Same structure as in tools/list - see section 1.2 */
          }
        }
      ]
    }
  }
}
```

The `payment` field structure in error responses is identical to the structure in `tools/list`.

#### 1.4 Payment Request Processing

Clients **MUST** implement protocol-specific payment handling based on the `protocol` field. After obtaining payment authorization, clients include it in the `payment` field when retrying the tool invocation:

**Generic payment request structure:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "tool_name",
    "arguments": {
      /* tool arguments */
    },
    "payment": {
      "protocol": "protocol_identifier",
      "paymentInput": {
        /* Protocol-specific payment authorization */
      }
    }
  }
}
```

The `paymentInput` field contains protocol-specific authorization data. See section 2.3 for X402-specific examples.

#### 1.5 Payment Verification and Settlement

Servers **MUST**:

1. Parse payment authorization from the `payment` field according to the protocol specification
2. Verify payment authorization through protocol-specific payment providers
3. Execute the tool only after authorization is verified
4. Settle payment via payment provider
5. Return tool result with payment information

**Generic successful response structure:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      /* tool result */
    ],
    "isError": false,
    "payment": {
      "protocol": "protocol_identifier",
      "paymentOutput": {
        /* Protocol-specific payment result */
      }
    }
  }
}
```

The `paymentOutput` field contains protocol-specific payment result data. See section 2.3 for X402-specific examples.

### 2. X402 Protocol Support

#### 2.1 Protocol Selection

X402 Protocol v2 is the **recommended** payment protocol for MCP implementations due to:

- Mature specification with proven security model
- Support for multiple blockchain networks (EVM, Solana)
- Built-in payment provider ecosystem
- Cryptographic signature-based authorization

#### 2.2 X402 Integration

For complete X402 protocol details, including:

- Payment scheme specifications (exact, deferred, etc.)
- Network-specific implementations (EVM, Solana)
- Payment Provider interface requirements (`/verify`, `/settle`, `/supported` endpoints)
- Security considerations and replay attack prevention
- Discovery APIs and Bazaar integration

Please refer to the [X402 Protocol Specification v2](https://github.com/coinbase/x402/blob/main/specs/x402-specification-v2.md).

**MCP Integration**: When using X402 with MCP:

1. **Tool Payment Configuration**: Include X402 payment requirements in the tool's `payment` field
2. **Payment Request Structure**: Use the X402 `PaymentPayload` schema in the `payment.paymentInput.authorization` field
3. **Settlement Response**: Return X402 `PaymentResponse` data in the `payment.paymentOutput.payment` field

The X402 specification is the source of truth for all X402-specific structures, validation rules, and processing procedures.

#### 2.3 X402 Payment Examples

**X402 Payment Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_premium_weather",
    "arguments": {
      "location": "New York"
    },
    "payment": {
      "protocol": "x402",
      "paymentInput": {
        "authorization": {
          "x402Version": 2,
          "resource": {
            "url": "mcp://tool/get_premium_weather",
            "description": "Premium weather data tool",
            "mimeType": "application/json"
          },
          "accepted": {
            "scheme": "exact",
            "network": "eip155:84532",
            "amount": "10000",
            "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
            "maxTimeoutSeconds": 60,
            "extra": {
              "name": "USDC",
              "version": "2"
            }
          },
          "payload": {
            "signature": "0x2d6a7588d6acca505cbf0d9a4a227e0c52c6c34008c8e8986a1283259764173608a2ce6496642e377d6da8dbbf5836e9bd15092f9ecab05ded3d6293af148b571c",
            "authorization": {
              "from": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
              "to": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
              "value": "10000",
              "validAfter": "1740672089",
              "validBefore": "1740672154",
              "nonce": "0xf3746613c2d920b5fdabc0856f2aeb2d4f88ee6037b8cc5d04a71a4462f13480"
            }
          },
          "extensions": {}
        }
      }
    }
  }
}
```

**X402 Payment Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "The current weather in New York is 72°F with clear skies."
      }
    ],
    "isError": false,
    "payment": {
      "protocol": "x402",
      "paymentOutput": {
        "result": {
          "success": true,
          "transaction": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          "network": "eip155:84532",
          "payer": "0x14cE5605DD37502755D6308Bfef5B99363327D4b"
        }
      }
    }
  }
}
```

#### 2.4 X402 Payment Flow

The X402 payment flow in MCP:

1. Client discovers tool with payment requirements via `tools/list`
2. Client invokes tool without payment (optional)
3. Server returns payment required error (-32402) with X402 payment info
4. Client signs payment authorization (not a completed payment)
5. Client retries tool call with signed authorization in `payment` field
6. Server verifies authorization via X402 payment provider
7. Server executes tool after authorization is valid
8. Server settles payment via payment provider
9. Server returns tool result with payment confirmation (txHash)

### 3. Security Requirements

#### 3.1 Error Handling

Payment implementations use error code `-32402` for payment-related errors:

- **Payment Required**: Tool requires payment (initial challenge)
- **Payment Settlement Failed**: Payment processing failed (insufficient funds, network error, etc.)

The error response includes structured payment information with protocol-specific requirements.

#### 3.2 Resource Identification

Payment-related resources **SHOULD** use MCP-specific URI schemes:

- Tools: `mcp://tool/{tool_name}`
- Resources: `mcp://resource/{resource_name}`
- Prompts: `mcp://prompt/{prompt_name}`

#### 3.3 Protocol-Specific Security

##### X402 Security Model

The X402 protocol provides security through:

1. **Cryptographic Signatures**: Payment schemes use cryptographic verification
2. **Payment Provider Mediation**: Trusted payment providers handle payment verification
3. **Time-Limited Challenges**: Payment challenges include expiration times
4. **Scheme-Specific Security**: Each X402 scheme implements appropriate security measures

#### 3.4 General Security

All implementations **MUST**:

- Use secure communication channels (HTTPS for HTTP transport)
- Integrate only with trusted, protocol-compliant payment providers
- Verify all payment authorizations through designated payment providers
- Maintain comprehensive audit logs of payment activities

#### 3.4 Privacy Protection

Implementations **MUST** protect user privacy by:

- Collecting only necessary payment information as defined by the protocol
- Relying on payment provider privacy policies for payment data
- Minimizing local storage of payment-related information
- Following applicable privacy regulations

## Rationale

### Design Decisions

**Protocol-Agnostic Framework**: Supports multiple payment methods rather than a single protocol to enable future-proofing, broader market adoption, and risk mitigation across different payment ecosystems.

**X402 as First Protocol**: Chosen for its maturity, decentralization, cryptographic signatures, and existing ecosystem, making it ideal for initial implementation while maintaining protocol flexibility.

**Tool-Based Payment Discovery**: Payment information is included directly in `tools/list` responses rather than a separate `payments/list` endpoint because:

- **Transparent Pricing**: LLMs and clients see costs upfront for each tool
- **Per-Tool Pricing**: Different tools can have different payment requirements and amounts
- **Multiple Payment Options**: Each tool can accept multiple protocols or payment configurations
- **Intelligent Decision Making**: LLMs can factor in costs when selecting which tools to use
- **Simpler API**: Reduces the number of endpoints clients need to call

**Transport-Agnostic Payment Field**: Uses the `payment` field in tool call parameters rather than transport-specific headers because:

- **Universal Compatibility**: Works with HTTP, STDIO, SSE, and future transports
- **JSON-RPC Consistency**: Follows MCP's structured JSON approach throughout the protocol
- **Better Developer Experience**: Payment details are human-readable in logs and network traces
- **Type Safety**: JSON schema validation can verify payment structure correctness
- **Tooling Support**: Better IDE support, type checking, and documentation generation

**Structured Payment Request**: Uses JSON structure in `payment.paymentInput` field rather than base64 encoding to improve:

- **Debugging**: Payment details are human-readable in logs and network traces
- **Validation**: JSON schema validation can verify payment structure correctness
- **Tooling**: Better IDE support, type checking, and documentation generation
- **Transparency**: Clear visibility into what payment data is being transmitted

**Payment Provider Integration**: The specification refers to protocol-specific documentation (e.g., X402 spec) for payment provider API details rather than duplicating them, keeping the MCP spec protocol-agnostic and maintainable.

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

MCP clients **SHOULD** provide a payment hook interface to enable custom payment integration. This allows client builders to integrate their preferred payment methods without modifying the core MCP client implementation.

### Payment Hook Interface

```typescript
type PaymentOption = {
  protocol: string;
  paymentRequired: unknown;
};

type PaymentSelection =
  | { type: "abort" }
  | { type: "select"; protocol: string };

interface PaymentHooks {
  /**
   * Called when a tool requires payment.
   * Allows selection of preferred payment protocol or aborting the operation.
   *
   * @param toolName - Name of the tool requiring payment
   * @param paymentOptions - Available payment options from the server
   * @returns Selected protocol or abort decision
   */
  onPaymentRequested(
    toolName: string,
    paymentOptions: PaymentOption[],
  ): Promise<PaymentSelection>;

  /**
   * Called when payment processing fails.
   * Allows error handling, retry logic, or fallback strategies.
   *
   * @param toolName - Name of the tool that failed
   * @param protocol - Payment protocol that was attempted
   * @param error - Error information from the payment response
   */
  onPaymentError(
    toolName: string,
    protocol: string,
    error: unknown,
  ): Promise<void>;

  /**
   * Called when payment is successfully processed.
   * Useful for audit logging, spend tracking, and analytics.
   *
   * @param toolName - Name of the tool that was paid for
   * @param protocol - Payment protocol that was used
   * @param paymentResult - Payment result information from the payment response
   */
  onPaymentSuccess(
    toolName: string,
    protocol: string,
    paymentResult: unknown,
  ): Promise<void>;
}
```

## References

- [SEP-1649: MCP Server Cards](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1649) - HTTP Server Discovery via .well-known
- [X402 Protocol Specification v2](https://github.com/coinbase/x402/blob/main/specs/x402-specification-v2.md)
- [X402 Exact Scheme Specification](https://github.com/coinbase/x402/blob/main/specs/schemes/exact/scheme_exact.md)
- [HTTP/1.1 Status Code 402](https://datatracker.ietf.org/doc/html/rfc9110#section-15.5.3)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
- [RFC 8615: Well-Known URIs](https://datatracker.ietf.org/doc/html/rfc8615)
