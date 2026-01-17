# SEP-986: Specify Format for Tool Names

- **Status**: Final
- **Type**: Standards Track
- **Created**: 2025-07-16
- **Author(s)**: kentcdodds
- **Issue**: #986

## Abstract

The Model Context Protocol (MCP) currently lacks a standardized format for tool names, resulting in inconsistencies and confusion for both implementers and users. This SEP proposes a clear, flexible standard for tool names: tool names should be 1–64 characters, case-sensitive, and may include alphanumeric characters, underscores (\_), dashes (-), dots (.), and forward slashes (/). This aims to maximize compatibility, clarity, and interoperability across MCP implementations while accommodating a wide range of naming conventions.

## Motivation

Without a prescribed format for tool names, MCP implementations have adopted a variety of naming conventions, including different separators, casing, and character sets. This inconsistency can lead to confusion, errors in tool invocation, and difficulties in documentation and automation. Standardizing the allowed characters and length will:

- Make tool names predictable and interoperable across clients.
- Allow for hierarchical and namespaced tool names (e.g., using / and .).
- Support both human-readable and machine-generated names.
- Avoid unnecessary restrictions that could block valid use cases.

## Rationale

Community discussion highlighted the need for flexibility in tool naming. While some conventions (like lower-kebab-case) are common, many tools and clients use uppercase, underscores, dots, and slashes for namespacing or clarity. The proposed pattern—allowing a-z, A-Z, 0-9, \_, -, ., and /—is based on patterns used in major clients (e.g., VS Code, Claude) and aligns with common conventions in programming and APIs. Restricting spaces and commas avoids parsing issues and ambiguity. The length limit (1–64) is generous enough for most use cases but prevents abuse.

## Specification

- Tool names SHOULD be between 1 and 64 characters in length (inclusive).
- Tool names are case-sensitive.
- Allowed characters: uppercase and lowercase ASCII letters (A-Z, a-z), digits
  (0-9), underscore (\_), dash (-), dot (.), and forward slash (/).
- Tool names SHOULD NOT contain spaces, commas, or other special characters.
- Tool names SHOULD be unique within their namespace.
- Example valid tool names:
  - getUser
  - user-profile/update
  - DATA_EXPORT_v2
  - admin.tools.list

## Backwards Compatibility

This change is not backwards compatible for existing tools that use disallowed characters or exceed the new length limits. To minimize disruption:

- Existing non-conforming tool names SHOULD be supported as aliases for at least one major version, with a deprecation warning.
- Tool authors SHOULD update their documentation and code to use the new format.
- A migration guide SHOULD be provided to assist implementers in updating their tool names.

## Reference Implementation

A reference implementation can be provided by updating the MCP core library to enforce the new tool name validation rules at registration time. Existing tools can be updated to provide aliases for their new conforming names, with warnings for deprecated formats. Example code and migration scripts can be included in the MCP repository.

## Security Implications

None. Standardizing tool name format does not introduce new security risks.
