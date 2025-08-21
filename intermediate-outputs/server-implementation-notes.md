# MCP Test Server Implementation Notes

## Overview
The server implementation provides three test servers (CalcServer, FileServer, ErrorServer) for the MCP compliance test harness. Each server implements specific features to test different aspects of the MCP protocol.

## Key Design Decisions

### 1. Per-Client State Management
- Used a global `clientStates` Map to track per-client state (trig functions enabled, special number value)
- Client ID is extracted from `request.meta.sessionId` or defaults to 'default'
- This enables multi-client scenarios like scenario #3 where different clients have different tool access

### 2. Transport Abstraction
- All three transports (stdio, SSE, streamable-http) are supported
- The server uses the high-level `McpServer` API which handles transport details
- HTTP transports create an HTTP server and bind to specified host/port

### 3. Feature Implementation Details

#### CalcServer
- **Tools**:
  - `add`: Simple synchronous addition
  - `ambiguous_add`: Uses `request.client.elicit()` to request missing parameter
  - `cos/sin`: Check per-client state before execution
  - `set_trig_allowed`: Updates client state and notifies tools changed
  - `write_special_number`: Updates resource and notifies subscribers
  - `eval_with_sampling`: Uses client sampling with progress reporting
  
- **Resources**:
  - `resource://special-number`: Returns per-client value from state
  
- **Prompts**:
  - `example-maths`: Static prompt for math tutoring

#### FileServer
- **Tools**:
  - `write_file`: Updates in-memory file system and notifies watchers
  - `delete_file`: Removes files from in-memory storage
  
- **Resources**:
  - Static: `file:///test/static.txt`
  - Template: `file:///{path}` for dynamic file access
  
- **Prompts**:
  - `code_review`: Static prompt
  - `summarize_file`: Template prompt that includes file content

#### ErrorServer
- **Tools**:
  - `always_error`: Throws an error immediately
  - `timeout`: Long-running operation with cancellation support
  - `invalid_response`: Returns malformed response for testing error handling
  
- **Resources**:
  - `error://not-found`: Always throws not found error

### 4. Notifications
- Tools changed: Sent when trig functions are enabled/disabled
- Resource updated: Sent when special number or files are modified
- Roots changed: Capability advertised by FileServer (but not actively used in scenarios)

### 5. Progress Tracking
- Implemented in `eval_with_sampling` tool
- Reports progress at 30%, 80%, and 100% during execution

### 6. Error Handling
- Proper error messages for all failure cases
- Support for elicitation decline
- Validation of inputs (e.g., checking if number is valid in ambiguous_add)

## Integration Points

### With Client
- Elicitation requests for missing parameters
- Sampling requests for expression evaluation
- Progress notifications during long operations

### With MITM Logger
- All JSON-RPC messages flow through the transport layer
- Transport handles message framing and delivery
- Server doesn't need special handling for logging

## Testing Considerations

1. **State Isolation**: Each client gets its own state for trig functions and special number
2. **Subscription Management**: Resources can be subscribed to and will notify on updates
3. **Transport Agnostic**: Same server code works with all three transports
4. **Error Scenarios**: ErrorServer specifically tests edge cases and error handling

## Usage Examples

```bash
# Stdio transport
./test-server --server-name CalcServer --transport stdio

# SSE transport
./test-server --server-name FileServer --transport sse --host 127.0.0.1 --port 3001

# Streamable HTTP transport
./test-server --server-name ErrorServer --transport streamable-http --host 127.0.0.1 --port 3002
```

## Future Enhancements

1. Add actual file system operations (currently uses in-memory storage)
2. Implement more sophisticated sampling responses
3. Add support for batch operations
4. Implement resource pagination for FileServer
5. Add more error scenarios (network errors, malformed requests, etc.)