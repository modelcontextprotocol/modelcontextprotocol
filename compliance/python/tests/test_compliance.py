"""Test Python MCP compliance binaries"""

import json
import subprocess
import sys
from pathlib import Path

import pytest


@pytest.fixture
def scenarios_data():
    """Load scenarios data for testing"""
    scenarios_path = Path(__file__).parent.parent.parent / "scenarios" / "data.json"
    with open(scenarios_path) as f:
        return json.load(f)


@pytest.fixture
def python_dir():
    """Python compliance directory"""
    return Path(__file__).parent.parent


def test_server_binary_exists(python_dir):
    """Test that server binary exists and is executable"""
    server_path = python_dir / "test-server"
    assert server_path.exists(), "Server binary not found"
    assert server_path.is_file(), "Server binary is not a file"


def test_client_binary_exists(python_dir):
    """Test that client binary exists and is executable"""
    client_path = python_dir / "test-client"
    assert client_path.exists(), "Client binary not found"
    assert client_path.is_file(), "Client binary is not a file"


def test_server_help(python_dir):
    """Test server binary help output"""
    server_path = python_dir / "test-server"
    result = subprocess.run([str(server_path), "--help"], 
                          capture_output=True, text=True)
    assert result.returncode == 0, "Server help should exit with code 0"
    assert "--server-name" in result.stdout
    assert "--transport" in result.stdout


def test_client_help(python_dir):
    """Test client binary help output"""
    client_path = python_dir / "test-client"
    result = subprocess.run([str(client_path), "--help"], 
                          capture_output=True, text=True)
    assert result.returncode == 0, "Client help should exit with code 0"
    assert "--scenario-id" in result.stdout
    assert "--id" in result.stdout


def test_server_invalid_name(python_dir):
    """Test server with invalid server name"""
    server_path = python_dir / "test-server"
    result = subprocess.run([
        str(server_path),
        "--server-name", "NonexistentServer",
        "--transport", "stdio"
    ], capture_output=True, text=True, timeout=5)
    
    assert result.returncode == 1, "Server should exit with code 1 for invalid name"
    assert "not found" in result.stderr.lower()


def test_client_invalid_scenario(python_dir):
    """Test client with invalid scenario ID"""
    client_path = python_dir / "test-client"
    result = subprocess.run([
        str(client_path),
        "--scenario-id", "999",
        "--id", "client1",
        "stdio", "echo"
    ], capture_output=True, text=True, timeout=5)
    
    assert result.returncode == 1, "Client should exit with code 1 for invalid scenario"
    assert "not found" in result.stderr.lower()


def test_scenario_1_integration(python_dir):
    """Test scenario 1 with actual binaries"""
    client_path = python_dir / "test-client"
    server_path = python_dir / "test-server"
    
    result = subprocess.run([
        str(client_path),
        "--scenario-id", "1",
        "--id", "client1",
        "stdio",
        str(server_path),
        "--server-name", "CalcServer",
        "--transport", "stdio"
    ], capture_output=True, text=True, timeout=30,
    cwd=Path(__file__).parent.parent.parent.parent)
    
    if result.returncode != 0:
        print(f"stdout: {result.stdout}")
        print(f"stderr: {result.stderr}")
    
    assert result.returncode == 0, f"Client failed with exit code {result.returncode}"
    assert "✓ Scenario 1 passed" in result.stdout, "Expected success message not found"