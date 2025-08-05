# Rust SDK Implementation for MCP Compliance Testing

## Overview

This directory contains Rust implementations of the MCP compliance test binaries for the Model Context Protocol test harness. The implementation follows the official Rust MCP SDK (RMCP) patterns and conventions.

## SDK Documentation

- **Main Repository**: https://github.com/modelcontextprotocol/rust-sdk
- **Documentation**: https://docs.rs/rmcp/latest/rmcp/
- **Examples**: https://github.com/modelcontextprotocol/rust-sdk/tree/main/examples

## Architecture

### Core Components

1. **test-server**: Implements CalcServer, FileServer, and ErrorServer definitions
2. **test-client**: Executes scenarios from `../scenarios/data.json`
3. **Shared modules**: Common types, utilities, and transport handling

### Dependencies

- `rmcp` (v0.4.0+): Core MCP SDK
- `tokio`: Async runtime
- `serde`: JSON serialization
- `clap`: CLI argument parsing
- `anyhow`: Error handling
- `tracing`: Logging
- `uuid`: Session ID generation

## Implementation Patterns

### Server Implementation

```rust
use rmcp::server::{Server, ServerHandler, RequestContext};
use rmcp::macros::{tool_router, tool};

#[tool_router]
impl CalcServer {
    #[tool("add")]
    async fn add(&self, ctx: RequestContext, a: f64, b: f64) -> Result<f64, String> {
        Ok(a + b)
    }
}
```

### Client Implementation

```rust
use rmcp::client::Client;
use rmcp::transport::stdio::StdioTransport;

let transport = StdioTransport::spawn_command(&server_cmd).await?;
let client = Client::new(transport).await?;
```

## Server Definitions

### CalcServer
- Tools: add, ambiguous_add, cos, sin, set_trig_allowed, write_special_number, eval_with_sampling
- Resources: resource://special-number
- Prompts: example-maths
- State management: Per-client tool enablement, mutable resources

### FileServer
- Tools: write_file, delete_file
- Resources: Static files and resource templates
- Resource templates: file:///{path}
- Prompts: code_review
- Prompt templates: summarize_file

### ErrorServer
- Tools: always_error, timeout, invalid_response
- Resources: error://not-found
- Error simulation for testing edge cases

## Transport Support

### Required Transports
1. **stdio**: Process-based communication
2. **sse**: Server-Sent Events over HTTP
3. **streamable-http**: HTTP-based request/response

### Implementation Notes
- Use `rmcp::transport` modules for each transport type
- Handle transport-specific configuration (host, port for HTTP)
- Implement proper session management for HTTP transports

## CLI Interface

### test-server
```bash
./test-server --server-name CalcServer --transport stdio
./test-server --server-name FileServer --transport sse --host 127.0.0.1 --port 8080
```

### test-client
```bash
./test-client --scenario-id 1 --id client1 stdio ./test-server --server-name CalcServer --transport stdio
./test-client --scenario-id 14 --id client1 sse http://127.0.0.1:8080
```

## Build Configuration

### Cargo.toml Structure
- Workspace configuration with separate binaries
- Feature flags for different transport types
- Development dependencies for testing

### Build Scripts
- `cargo build --release` for production binaries
- `cargo test` for unit and integration tests
- Build script validation in test harness

## Testing Strategy

### Unit Tests
- Individual tool implementations
- Resource management
- Error handling scenarios
- Transport connectivity

### Integration Tests
- End-to-end scenario execution
- Cross-transport compatibility
- Error condition handling
- Concurrency and state management

## Error Handling

### Patterns
- Use `anyhow::Result` for error propagation
- Implement `Display` for custom error types
- Map SDK errors to appropriate JSON-RPC error codes
- Handle transport disconnections gracefully

### Validation
- Validate scenario descriptions match implementation
- Check server definitions against JSON data
- Validate JSON-RPC message format compliance

## State Management

### Per-Client State
- Use `Arc<RwLock<HashMap<ClientId, ClientState>>>` for thread-safe access
- Track tool enablement per client
- Manage resource subscriptions

### Mutable Resources
- Implement atomic updates for shared resources
- Notify subscribers on resource changes
- Handle concurrent access safely

## Elicitation Support

### Implementation
- Use `rmcp::server::ElicitationHandler` trait
- Support async user input collection
- Handle elicitation timeouts and cancellation
- Validate elicitation responses

## Sampling Support

### Server-Initiated Sampling
- Implement sampling request handling
- Support model configuration options
- Handle sampling responses and errors
- Maintain prompt privacy as per spec

## Performance Considerations

### Async Design
- Use `tokio` for all async operations
- Implement proper cancellation support
- Handle backpressure in streaming scenarios

### Memory Management
- Use `Arc` for shared immutable data
- Minimize allocations in hot paths
- Implement proper cleanup on disconnect

## Compliance Notes

### JSON-RPC Requirements
- Strict adherence to JSON-RPC 2.0 specification
- Proper error code mapping
- Request ID tracking and response correlation

### Protocol Version
- Support for protocol version negotiation
- Backward compatibility considerations
- Version mismatch handling

## Development Workflow

1. Run `cargo check` for syntax validation
2. Run `cargo test` for unit tests
3. Run `cargo clippy` for linting
4. Use `cargo fmt` for consistent formatting
5. Integration testing via the main test harness