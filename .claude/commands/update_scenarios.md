# Update MCP Compliance Scenarios

This command suggests improvements to `compliance/scenarios/data.json` based on the MCP specification. It can be run from scratch to seed scenarios or after spec updates to ensure coverage.

## Usage

Run this command to:
1. Create initial scenarios if `data.json` doesn't exist
2. Update scenarios after spec changes to ensure coverage
3. Review and disambiguate existing scenario descriptions
4. Handle golden file updates if they exist

## Specification Files

This command must analyze ALL of the following specification files:

### Main Specification
- `@/docs/specification/draft/index.mdx` - Overview and key principles

### Architecture
- `@/docs/specification/draft/architecture/index.mdx` - System architecture

### Basic Protocol
- `@/docs/specification/draft/basic/index.mdx` - Core protocol mechanics
- `@/docs/specification/draft/basic/lifecycle.mdx` - Connection lifecycle
- `@/docs/specification/draft/basic/transports.mdx` - Transport layers (stdio, SSE, streamable HTTP)
- `@/docs/specification/draft/basic/authorization.mdx` - Authorization mechanisms
- `@/docs/specification/draft/basic/security_best_practices.mdx` - Security guidelines
- `@/docs/specification/draft/basic/utilities/cancellation.mdx` - Request cancellation
- `@/docs/specification/draft/basic/utilities/ping.mdx` - Ping/pong keepalive
- `@/docs/specification/draft/basic/utilities/progress.mdx` - Progress notifications

### Server Features
- `@/docs/specification/draft/server/index.mdx` - Server capabilities overview
- `@/docs/specification/draft/server/tools.mdx` - Tool definitions and execution
- `@/docs/specification/draft/server/resources.mdx` - Resource management and subscriptions
- `@/docs/specification/draft/server/prompts.mdx` - Prompt templates
- `@/docs/specification/draft/server/utilities/completion.mdx` - Text completion
- `@/docs/specification/draft/server/utilities/logging.mdx` - Server-side logging
- `@/docs/specification/draft/server/utilities/pagination.mdx` - Pagination patterns

### Client Features
- `@/docs/specification/draft/client/index.mdx` - Client capabilities overview
- `@/docs/specification/draft/client/elicitation.mdx` - User input elicitation
- `@/docs/specification/draft/client/roots.mdx` - File system roots
- `@/docs/specification/draft/client/sampling.mdx` - LLM sampling requests

## Implementation Guidelines

### 1. Scenario Quality Requirements
- **Unambiguous**: Descriptions must be prescriptive enough that any SDK implementation would produce identical replay logs
- **Complete**: Each scenario should specify exact inputs, outputs, and expected behavior
- **Testable**: Scenarios must be verifiable through message logs

### 2. Process for New Scenarios
1. Analyze all specification files listed above
2. Extract protocol features and requirements
3. Design scenarios covering:
   - Basic connectivity and initialization
   - Tool invocation (simple and with elicitation)
   - Resource management and subscriptions
   - Prompt templates with parameters
   - Multi-client scenarios
   - Transport-specific scenarios (stdio, SSE, streamable HTTP)
   - Error handling and edge cases
   - Cancellation flows
   - Progress notifications
   - Concurrent operations
   - Protocol version negotiation
   - Change notifications (tools, resources, roots)

### 3. Process for Existing Scenarios with Goldens
If golden files exist in `@/compliance/scenarios/goldens/`:
1. Review each scenario description for ambiguity
2. Update TypeScript SDK implementation if scenarios change
3. Update golden files and verify they match expected behavior per specs
4. Iterate until golden logs align with scenario descriptions
5. Use one subagent per scenario for parallel analysis

### 4. Golden File Handling
- Golden files contain expected JSON-RPC message sequences
- First line(s) are comments with scenario description
- Messages include sender/recipient metadata and transport details
- Ensure goldens match what specs prescribe for each scenario

## Output

Produce updates to `@/compliance/scenarios/data.json` matching the `Scenarios` type from `@/compliance/src/types.ts`.

## Execution Strategy

Use subagents for parallel work:
- One subagent per scenario for reviewing/updating
- Subagents should check:
  - Scenario description clarity
  - Coverage of spec features
  - Golden file alignment (if exists)
  - Ambiguity in expected behavior