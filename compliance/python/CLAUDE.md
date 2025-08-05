# Python SDK Implementation Guide

This document provides implementation guidance for creating MCP compliance test binaries using the Python SDK.

## SDK Documentation

- **Repository**: https://github.com/modelcontextprotocol/python-sdk
- **Python Support**: 3.10-3.13
- **License**: MIT

## Installation

```bash
# Recommended using uv
uv add "mcp[cli]"

# Alternative using pip
pip install "mcp[cli]"
```

## Official Examples

The Python SDK includes several examples demonstrating key patterns:

- **FastMCP Server**: High-level decorator-based API
- **Client Integration**: Async client session management
- **Transport Support**: stdio, SSE, and streamable-http implementations
- **Advanced Features**: Progress reporting, elicitation, and sampling

## Implementation Requirements

### Test Server Binary (`test-server`)

**CLI Interface:**
```bash
--server-name <string>     # Maps to server definitions in scenarios/data.json
--transport <transport>    # One of: stdio, sse, streamable-http
--host <string>           # For HTTP transports (default: localhost)
--port <number>           # For HTTP transports (default: 8000)
--scenarios-data <path>   # Optional path to scenarios data file
```

**Implementation Pattern:**
- Use `argparse` for CLI argument parsing
- Validate server name against scenarios data
- Factory pattern for server creation based on server name
- Support all three transport types

### Test Client Binary (`test-client`)

**CLI Interface:**
```bash
--scenario-id <number>     # Scenario ID from scenarios/data.json
--id <string>             # Client identifier (e.g., "client1")
--scenarios-data <path>   # Optional path to scenarios data file
<transport> [args...]     # Transport descriptor:
                          #   stdio <command> [args...]
                          #   sse <url>
                          #   streamable-http <url>
```

**Implementation Pattern:**
- Load and validate scenario from scenarios data
- Validate client ID is included in scenario
- Create transport-specific client connection
- Execute scenario logic based on scenario ID using switch/match pattern

## Server Implementations Required

### CalcServer
- **Tools**: add, ambiguous_add, cos, sin, set_trig_allowed, write_special_number, eval_with_sampling
- **Resources**: resource://special-number (mutable, initial value 42)
- **Prompts**: example-maths
- **Features**: Per-client state management, elicitation support, conditional tool enabling

### FileServer
- **Tools**: write_file, delete_file
- **Resources**: file:///test/static.txt, file:///{path} template
- **Prompts**: code_review, summarize_file template
- **Features**: In-memory filesystem simulation, resource templates

### ErrorServer
- **Tools**: always_error, timeout, invalid_response
- **Resources**: error://not-found
- **Features**: Error condition testing, timeout handling

## Key Implementation Patterns

### Using FastMCP API
```python
from mcp.server.fastmcp import FastMCP, Context

mcp = FastMCP("ServerName")

@mcp.tool()
def simple_tool(param: str) -> str:
    """Tool description matching scenarios data"""
    return f"Result: {param}"

@mcp.tool()
async def elicitation_tool(ctx: Context, a: int) -> int:
    """Tool that uses elicitation"""
    b = await ctx.elicit("Provide value for b:", int)
    return a + b

@mcp.resource("resource://uri")
def get_resource() -> str:
    """Resource description matching scenarios data"""
    return "resource content"
```

### Per-Client State Management
```python
# Global state for per-client data
client_states = {}

def get_client_state(client_id: str) -> dict:
    if client_id not in client_states:
        client_states[client_id] = {
            "trig_allowed": False,
            "special_number": 42
        }
    return client_states[client_id]
```

### Transport Handling
```python
# Server transport selection
if transport == "stdio":
    mcp.run()
elif transport == "sse":
    mcp.run(transport="sse", host=host, port=port)
elif transport == "streamable-http":
    mcp.run(transport="streamable-http", host=host, port=port)
```

### Client Transport Creation
```python
from mcp.client.stdio import stdio_client, StdioServerParameters
from mcp.client.sse import sse_client, SseServerParameters
from mcp.client.http import http_client, HttpServerParameters

if transport == "stdio":
    params = StdioServerParameters(command=args[0], args=args[1:])
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            # Execute scenario logic
```

## Build and Test Setup

### Project Structure
```
compliance/python/
├── pyproject.toml        # Python project configuration
├── test-server          # Executable server binary
├── test-client          # Executable client binary
├── src/
│   ├── server.py        # Server implementation
│   └── client.py        # Client implementation
└── tests/
    └── test_compliance.py # Integration tests
```

### Dependencies
- `mcp[cli]`: Official Python MCP SDK
- `pytest`: Testing framework
- `pytest-asyncio`: Async test support

### Validation Requirements

Both binaries must:
1. Validate scenarios data file structure
2. Check that server/scenario descriptions match expected values
3. Provide proper error messages and exit codes
4. Handle all required transport types
5. Support async operation for elicitation and sampling

## Testing Strategy

1. **Unit Tests**: Test individual server/client components
2. **Integration Tests**: Test binary execution with process spawning
3. **Scenario Tests**: Execute actual scenarios against binaries
4. **Transport Tests**: Verify all transport types work correctly

## Error Handling

- Use proper exception handling for MCP errors
- Return appropriate exit codes (0 for success, 1 for failure)
- Log errors to stderr with descriptive messages
- Handle elicitation acceptance/decline properly