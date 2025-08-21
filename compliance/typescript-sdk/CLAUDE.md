# TypeScript SDK Compliance Test Implementation

This directory contains the MCP compliance test implementation for the TypeScript SDK.

## SDK Documentation

- **Official SDK**: https://github.com/modelcontextprotocol/typescript-sdk
- **Documentation**: https://modelcontextprotocol.io/docs/typescript
- **NPM Package**: @modelcontextprotocol/sdk

## Implementation Guidelines

### Client Binary (`test-client`)

The client binary must:
1. Accept command-line arguments:
   - `--scenario-id <number>`: ID of the scenario to execute from `../scenarios/data.json`
   - `--id <string>`: Client identifier (e.g., "client1")
   - Server descriptor: One of:
     - `stdio <command> [args...]`
     - `sse <url>`
     - `streamable-http <url>`

2. Read and validate the scenario description from `../scenarios/data.json`
3. Execute the scenario steps for the specified client ID
4. Handle all transport types appropriately
5. Exit with status 0 on success, non-zero on failure

### Server Binary (`test-server`)

The server binary must:
1. Accept command-line arguments:
   - `--server-name <string>`: Server definition name from `../scenarios/data.json`
   - `--transport <stdio|sse|streamable-http>`: Transport type
   - `--host <string>`: (HTTP only) Host to bind to
   - `--port <number>`: (HTTP only) Port to bind to

2. Read and validate the server definition from `../scenarios/data.json`
3. Implement all server capabilities as defined:
   - Tools with proper input validation and execution
   - Resources (static and templated)
   - Prompts (static and templated)
   - Per-client state management where required
4. Support all specified transports

### Key Implementation Details

1. **CalcServer Features**:
   - `add(a, b)`: Simple addition
   - `ambiguous_add(a)`: Uses elicitation to request `b`
   - `cos/sin`: Disabled by default, enabled per-client via `set_trig_allowed`
   - `write_special_number`: Updates the `resource://special-number` resource
   - `eval_with_sampling`: Uses client sampling to evaluate expressions
   - `resource://special-number`: Mutable resource (initial value: 42)
   - `example-maths`: Static prompt for mathematical problem solving

2. **FileServer Features**:
   - File system access with resource templates
   - Write/delete operations
   - Resource subscriptions
   - Pagination support

3. **ErrorServer Features**:
   - Error testing scenarios
   - Timeout handling
   - Invalid response testing

### Build and Test

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test

# Execute client
./test-client --scenario-id 1 --id client1 stdio ./test-server --server-name CalcServer --transport stdio

# Execute server
./test-server --server-name CalcServer --transport stdio
```

### Dependencies

The implementation uses:
- `@modelcontextprotocol/sdk`: Official MCP TypeScript SDK
- `zod`: Schema validation
- `commander`: CLI argument parsing
- Standard Node.js libraries

### Testing Strategy

1. Unit tests for individual components
2. Integration tests for client-server communication
3. Scenario validation tests
4. Transport-specific tests

### Notes

- Ensure compatibility with Node.js 18+
- Follow TypeScript best practices
- Implement proper error handling and logging
- Validate all inputs against schemas
- Maintain per-client state where required (e.g., trig functions)