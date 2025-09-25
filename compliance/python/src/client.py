#!/usr/bin/env python3
"""MCP compliance test client binary"""

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from mcp.client.session import ClientSession
from mcp.client.stdio import stdio_client, StdioServerParameters
from mcp.client.sse import sse_client
from mcp.client.streamable_http import streamablehttp_client
import mcp.types as types
from mcp.shared.exceptions import McpError
from pydantic import BaseModel


async def elicitation_handler_for_scenario_2(context, params: types.ElicitRequestParams) -> types.ElicitResult:
    """Elicitation handler that responds with b=20 for scenario 2"""
    if "b" in params.message.lower():
        return types.ElicitResult(action="accept", content={"b": 20})
    return types.ElicitResult(action="decline")


async def elicitation_handler_for_scenario_24(context, params: types.ElicitRequestParams) -> types.ElicitResult:
    """Elicitation handler that declines for scenario 24"""
    return types.ElicitResult(action="decline")


def load_scenarios_data(path: Optional[str] = None) -> dict:
    """Load and validate scenarios data"""
    if path:
        with open(path) as f:
            return json.load(f)
    
    default_path = Path(__file__).parent.parent.parent / "scenarios" / "data.json"
    with open(default_path) as f:
        return json.load(f)


async def execute_scenario_1(session: ClientSession) -> bool:
    """client1 connects to CalcServer and calls add(a=10, b=20), gets result of 30"""
    try:
        result = await session.call_tool("add", {"a": 10, "b": 20})
        if hasattr(result, 'content') and len(result.content) > 0:
            content = result.content[0]
            if hasattr(content, 'text'):
                value = int(content.text)
            else:
                value = content
        else:
            value = result
        
        assert value == 30, f"Expected 30, got {value}"
        print("✓ Scenario 1 passed")
        return True
    except Exception as e:
        print(f"✗ Scenario 1 failed: {e}", file=sys.stderr)
        return False


async def execute_scenario_2(session: ClientSession) -> bool:
    """client1 connects to CalcServer and calls ambiguous_add(a=10), receives elicitation for b, responds with 20, gets result of 30"""
    try:
        result = await session.call_tool("ambiguous_add", {"a": 10})
        if hasattr(result, 'content') and len(result.content) > 0:
            content = result.content[0]
            if hasattr(content, 'text'):
                value = int(content.text)
            else:
                value = content
        else:
            value = result
        
        assert value == 30, f"Expected 30, got {value}"
        print("✓ Scenario 2 passed")
        return True
    except Exception as e:
        print(f"✗ Scenario 2 failed: {e}", file=sys.stderr)
        return False


async def execute_scenario_3(session: ClientSession, client_id: str) -> bool:
    """client1 & client2 connect to CalcServer; client1 calls set_trig_allowed(allowed=true) tool. client1 gets list of tools that includes cos & sin, and client2 gets list of tools that doesn't"""
    try:
        if client_id == "client1":
            await session.call_tool("set_trig_allowed", {"allowed": True})
            tools = await session.list_tools()
            tool_names = [tool.name for tool in tools.tools]
            assert "cos" in tool_names and "sin" in tool_names, f"Expected cos and sin in tools, got {tool_names}"
            print("✓ Scenario 3 client1 passed")
        elif client_id == "client2":
            tools = await session.list_tools()
            tool_names = [tool.name for tool in tools.tools]
            assert "cos" not in tool_names and "sin" not in tool_names, f"Expected cos and sin NOT in tools, got {tool_names}"
            print("✓ Scenario 3 client2 passed")
        return True
    except Exception as e:
        print(f"✗ Scenario 3 {client_id} failed: {e}", file=sys.stderr)
        return False


async def execute_scenario_4(session: ClientSession) -> bool:
    """client1 connects to CalcServer, reads resource://special-number (initial value 42), calls write_special_number(value=100), then reads resource://special-number again and gets 100"""
    try:
        initial = await session.read_resource("resource://special-number")
        initial_value = int(initial.contents[0].text)
        assert initial_value == 42, f"Expected initial value 42, got {initial_value}"
        
        await session.call_tool("write_special_number", {"value": 100})
        
        updated = await session.read_resource("resource://special-number")
        updated_value = int(updated.contents[0].text)
        assert updated_value == 100, f"Expected updated value 100, got {updated_value}"
        
        print("✓ Scenario 4 passed")
        return True
    except Exception as e:
        print(f"✗ Scenario 4 failed: {e}", file=sys.stderr)
        return False


async def execute_scenario_5(session: ClientSession) -> bool:
    """client1 connects to CalcServer, calls prompts/get for example-maths prompt, receives prompt template with mathematical problem-solving instructions"""
    try:
        prompt = await session.get_prompt("example-maths")
        assert prompt.messages, "Expected prompt messages"
        assert len(prompt.messages) > 0, "Expected at least one prompt message"
        
        message_text = prompt.messages[0].content.text
        assert "mathematical" in message_text.lower(), f"Expected mathematical content in prompt, got: {message_text}"
        
        print("✓ Scenario 5 passed")
        return True
    except Exception as e:
        print(f"✗ Scenario 5 failed: {e}", file=sys.stderr)
        return False


async def execute_scenario_6(session: ClientSession) -> bool:
    """client1 connects to CalcServer, calls eval_with_sampling(expression='2 + 2 * 3'), server uses sampling to evaluate expression and returns 8"""
    try:
        result = await session.call_tool("eval_with_sampling", {"expression": "2 + 2 * 3"})
        if hasattr(result, 'content') and len(result.content) > 0:
            content = result.content[0]
            if hasattr(content, 'text'):
                value = float(content.text)
            else:
                value = float(content)
        else:
            value = float(result)
        
        assert value == 8.0, f"Expected 8.0, got {value}"
        print("✓ Scenario 6 passed")
        return True
    except Exception as e:
        print(f"✗ Scenario 6 failed: {e}", file=sys.stderr)
        return False


async def execute_scenario_24(session: ClientSession) -> bool:
    """client1 connects to CalcServer, calls ambiguous_add, receives elicitation request but declines to provide input, receives appropriate error"""
    try:
        result = await session.call_tool("ambiguous_add", {"a": 10})
        # Check if the result indicates an error
        if hasattr(result, 'isError') and result.isError:
            # Check the error message content
            if result.content and len(result.content) > 0:
                error_text = result.content[0].text
                if "declined" in error_text.lower():
                    print("✓ Scenario 24 passed")
                    return True
                else:
                    print(f"✗ Scenario 24 failed: Wrong error message: {error_text}", file=sys.stderr)
                    return False
            else:
                print("✓ Scenario 24 passed (error result with no content)")
                return True
        else:
            print("✗ Scenario 24 failed: Expected error but got success", file=sys.stderr)
            return False
    except McpError as e:
        if e.error.code == -32000 or "declined" in e.error.message.lower():
            print("✓ Scenario 24 passed")
            return True
        else:
            print(f"✗ Scenario 24 failed: Wrong error type: {e}", file=sys.stderr)
            return False
    except Exception as e:
        print(f"✗ Scenario 24 failed: Unexpected error: {e}", file=sys.stderr)
        return False


async def execute_scenario_25(session: ClientSession) -> bool:
    """client1 connects to CalcServer, initiates 3 concurrent add tool calls: add(1,2), add(3,4), add(5,6). Server processes them in parallel and returns results (3, 7, 11) maintaining request order"""
    try:
        # Execute concurrent tool calls
        tasks = [
            session.call_tool("add", {"a": 1, "b": 2}),
            session.call_tool("add", {"a": 3, "b": 4}),
            session.call_tool("add", {"a": 5, "b": 6})
        ]
        
        results = await asyncio.gather(*tasks)
        
        expected_results = [3, 7, 11]
        for i, result in enumerate(results):
            if hasattr(result, 'content') and len(result.content) > 0:
                content = result.content[0]
                if hasattr(content, 'text'):
                    value = int(content.text)
                else:
                    value = int(content)
            else:
                value = int(result)
            
            assert value == expected_results[i], f"Expected {expected_results[i]}, got {value}"
        
        print("✓ Scenario 25 passed")
        return True
    except Exception as e:
        print(f"✗ Scenario 25 failed: {e}", file=sys.stderr)
        return False


async def create_client_connection(transport: str, args: List[str]):
    """Create client connection based on transport type"""
    if transport == "stdio":
        if len(args) < 1:
            raise ValueError("stdio transport requires server command")
        
        params = StdioServerParameters(
            command=args[0],
            args=args[1:] if len(args) > 1 else []
        )
        return stdio_client(params)
    
    elif transport == "sse":
        if len(args) < 1:
            raise ValueError("sse transport requires server URL")
        
        return sse_client(args[0])
    
    elif transport == "streamable-http":
        if len(args) < 1:
            raise ValueError("streamable-http transport requires server URL")
        
        return streamablehttp_client(args[0])
    
    else:
        raise ValueError(f"Unsupported transport: {transport}")


async def elicitation_handler_for_scenario_2(context, params: types.ElicitRequestParams) -> types.ElicitResult:
    """Elicitation handler that responds with b=20 for scenario 2"""
    if "b" in params.message.lower():
        return types.ElicitResult(action="accept", content={"b": 20})
    return types.ElicitResult(action="decline")


async def elicitation_handler_for_scenario_24(context, params: types.ElicitRequestParams) -> types.ElicitResult:
    """Elicitation handler that declines for scenario 24"""
    return types.ElicitResult(action="decline")


async def run_scenario(scenario_id: int, client_id: str, server_desc: List[str], scenarios_data: dict) -> bool:
    """Run a specific compliance test scenario"""
    
    scenario = None
    for s in scenarios_data["scenarios"]:
        if s["id"] == scenario_id:
            scenario = s
            break
    
    if not scenario:
        print(f"Error: Scenario {scenario_id} not found", file=sys.stderr)
        return False
    
    if client_id not in scenario["client_ids"]:
        print(f"Error: Client ID '{client_id}' not in scenario {scenario_id}", file=sys.stderr)
        return False
    
    print(f"Running scenario {scenario_id}: {scenario['description']}")
    
    transport = server_desc[0]
    transport_args = server_desc[1:]
    
    try:
        async with await create_client_connection(transport, transport_args) as (read, write):
            # Set up elicitation handler based on scenario
            elicitation_callback = None
            if scenario_id == 2:
                elicitation_callback = elicitation_handler_for_scenario_2
            elif scenario_id == 24:
                elicitation_callback = elicitation_handler_for_scenario_24
            
            async with ClientSession(read, write, elicitation_callback=elicitation_callback) as session:
                await session.initialize()
                
                if scenario_id == 1:
                    return await execute_scenario_1(session)
                elif scenario_id == 2:
                    return await execute_scenario_2(session)
                elif scenario_id == 3:
                    return await execute_scenario_3(session, client_id)
                elif scenario_id == 4:
                    return await execute_scenario_4(session)
                elif scenario_id == 5:
                    return await execute_scenario_5(session)
                elif scenario_id == 6:
                    return await execute_scenario_6(session)
                elif scenario_id == 24:
                    return await execute_scenario_24(session)
                elif scenario_id == 25:
                    return await execute_scenario_25(session)
                else:
                    print(f"Error: Scenario {scenario_id} not implemented", file=sys.stderr)
                    return False
    
    except Exception as e:
        print(f"Error: Failed to connect or execute scenario: {e}", file=sys.stderr)
        return False


def main():
    """Main entry point for the test client"""
    parser = argparse.ArgumentParser(description="MCP compliance test client")
    parser.add_argument("--scenario-id", type=int, required=True, help="Scenario ID to run")
    parser.add_argument("--id", required=True, help="Client ID (e.g., client1)")
    parser.add_argument("--scenarios-data", help="Path to scenarios data file")
    parser.add_argument("server_desc", nargs=argparse.REMAINDER, help="Server description")
    
    args = parser.parse_args()
    
    try:
        scenarios_data = load_scenarios_data(args.scenarios_data)
    except FileNotFoundError:
        print(f"Error: Scenarios data file not found", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in scenarios data: {e}", file=sys.stderr)
        sys.exit(1)
    
    scenario = None
    for s in scenarios_data["scenarios"]:
        if s["id"] == args.scenario_id:
            scenario = s
            break
    
    if not scenario:
        print(f"Error: Scenario {args.scenario_id} not found", file=sys.stderr)
        sys.exit(1)
    
    expected_desc = scenario["description"]
    print(f"Executing scenario {args.scenario_id}: {expected_desc}")
    
    try:
        success = asyncio.run(run_scenario(
            args.scenario_id,
            args.id,
            args.server_desc,
            scenarios_data
        ))
        
        sys.exit(0 if success else 1)
    
    except KeyboardInterrupt:
        print("Client stopped by user", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: Client failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()