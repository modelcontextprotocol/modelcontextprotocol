# SEP-0000: Payment Support for MCP Servers

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2024-12-18
- **Author(s)**: shivankgoel
- **Sponsor**: None (seeking sponsor)
- **PR**: #0000

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

MCP servers that support payments **SHOULD** provide payment metadata through a well-known endpoint at `/.well-known/mcp-payment`. This metadata includes:

- Supported payment protocols and their versions
- Protocol-specific payment schemes and parameters
- Optional terms of service and privacy policy links

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
  "x402Version": 1,
  "description": "Access to premium API endpoint",
  "accepts": [
    {
      "network": "eip155:8453",
      "chainName": "Base",
      "scheme": "exact",
      "payTo": "0xReceiverAddress",
      "price": "0.50",
      "asset": "USDC",
      "facilitatorUrl": "https://x402.org/facilitator"
    }
  ]
}
```

### 3. Transport Support

#### 3.1 HTTP Transport

HTTP-based implementations **SHOULD** conform to this specification using:
- Well-known endpoints for payment discovery
- HTTP headers for payment proofs
- Standard JSON-RPC error responses

#### 3.2 STDIO Transport

STDIO implementations **MAY** implement payment handling by:
- Adapting error response format to JSON-RPC without HTTP headers
- Including payment proofs in subsequent request parameters
- Following protocol-specific security practices

#### 3.3 Alternative Transports

Other transport mechanisms **MUST** follow established payment security best practices for their protocol while maintaining the core payment flow structure.

### 4. Security Requirements

#### 4.1 General Security

All implementations **MUST**:
- Use secure communication channels (HTTPS for HTTP transport)
- Integrate only with trusted, protocol-compliant facilitators
- Verify all payment proofs through designated facilitators
- Maintain comprehensive audit logs of payment activities

#### 4.2 Privacy Protection

Implementations **MUST** protect user privacy by:
- Collecting only necessary payment information as defined by the protocol
- Relying on facilitator privacy policies for payment data
- Minimizing local storage of payment-related information
- Following applicable privacy regulations

### 5. Extensibility

#### 5.1 Future Payment Protocols

The framework is designed to support additional payment protocols including:
- Traditional payment processors
- Other blockchain-based payment protocols
- Digital wallet systems
- Subscription-based payment models

#### 5.2 Protocol Registration

New payment protocols can be added by:
- Defining protocol-specific sections in the well-known metadata
- Specifying unique protocol identifiers
- Documenting payment flow and security requirements
- Providing reference implementations

## Rationale

### Why Protocol-Agnostic Design?

A protocol-agnostic framework provides several advantages:

1. **Future-Proofing**: New payment methods can be added without changing the core specification
2. **Flexibility**: Different use cases can choose appropriate payment protocols
3. **Adoption**: Existing payment infrastructure can be integrated more easily
4. **Competition**: Multiple payment protocols encourage innovation and better user experience

### Why X402 as the First Protocol?

X402 was chosen as the initial protocol because:

1. **Maturity**: Well-defined specification with security considerations
2. **Decentralization**: No single point of failure or control
3. **Transparency**: Cryptographic proofs provide verifiable payment records
4. **Ecosystem**: Existing facilitator infrastructure and tooling
5. **Interoperability**: Compatible with existing X402 implementations

### Why Error Code -32803?

The error code `-32803` was chosen to:
- Follow JSON-RPC 2.0 error code conventions for application-specific errors
- Provide a unique identifier for payment-required scenarios
- Enable consistent error handling across MCP implementations
- Avoid conflicts with existing MCP error codes

### Why Well-Known Endpoints?

Well-known endpoints provide:
- Standardized discovery mechanism
- Compatibility with existing web infrastructure
- Easy integration with payment facilitators and registries
- Clear separation between payment metadata and application logic

### Why Transport-Agnostic Payment Proof?

The `paymentProof` field approach was chosen over transport-specific headers because:

1. **Universal Compatibility**: Works with HTTP, STDIO, and any future transport mechanisms
2. **Consistent API**: Same payment proof structure across all transports
3. **Simplified Implementation**: No need for transport-specific payment handling logic
4. **Future-Proofing**: New transports automatically support payments without modification
5. **Clear Separation**: Payment proof is clearly separated from transport-level concerns

### Why JSON Structure Over Base64 Encoding?

The `paymentProof.proof` field uses JSON structure rather than base64-encoded strings for several reasons:

#### Developer Experience Benefits
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
headers['X-Payment'] = x402Header;
```

The trivial nature of this conversion (a single line of base64 encoding) does not justify sacrificing the significant developer experience benefits of structured JSON. Most programming languages provide built-in base64 encoding, and this conversion can be abstracted into helper libraries for common use cases.

## Backward Compatibility

This specification is designed to be fully backward compatible:

1. **Optional Implementation**: Payment support is entirely optional for MCP implementations
2. **Graceful Degradation**: Clients without payment support can still use free tools
3. **Error Handling**: Payment-required errors follow standard JSON-RPC error format
4. **Transport Agnostic**: Works with existing HTTP and STDIO transports

Existing MCP implementations require no changes unless they choose to add payment support.

## Security Implications

### Payment Security

The framework addresses security through:

1. **Protocol Delegation**: Security is handled by mature payment protocols (X402, etc.)
2. **Facilitator Verification**: All payments are verified through trusted facilitators
3. **Cryptographic Proofs**: Payment proofs use cryptographic verification where supported
4. **Audit Trails**: Comprehensive logging enables security monitoring

### Potential Risks

1. **Facilitator Trust**: Implementations must carefully select trusted facilitators
2. **Protocol Vulnerabilities**: Security depends on the underlying payment protocol
3. **Privacy Concerns**: Payment information may reveal user behavior patterns
4. **Denial of Service**: Payment requirements could be used to limit service access

### Mitigation Strategies

1. **Multi-Facilitator Support**: Allow multiple facilitators to reduce single points of failure
2. **Protocol Diversity**: Support multiple payment protocols to reduce systemic risk
3. **Privacy Controls**: Implement data minimization and user consent mechanisms
4. **Rate Limiting**: Implement appropriate rate limiting to prevent abuse

## Reference Implementation

A reference implementation will include:

1. **Server Library**: Payment integration for MCP servers with X402 support
2. **Client Library**: Payment handling for MCP clients with wallet integration
3. **Example Server**: Demonstration server with paid tools
4. **Example Client**: Demonstration client with payment UI
5. **Documentation**: Integration guides and best practices

The reference implementation will be provided in TypeScript/JavaScript to align with the existing MCP ecosystem.

## Client Implementation Examples

### Payment Hook Interface

MCP client implementations **SHOULD** provide a hook or callback for client builders to handle payment responses. This enables custom payment integration without requiring changes to the core MCP client.

Example hook interface:
```typescript
interface PaymentHook {
  handlePayment(protocol: string, paymentInfo: any): Promise<PaymentResult>;
}

interface PaymentResult {
  success: boolean;
  paymentProof?: any;
  error?: string;
}
```

### Implementation Patterns

#### Basic Payment Handler

```typescript
class BasicPaymentHandler implements PaymentHook {
  async handlePayment(protocol: string, paymentInfo: any): Promise<PaymentResult> {
    switch (protocol) {
      case 'x402':
        return this.handleX402Payment(paymentInfo);
      default:
        return { success: false, error: `Unsupported protocol: ${protocol}` };
    }
  }

  private async handleX402Payment(paymentInfo: any): Promise<PaymentResult> {
    // Display payment options to user
    const selectedOption = await this.showPaymentUI(paymentInfo.accepts);
    
    // Process payment through wallet
    const paymentProof = await this.processWalletPayment(selectedOption);
    
    return { success: true, paymentProof };
  }
}
```

#### Advanced Payment Handler with Multiple Wallets

```typescript
class AdvancedPaymentHandler implements PaymentHook {
  constructor(
    private walletManager: WalletManager,
    private paymentUI: PaymentUI
  ) {}

  async handlePayment(protocol: string, paymentInfo: any): Promise<PaymentResult> {
    try {
      // Show payment options with wallet selection
      const { selectedOption, selectedWallet } = await this.paymentUI.showPaymentOptions({
        protocol,
        paymentInfo,
        availableWallets: this.walletManager.getAvailableWallets()
      });

      // Process payment
      const paymentProof = await this.walletManager.processPayment(
        selectedWallet,
        selectedOption
      );

      return { success: true, paymentProof };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
```

### Integration Benefits

This hook-based approach enables:

- **Custom Payment UI/UX**: Client builders can create branded payment experiences
- **Wallet Integration**: Support for different wallet types and providers  
- **Payment Method Selection**: Users can choose between multiple payment options
- **Error Handling**: Custom error handling and retry logic
- **Analytics**: Payment tracking and usage analytics
- **A/B Testing**: Different payment flows for optimization

## Future Considerations

### Additional Payment Protocols

Future versions may add support for:

- **Traditional Processors**: Integration with established payment providers
- **Subscription Models**: Recurring payment support for ongoing access
- **Micropayments**: Optimized flows for very small payments
- **Cross-Chain Payments**: Support for multiple blockchain ecosystems

### Enhanced Features

Potential enhancements include:

- **Payment Aggregation**: Batching multiple tool payments
- **Usage Tracking**: Built-in metering and billing capabilities
- **Refund Mechanisms**: Standardized refund and dispute resolution
- **Payment Analytics**: Usage and revenue reporting tools

### Ecosystem Integration

Future work may include:

- **MCP Registry Integration**: Payment metadata in server registries
- **Wallet Standards**: Integration with standard wallet interfaces
- **Payment Routing**: Automatic payment method selection
- **Cross-Server Payments**: Unified payment flows across multiple servers