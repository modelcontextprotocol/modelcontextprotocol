# Update Golden Replay Logs

This command captures the reference replay logs using the TypeScript SDK implementation.

## Usage

```
/update_goldens
```

## Prerequisites

- TypeScript SDK implementation must be complete (`compliance/typescript-sdk/`)
- All scenarios must be defined in `compliance/scenarios/data.json`
- Transport interceptor CLI must be built

## Process

1. **Build TypeScript SDK binaries**
   - Ensure `test-client` and `test-server` are built and executable

2. **Run Each Scenario**
   - For each scenario in `data.json`:
     - Start the server with appropriate transport
     - Run the client through the MITM logger
     - Capture all JSON-RPC messages with annotations

3. **Generate Golden Files**
   - Save captured logs to `compliance/goldens/<scenario-id>.jsonl`
   - Each line is an `AnnotatedJSONRPCMessage`
   - Include all metadata (sender, recipient, timestamps, transport details)

4. **Validate Goldens**
   - Ensure all scenarios have corresponding golden files
   - Validate that logs match expected patterns
   - Check for completeness of captured interactions

## Example Command

For stdio transport:
```bash
compliance/typescript-sdk/test-client \
    --scenario-id 1 \
    --client-id "client1" \
    stdio \
    compliance/harness/mitm stdio \
        --log compliance/goldens/1.jsonl \
        compliance/typescript-sdk/test-server \
            --server-name CalcServer \
            --transport stdio
```

## Output

Creates JSONL files in `compliance/goldens/` that serve as the reference for cross-SDK testing. These files contain the expected message flow for each scenario.