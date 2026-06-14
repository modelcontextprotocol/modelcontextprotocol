# SEP-2001: Optional High Availability Patterns for Stateful Streaming in MCP Deployments

- **Status**: Draft
- **Type**: Informational
- **Created**: 2025-12-21
- **Author(s)**: Zhuozhi Ji <jizhuozhi.george@gmail.com> (@jizhuozhi)
- **Sponsor**: None
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2001

## Abstract

This SEP proposes optional high availability (HA) best practices for MCP deployments with stateful streaming sessions (
e.g., SSE). While the MCP protocol itself remains unchanged, production deployments often face challenges in maintaining
session continuity and resilience when using multiple replicas behind load balancers. This proposal outlines optional
patterns, including pub-sub event buses, cluster coordination with P2P forwarding, middleware/SDK abstraction, and
session partitioning. These patterns provide guidance for implementers to achieve HA without breaking protocol
compatibility or requiring client modifications.

## Motivation

Production MCP deployments increasingly target multi-node, horizontally scalable environments. Long-lived streaming
sessions (SSE) introduce challenges when routed through stateless HTTP ingress or load balancers:

- Session continuity may break if connections are routed to a different replica.
- Node failure or restart can interrupt ongoing streaming sessions.
- Resuming sessions across replicas is non-trivial without coordination.

Community discussions,
including [GitHub PR #325](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/325), have highlighted
these issues. Contributors concluded that session stickiness or shared session stores are practical implementation
considerations, but not mandated by the protocol. This creates an opportunity for **informational guidance** on HA
patterns that are optional and non-intrusive.

## Specification

This SEP does not introduce protocol-level changes. The following optional HA patterns are proposed for implementers:

### 1. Core HA Patterns

#### 1.1 Event Bus / Pub-Sub

- Externalize session events to a distributed pub-sub system.
- MCP replicas subscribe to session events to enable failover and session recovery.
- Decouples session lifetime from any single node.

#### 1.2 Cluster Coordination & P2P Forwarding

- MCP nodes maintain lightweight cluster state via gossip, shared stores, or JDBC ping.
- Session messages can be forwarded to the node currently handling the session.
- Avoids heavy consensus mechanisms to preserve throughput.

### 2. Implementation & Optimization Support

#### 2.1 Middleware / SDK Abstraction

- Encapsulates HA logic (pub-sub, P2P forwarding) within SDK or middleware.
- Keeps protocol handlers and business logic unchanged.
- Provides a transparent API to clients, allowing gradual adoption.

#### 2.2 Session Partitioning / Affinity Hints

- Session IDs may encode partitioning or affinity hints.
- Reduces coordination overhead.
- Affinity is advisory and must not impact correctness.

### 3. Illustrative Middleware-Oriented Model (Python, Non-Normative)

```python
async def handle_mcp_message(message, send):
    if message["type"] == "tool_call":
        result = await run_tool(message["payload"])
        await send({
            "type": "tool_result",
            "payload": result
        })

class MCPHAMiddleware:
    def __init__(self, ha_backend):
        self.ha = ha_backend

    def wrap(self, handler):
        async def wrapped(message, send):
            session_id = self.ha.ensure_session(message)

            async with self.ha.bind_session(session_id, send) as ha_send:
                await handler(message, ha_send)

        return wrapped
```

## Rationale

- **Alternate designs considered**: Sticky sessions at load balancer, full Raft replication, central shared state.
- **Why chosen approach**: Optional patterns allow HA without protocol changes, preserve throughput, and provide
  flexibility.
- **Related work**: Community PR #325; common HA patterns in distributed systems.
- **Community consensus**: PR discussion supports optional, non-normative guidance for HA.

## Backward Compatibility

No protocol changes are introduced. Existing clients and servers remain fully compatible. Adoption of HA patterns is
optional and implementation-defined.

## Security Implications

No new security surfaces are introduced by this SEP. Implementers should consider standard security practices for
distributed coordination, pub-sub, and session forwarding.

## Reference Implementation

- Prototype Python middleware shown above.
- No full reference implementation is required to mark SEP as draft.

## Additional Optional Sections

### Performance Implications

- Optional HA patterns may introduce additional latency or coordination overhead, but throughput is preserved by
  avoiding heavy consensus.

### Testing Plan

- Implementers should validate session continuity during failover, replica restart, and load balancer routing.

### Alternatives Considered

- Sticky sessions at LB (less flexible, not always feasible)
- Full Raft replication (high latency, throughput penalty)
- Central shared store (adds infrastructure complexity)

### Open Questions

- Best practices for large clusters with thousands of concurrent streaming sessions.
- Integration guidance for Streamable HTTP once adoption increases.

### Acknowledgments

- Community contributors to PR #325 for highlighting HA challenges in production MCP deployments.
