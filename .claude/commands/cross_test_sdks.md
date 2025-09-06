# Cross-Test SDKs

This command runs compliance tests across different SDK combinations.

## Usage

```
/cross_test_sdks <sdk1> [<sdk2> ...]
```

Example:
```
/cross_test_sdks typescript python go
```

## Process

1. **Validate SDKs**
   - Ensure all specified SDKs have implementations in `compliance/<sdk-name>/`
   - Check that binaries are built and executable

2. **Run Test Matrix**
   - For each client SDK:
     - For each server SDK:
       - For each scenario:
         - Run the test with MITM logger
         - Capture the replay log
         - Compare against golden log
         - Record success/failure

3. **Generate Report**
   - Create a test matrix showing:
     - ✅ Passing combinations
     - ❌ Failing combinations
     - Detailed error messages for failures
     - Log differences when comparison fails

4. **Output Results**
   - Console summary of pass/fail rates
   - Detailed report in `compliance/test-results/`
   - JSONL logs for failed tests for debugging

## Test Execution

For each test:
1. Start server binary with MITM logger
2. Run client binary through MITM
3. Capture all traffic
4. Normalize logs for comparison
5. Compare against golden reference
6. Clean up processes

## Error Handling

- Timeout if client/server hangs
- Capture stderr for debugging
- Ensure clean process termination
- Report transport-specific issues

## Output

- Summary matrix in console
- Detailed results in `compliance/test-results/cross-test-<timestamp>.json`
- Individual test logs for debugging failures