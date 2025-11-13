# MCP Repository Codebase Analysis

## Overview

This analysis explores the current structure of the MCP (Model Context Protocol) repository to understand the existing setup and identify what needs to be built for the compliance test harness.

## Project Setup and Build Configuration

### TypeScript/JavaScript Setup
- **Package.json**: The project is configured as `@modelcontextprotocol/specification` (v0.1.0)
- **Node version**: Requires Node >= 20
- **TypeScript config**: Basic tsconfig.json with:
  - Target: ES2016
  - Root directory: schema/
  - Strict mode enabled
  - No emit (type checking only)

### Current Dependencies
The project has minimal dependencies, focused on documentation and schema validation:
- TypeScript and typescript-json-schema for schema generation
- Mintlify for documentation
- Prettier for formatting
- AJV for JSON schema validation
- tsx for running TypeScript files

### Scripts
- Schema validation: `check:schema:ts` and `check:schema:json`
- Documentation: `serve:docs`, `check:docs:format`, `check:docs:links`
- JSON schema generation from TypeScript

## Directory Structure

### Root Level
- `/docs/` - Documentation in MDX format
- `/schema/` - TypeScript schema definitions with versioned subdirectories
- `/blog/` - Blog content
- `stdio-wrapper.mjs` - Example transport wrapper implementation
- Standard config files: package.json, tsconfig.json, .npmrc, .nvmrc

### Schema Directory
The schema directory contains versioned protocol specifications:
- `/schema/draft/` - Current draft specification (schema.ts and schema.json)
- `/schema/2024-11-05/` - Older version
- `/schema/2025-03-26/` - Future version
- `/schema/2025-06-18/` - Future version

## MCP Specification Structure

### Core Schema File
Located at `/schema/draft/schema.ts`, defines:
- JSON-RPC message types and structures
- Protocol version constants (LATEST_PROTOCOL_VERSION = "DRAFT-2025-v3")
- Base types: Request, Notification, Result, etc.
- Initialization protocol
- Client and server capabilities
- Error codes and handling

### Documentation Structure
The specification is documented in 21 MDX files under `/docs/specification/draft/`:

#### Architecture
- `architecture/index.mdx` - Overall system architecture

#### Basic Protocol
- `basic/index.mdx` - Core protocol concepts
- `basic/lifecycle.mdx` - Connection lifecycle
- `basic/transports.mdx` - Transport mechanisms
- `basic/authorization.mdx` - Auth patterns
- `basic/security_best_practices.mdx` - Security guidelines
- `basic/utilities/` - Cancellation, progress, ping

#### Server Features
- `server/index.mdx` - Server capabilities overview
- `server/tools.mdx` - Tool definitions
- `server/resources.mdx` - Resource management
- `server/prompts.mdx` - Prompt templates
- `server/utilities/` - Completion, logging, pagination

#### Client Features
- `client/elicitation.mdx` - User input requests
- `client/roots.mdx` - File system roots
- `client/sampling.mdx` - LLM sampling

## Existing Test Infrastructure

**Finding**: There is currently NO existing test infrastructure or compliance directory in the repository. This means we'll need to build the entire compliance test harness from scratch.

## Transport Examples in stdio-wrapper.mjs

The `stdio-wrapper.mjs` file provides valuable examples of transport handling:

### Key Components
1. **proxyTransports function** (lines 18-42):
   - Bidirectionally propagates messages between client and server transports
   - Handles close events to ensure proper cleanup
   - Manages message forwarding with proper requestId handling for cancellations

2. **Transport Types Used**:
   - `StdioClientTransport` - For stdio-based communication
   - `StreamableHTTPServerTransport` - For HTTP/SSE communication
   - `StreamableHTTPClientTransport` - For HTTP client connections

3. **HTTP Server Implementation**:
   - Express-based server with auth middleware
   - Handles POST requests for JSON-RPC messages
   - GET requests for SSE streams
   - DELETE requests for session termination
   - Session management with transport storage by session ID

4. **Key Features for Interceptor Implementation**:
   - Message interception pattern in `proxyTransports`
   - Session ID handling via `mcp-session-id` header
   - Event store for resumability
   - Proper cleanup on transport close

## What Needs to Be Built

Based on this analysis, we need to create from scratch:

1. **Compliance Directory Structure**:
   - `/compliance/scenarios/data.json` - Scenario definitions
   - `/compliance/src/` - TypeScript infrastructure
   - `/compliance/tests/` - Test harness
   - `/compliance/goldens/` - Golden replay logs
   - `/compliance/<sdk-name>/` - Per-SDK implementations

2. **Core Infrastructure**:
   - TypeScript types for scenarios and logging
   - Transport interceptors (stdio, SSE, streamable HTTP)
   - Man-in-the-middle binary for logging
   - Test orchestration framework

3. **Slash Commands**:
   - `/.claude/commands/update_scenarios.md`
   - `/.claude/commands/update_sdk.md`
   - `/.claude/commands/update_goldens.md`
   - `/.claude/commands/cross_test_sdks.md`

4. **SDK Integration**:
   - Client and server binary specifications
   - Build automation for each SDK
   - Cross-SDK testing matrix

## Key Insights

1. The repository is primarily a specification project with minimal code
2. The `proxyTransports` pattern in stdio-wrapper.mjs provides a solid foundation for building interceptors
3. All protocol types are well-defined in TypeScript schema
4. No existing test infrastructure means complete freedom in design
5. The project uses modern Node.js features (ESM modules, top-level await)

## Next Steps

1. Set up the compliance directory structure
2. Create core TypeScript types based on the requirements
3. Implement transport interceptors using the patterns from stdio-wrapper.mjs
4. Build the CLI for the man-in-the-middle logger
5. Create slash commands for automation
6. Implement scenario definitions and test orchestration