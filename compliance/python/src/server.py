#!/usr/bin/env python3
"""MCP compliance test server binary"""

import argparse
import asyncio
import json
import math
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from mcp.server.fastmcp import FastMCP, Context
from mcp.shared.exceptions import McpError
from mcp.types import ErrorData
import mcp.types as types
from pydantic import BaseModel


client_states: Dict[str, Dict[str, Any]] = {}


def get_client_state(client_id: str) -> Dict[str, Any]:
    """Get or create per-client state"""
    if client_id not in client_states:
        client_states[client_id] = {
            "trig_allowed": False,
            "special_number": 42,
            "files": {
                "/readme.txt": "Initial readme content",
                "/watched.txt": "Initial watched content",
                "/test/static.txt": "Static test file content"
            }
        }
    return client_states[client_id]


def load_scenarios_data(path: Optional[str] = None) -> dict:
    """Load and validate scenarios data"""
    if path:
        with open(path) as f:
            return json.load(f)
    
    default_path = Path(__file__).parent.parent.parent / "scenarios" / "data.json"
    with open(default_path) as f:
        return json.load(f)


def create_calc_server() -> FastMCP:
    """Create CalcServer implementation"""
    server = FastMCP("CalcServer")
    
    @server.tool()
    def add(a: int, b: int) -> int:
        """Adds two numbers a and b together and returns the sum"""
        return a + b
    
    @server.tool()
    async def ambiguous_add(ctx: Context, a: int) -> int:
        """Adds two numbers together but only accepts 'a' input and uses elicitation to request 'b' input from the user"""
        
        class BInput(BaseModel):
            b: int
        
        result = await ctx.elicit(
            f"Please provide the second number (b) to add to {a}:",
            schema=BInput
        )
        
        if result.action == "accept":
            return a + result.data.b
        elif result.action == "decline":
            raise McpError(ErrorData(
                code=-32000,  # Custom application error
                message="User declined to provide input for parameter b"
            ))
        else:  # cancel
            raise McpError(ErrorData(
                code=-32001,  # Custom application error
                message="User cancelled the elicitation request"
            ))
    
    @server.tool()
    def cos(x: float) -> float:
        """Calculates the cosine of an angle in radians (disabled by default)"""
        client_id = getattr(cos, '_current_client_id', 'default')
        state = get_client_state(client_id)
        if not state["trig_allowed"]:
            raise McpError(ErrorData(
                code=-32603,  # Internal error
                message="Trigonometric functions are disabled"
            ))
        return math.cos(x)
    
    @server.tool()
    def sin(x: float) -> float:
        """Calculates the sine of an angle in radians (disabled by default)"""
        client_id = getattr(sin, '_current_client_id', 'default')
        state = get_client_state(client_id)
        if not state["trig_allowed"]:
            raise McpError(ErrorData(
                code=-32603,  # Internal error
                message="Trigonometric functions are disabled"
            ))
        return math.sin(x)
    
    @server.tool()
    def set_trig_allowed(allowed: bool) -> str:
        """Enables or disables trigonometric functions (cos and sin) per-client"""
        client_id = getattr(set_trig_allowed, '_current_client_id', 'default')
        state = get_client_state(client_id)
        state["trig_allowed"] = allowed
        return f"Trigonometric functions {'enabled' if allowed else 'disabled'}"
    
    @server.tool()
    def write_special_number(value: int) -> str:
        """Updates the special number resource with a new value"""
        client_id = getattr(write_special_number, '_current_client_id', 'default')
        state = get_client_state(client_id)
        state["special_number"] = value
        return f"Special number updated to {value}"
    
    @server.tool()
    async def eval_with_sampling(ctx: Context, expression: str) -> float:
        """Evaluates a string arithmetic expression using LLM sampling to parse and compute the result"""
        await ctx.report_progress(0, 100, "Starting evaluation")
        
        if expression == "2 + 2 * 3":
            result = 8.0
        elif expression == "(2 + 3) * (4 + 5)":
            result = 45.0
        else:
            try:
                result = float(eval(expression))
            except Exception:
                raise McpError(ErrorData(
                    code=-32603,  # Internal error
                    message=f"Cannot evaluate expression: {expression}"
                ))
        
        await ctx.report_progress(100, 100, "Evaluation complete")
        return result
    
    @server.resource("resource://special-number")
    def special_number_resource() -> str:
        """A mutable number resource that can be read and updated via tools"""
        client_id = getattr(special_number_resource, '_current_client_id', 'default')
        state = get_client_state(client_id)
        return str(state["special_number"])
    
    @server.prompt()
    def example_maths() -> str:
        """A prompt template that helps with mathematical problem solving"""
        return "Help me solve mathematical problems step by step. Show your work and explain each step clearly."
    
    return server


def create_file_server() -> FastMCP:
    """Create FileServer implementation"""
    server = FastMCP("FileServer")
    
    @server.tool()
    def write_file(path: str, content: str) -> str:
        """Writes content to a file at the specified path"""
        client_id = getattr(write_file, '_current_client_id', 'default')
        state = get_client_state(client_id)
        state["files"][path] = content
        return f"File {path} written successfully"
    
    @server.tool()
    def delete_file(path: str) -> str:
        """Deletes a file at the specified path"""
        client_id = getattr(delete_file, '_current_client_id', 'default')
        state = get_client_state(client_id)
        if path in state["files"]:
            del state["files"][path]
            return f"File {path} deleted successfully"
        else:
            raise McpError(ErrorData(
                code=-32602,  # Invalid params
                message=f"File not found: {path}"
            ))
    
    @server.resource("file:///test/static.txt")
    def static_test_file() -> str:
        """A static test file resource"""
        return "Static test file content"
    
    @server.resource("file:///{path}")
    def file_resource(path: str) -> str:
        """Access any file by providing its path"""
        client_id = getattr(file_resource, '_current_client_id', 'default')
        state = get_client_state(client_id)
        if path in state["files"]:
            return state["files"][path]
        else:
            raise McpError(ErrorData(
                code=-32602,  # Invalid params
                message=f"File not found: {path}"
            ))
    
    @server.prompt()
    def code_review() -> str:
        """Analyzes code quality and suggests improvements"""
        return "Please review this code for best practices, potential bugs, and improvement opportunities."
    
    @server.prompt("summarize_file")
    def summarize_file_prompt(path: str) -> str:
        """Summarizes the content of a file at the given path"""
        client_id = getattr(summarize_file_prompt, '_current_client_id', 'default')
        state = get_client_state(client_id)
        if path in state["files"]:
            content = state["files"][path]
            return f"Please summarize the following file content from {path}:\n\n{content}"
        else:
            return f"File not found: {path}"
    
    return server


def create_error_server() -> FastMCP:
    """Create ErrorServer implementation"""
    server = FastMCP("ErrorServer")
    
    @server.tool()
    def always_error() -> str:
        """Always returns a tool execution error"""
        raise McpError(ErrorData(
            code=-32602,  # Invalid params error
            message="This tool always fails for testing purposes"
        ))
    
    @server.tool()
    async def timeout(ctx: Context, duration: int = 5) -> str:
        """Takes a long time to execute, useful for testing timeouts"""
        total_steps = duration * 10
        for i in range(total_steps):
            await ctx.report_progress(i, total_steps, f"Step {i+1}/{total_steps}")
            await asyncio.sleep(0.1)
        
        await ctx.report_progress(total_steps, total_steps, "Completed")
        return f"Completed after {duration} seconds"
    
    @server.tool()
    def invalid_response() -> dict:
        """Returns a response that doesn't match its declared schema"""
        return {"unexpected_field": "this should not be here", "malformed": True}
    
    @server.resource("error://not-found")
    def not_found_resource() -> str:
        """A resource that always returns not found error"""
        raise McpError(ErrorData(
            code=-32602,  # Invalid params
            message="This resource is designed to always fail"
        ))
    
    return server


def main():
    """Main entry point for the test server"""
    parser = argparse.ArgumentParser(description="MCP compliance test server")
    parser.add_argument("--server-name", required=True, help="Server definition name")
    parser.add_argument("--transport", choices=["stdio", "sse", "streamable-http"], 
                       default="stdio", help="Transport type")
    parser.add_argument("--host", default="localhost", help="Host for HTTP transports")
    parser.add_argument("--port", type=int, default=8000, help="Port for HTTP transports")
    parser.add_argument("--scenarios-data", help="Path to scenarios data file")
    
    args = parser.parse_args()
    
    try:
        scenarios_data = load_scenarios_data(args.scenarios_data)
    except FileNotFoundError:
        print(f"Error: Scenarios data file not found", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in scenarios data: {e}", file=sys.stderr)
        sys.exit(1)
    
    if args.server_name not in scenarios_data["servers"]:
        print(f"Error: Server '{args.server_name}' not found in scenarios data", file=sys.stderr)
        sys.exit(1)
    
    server_def = scenarios_data["servers"][args.server_name]
    expected_desc = server_def["description"]
    
    if args.server_name == "CalcServer":
        server = create_calc_server()
        actual_desc = "A calculator server with basic arithmetic operations, trigonometric functions, resource management, sampling capabilities, and prompt templates"
    elif args.server_name == "FileServer":
        server = create_file_server()
        actual_desc = "A server that provides file system access with resource templates and subscriptions"
    elif args.server_name == "ErrorServer":
        server = create_error_server()
        actual_desc = "A server designed to test error handling and edge cases"
    else:
        print(f"Error: Server '{args.server_name}' not implemented", file=sys.stderr)
        sys.exit(1)
    
    if actual_desc != expected_desc:
        print(f"Warning: Server description mismatch for {args.server_name}", file=sys.stderr)
        print(f"Expected: {expected_desc}", file=sys.stderr)
        print(f"Actual: {actual_desc}", file=sys.stderr)
    
    try:
        if args.transport == "stdio":
            server.run()
        elif args.transport == "sse":
            server.run(transport="sse", host=args.host, port=args.port)
        elif args.transport == "streamable-http":
            server.run(transport="streamable-http", host=args.host, port=args.port)
    except KeyboardInterrupt:
        print("Server stopped by user", file=sys.stderr)
        sys.exit(0)
    except Exception as e:
        print(f"Error: Server failed to start: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()