# Update SDK Implementation

This command generates or updates client and server test binaries for a specific SDK.

## Usage

```
/update_sdk <sdk-name>
```

Where `<sdk-name>` is one of:
- typescript
- python
- go
- java
- kotlin
- rust
- swift
- csharp
- ruby

## Process

1. **Create/Update CLAUDE.md**
   - Create `compliance/<sdk-name>/CLAUDE.md` with:
     - Links to SDK documentation
     - Links to official examples
     - SDK-specific implementation guidance
     - Build and test instructions

2. **Generate Client Binary**
   - Create `compliance/<sdk-name>/test-client` that:
     - Accepts `--scenario-id` and `--id` flags
     - Reads scenarios from `compliance/scenarios/data.json`
     - Implements the client behavior for the specified scenario
     - Supports stdio and HTTP transports as specified

3. **Generate Server Binary**
   - Create `compliance/<sdk-name>/test-server` that:
     - Accepts `--server-name` and `--transport` flags
     - Reads server definitions from `compliance/scenarios/data.json`
     - Implements CalcServer functionality as defined
     - Supports all specified transports

4. **Generate Tests**
   - Create unit tests for client and server implementations
   - Ensure binaries can be built and run
   - Test basic scenario execution

5. **Build Scripts**
   - Create build scripts appropriate for the SDK
   - Ensure binaries are executable from the compliance test harness

## Implementation Details

Each SDK implementation should:
- Check that scenario/server descriptions match when built
- Handle all transport types correctly
- Implement proper error handling
- Support JSON-RPC message format
- Follow SDK best practices and idioms

## Output

The command creates a fully functional SDK test implementation in `compliance/<sdk-name>/` ready for cross-SDK testing.