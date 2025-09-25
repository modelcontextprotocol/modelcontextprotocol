#!/bin/bash
set -e

echo "Testing Rust MCP implementation"

# Build the binaries
cargo build --release

echo "Testing Scenario 1: Basic add operation"
timeout 10 ./target/release/test-client \
    --scenario-id 1 \
    --id client1 \
    stdio \
    -- ./target/release/test-server \
        --server-name CalcServer \
        --transport stdio

echo "All tests passed!"