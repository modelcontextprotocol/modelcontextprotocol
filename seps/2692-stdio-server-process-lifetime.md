# SEP-2692: stdio Server Process Lifetime

- **Status**: Draft
- **Type**: Informational
- **Created**: 2026-05-06
- **Author(s)**: Nick Cooper (@nickcoai)
- **Sponsor**: Nick Cooper @nickcoai
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/{2692}

## Abstract

This SEP documents the intended process lifetime for MCP servers using the stdio transport.
For stdio, the server process is expected to live approximately as long as the host
application instance that launched it, rather than being scoped to a single task,
thread, or conversation. A single stdio server process should therefore be able to
serve multiple conversations over its lifetime.

This is a documentation-only clarification. It does not change the wire protocol,
schema, or lifecycle messages.

## Motivation

The stdio transport documentation states that the client launches the MCP server as a
subprocess, but it does not explicitly define the intended lifetime boundary for that
subprocess. In practice, this leaves room for implementations to treat a task, thread,
or conversation as the natural process boundary.

That interpretation is undesirable:

- It conflates application-level concepts such as tasks and conversations with the
  transport-level lifetime of the server process.
- It can cause unnecessary process churn and repeated initialization work.
- It can lead server authors to assume that process-local state is discarded between
  conversations, even though a stdio server may continue serving the host application
  across many of them.

Clients and server authors need an explicit statement of the intended model so that
stdio implementations converge on the same operational assumptions.

## Specification

The MCP documentation should clarify the following expectations for the stdio
transport:

1. A stdio MCP server process is expected to have approximately the same lifetime as
   the host application instance that launched it.
2. Stdio clients should not use an individual task, thread, or conversation as the
   default lifetime boundary for the server process.
3. While a stdio server process remains connected to a host application, it should be
   expected to handle requests associated with multiple tasks, threads, or
   conversations.
4. Stdio server authors should design their servers with the expectation that a single
   process can serve multiple conversations over its lifetime.
5. Host applications may still intentionally start, stop, or restart stdio servers for
   application-level reasons such as configuration changes, explicit server disablement,
   crash recovery, or application shutdown. This clarification does not require every
   configured server to remain running forever.

These statements should be added to the stdio transport documentation and reflected in
client- and server-facing documentation where stdio lifecycle expectations are
described.

## Rationale

The host application is the most natural owner of a stdio subprocess: it launches the
server, owns the pipes, and decides when the subprocess is no longer needed. Tasks,
threads, and conversations are application-level concepts that may come and go while
the same host application instance remains active, so they are poor default process
lifetime boundaries.

A task-scoped or conversation-scoped process model can be useful as an intentional host
implementation choice, but documenting it as the default would make stdio behavior less
predictable and would encourage servers to assume a narrower lifetime than the transport
actually requires.

This clarification also keeps stdio aligned with the transport documentation's existing
subprocess model while leaving host applications free to apply explicit resource
management policies when they choose to do so.

## Backward Compatibility

This SEP introduces no protocol or wire-format changes. It only clarifies the intended
documentation of existing stdio behavior.

## Security Implications

This SEP introduces no new security implications.

## Reference Implementation

Not applicable. This SEP proposes documentation-only clarification.
