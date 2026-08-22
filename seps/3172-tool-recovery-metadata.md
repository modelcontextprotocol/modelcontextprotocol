# Recovery Metadata for MCP ToolAnnotations

## 1. Preamble

- **Title:** Recovery Metadata for MCP ToolAnnotations
- **Author:** [your name / handle]
- **Status:** Proposal (pre-submission draft)
- **Type:** Standards Track
- **PR:** TBD (assigned on submission per SEP-1850 process)
- **Created:** 2026-07-30

## 2. Abstract

MCP's `ToolAnnotations` currently describe whether a tool is read-only, destructive, idempotent, or operates in an open world — information aimed primarily at approval/UX decisions ("should a human be asked before this runs"). None of these annotations tell an orchestrator what to do _after_ a tool has already succeeded and a later step in the same workflow fails. This proposal adds an optional `recovery` field to `ToolAnnotations` that lets a tool declare a compensating operation — a separate tool call, with parameters bound from the original call's response — that can undo its effect. The binding syntax follows the `Link` object from OpenAPI 3.0, adapted to MCP's tool-call model. The field is additive, advisory, and orthogonal to `idempotentHint`: idempotency governs safe retry of a single step that has not yet completed; `recovery` governs safe undoing of a step that has already completed, when a subsequent step in the same workflow fails. Where no compensating operation exists or is declared, the workflow's failure handling is unchanged from today.

## 3. Motivation

MCP tool calls are increasingly composed into multi-step workflows by orchestrators (LangGraph, custom agent loops, etc.) where an early step causes a real, external side effect — a payment is charged, an inventory unit is reserved — before a later step fails. Today, `ToolAnnotations` gives an orchestrator no machine-readable signal about what to do next. It can inspect `destructiveHint` or `idempotentHint` on the _failed_ tool, but neither field says anything about the _already-succeeded_ tools earlier in the chain. In practice this means one of three things happens: the workflow aborts and leaves side effects in place for a human to clean up; the orchestrator hard-codes framework-specific cleanup logic that doesn't travel if the workflow is later run by a different orchestrator; or teams build a bespoke state/compensation layer on top of MCP, which is exactly the kind of gap several production teams (including a Shopify engineer describing a "MCP Lite" workaround, and a widely cited "Is MCP Outdated? A 2026 Reality Check" write-up) have already reported hitting.

The pattern this workflow needs — compensating actions that undo the effect of an already-committed step — is well established in distributed systems (the Saga pattern) and has already been implemented at the framework layer more than once for LLM agent workflows specifically (SagaLLM, ALAS, and LangGraph v1.2's built-in Saga support). What's missing is not the pattern itself, but a way to express it _in the tool's own wire-format descriptor_, so that any MCP-compliant orchestrator — not just the one framework that happened to implement Saga support — can discover and use it. Today, a tool that has a well-defined compensating action (e.g. `refund_payment` for `charge_payment`) has no way to advertise that fact to a client it doesn't know about in advance.

## 4. Specification

### 4.1 New field: `recovery`

An optional field is added to the `ToolAnnotations` interface:

```typescript
interface ToolAnnotations {
  // ... existing fields (title, readOnlyHint, destructiveHint,
  //     idempotentHint, openWorldHint) unchanged ...

  recovery?: {
    strategy: "compensation";
    compensatingOperation: {
      operationId: string; // name of a tool exposed by the same server
      parameters: Record<string, string>; // runtime-expression bindings, see 4.2
    };
  };
}
```

`strategy` is a string enum to allow future extension (e.g. `"retry-elsewhere"`, `"manual-only"`) without a breaking change; this proposal defines only `"compensation"`. A tool with no `recovery` field makes no claim about recoverability, identical to today's behavior — this is a purely additive change.

This proposal deliberately scopes `compensatingOperation` to `operationId` — a tool exposed by the same server as the original call. A cross-server reference (analogous to OpenAPI's `operationRef`) would raise separate questions of authentication, remote discovery, trust, and failure domains that are unnecessary for the motivating use case and are left to a future SEP if same-server compensation proves useful in practice.

### 4.2 Parameter binding

Binding of the compensating operation's parameters follows OpenAPI 3.0's `Link` object runtime-expression syntax (`$response.body#/field`, `$response.header.<name>`, etc.), applied to the _original_ tool call's response. For example, a `charge_payment` tool that returns `{"transactionId": "TXN-123", "amount": 59.97}` can declare:

```yaml
recovery:
  strategy: compensation
  compensatingOperation:
    operationId: refund_payment
    parameters:
      transactionId: $response.body#/transactionId
```

An orchestrator that needs to compensate this call resolves `$response.body#/transactionId` against the stored response of the original `charge_payment` invocation, then invokes `refund_payment` with the resolved value. The syntax intentionally mirrors OpenAPI 3.0 runtime expressions so implementations may reuse existing parsers where convenient; no new expression language is introduced.

If a runtime expression cannot be resolved (e.g. the referenced field is absent from the stored response), the orchestrator MUST treat recovery metadata as unavailable for that operation and fall back to today's behavior for that step, rather than invoking the compensating operation with partial or default arguments.

### 4.3 Orchestrator behavior (advisory, not mandated)

This SEP does not require any client or orchestrator to implement compensation. It defines the _metadata shape_ only. A conforming orchestrator that supports recovery MAY use the declared recovery metadata to compensate previously completed operations on workflow failure. Reverse completion order is RECOMMENDED as a default strategy. Steps with no `recovery` field are left as-is, matching current behavior.

### 4.4 Non-goals

This proposal explicitly does **not**:

- Define distributed transactions or ACID guarantees across tool calls.
- Require any orchestrator to implement compensation.
- Standardize a workflow engine, execution graph, or ordering language.
- Define retry policies, backoff, or checkpoint/resume semantics — these are separable concerns, out of scope here, and left to future proposals.
- Guarantee that compensation itself succeeds — see Rationale, "Open questions."

## 5. Rationale

### 5.1 Why not just use `idempotentHint`?

A related proposal, SEP-1984 ("Comprehensive Tool Annotations"), included a `reversibleHint` boolean, and a reviewer objected that "reverting is usually harder to implement and error prone" and that idempotent retry is generally the more robust pattern. That objection is correct for the failure mode it addresses, but idempotency and compensation address different failure modes:

| Failure                                                                                 | Idempotency helps? | Compensation helps? |
| --------------------------------------------------------------------------------------- | ------------------ | ------------------- |
| Network timeout before completion                                                       | Yes                | Usually unnecessary |
| Duplicate invocation of the same step                                                   | Yes                | No                  |
| A later, independent step fails after this step already committed a durable side effect | No                 | Yes                 |

When a workflow step fails _after_ an earlier step has already committed a durable side effect, retrying the earlier operation does not undo it — retrying `charge_payment` does not un-charge a card that was already charged; it only guards against charging it twice. A compensating operation is required to restore the previous state. The two mechanisms are complementary, not competing, and this proposal is scoped narrowly to the second case, which today has no representation in `ToolAnnotations` at all.

### 5.2 Related work

- **SEP-1984** proposed a boolean `reversibleHint` with no binding mechanism; this proposal instead reuses OpenAPI's `Link` runtime-expression convention to make the compensating call directly invocable, and deliberately avoids the term "reversible" since not every operation with a recovery strategy is fully undoable (see 4.4).
- **SEP-2487** ("Add `execution.requirements` field to Tool for preconditions") addresses a different problem — declaring what must be true _before_ a tool runs (auth, approval, ordering) — and is complementary rather than overlapping with this proposal, which addresses what to do _after_ a tool has already run and a later step fails.
- **SagaLLM**, **ALAS**, and **Atomix** demonstrate the Saga/compensation pattern for LLM agent workflows at the framework or research-prototype level. **LangGraph v1.2** ships built-in Saga support inside its own state graph. None of these expose recovery relationships through a protocol-level tool description that independent orchestrators can consume without framework-specific integration. This proposal's contribution is narrowly that interoperability, not the underlying pattern, which is well established elsewhere.

### 5.3 Why recovery metadata belongs on the tool, not the workflow

An alternative design would declare compensation relationships in the workflow definition (as LangGraph's Saga support does) rather than on the tool descriptor itself. This proposal deliberately places `recovery` on the tool because it describes a property of the operation, not of any particular workflow. A payment capture is compensated by a refund regardless of whether it appears in a checkout workflow, an order-modification workflow, or a subscription-renewal workflow. Declaring the relationship once, on the tool, avoids duplicating the same recovery knowledge across every workflow definition and every orchestrator that happens to call the tool — which is the same reasoning that already justifies putting `idempotentHint` and `destructiveHint` on the tool rather than requiring each caller to know and redeclare them.

A related but distinct objection is that `recovery`, unlike existing annotation fields, references _another_ operation rather than describing the current one in isolation, and so arguably doesn't belong in `ToolAnnotations` at all. Although `recovery` references another operation, it still describes a behavioral property of the current operation: namely, how its externally visible effects may be compensated. This is analogous to `idempotentHint`, which likewise describes execution semantics rather than presentation or approval metadata — the fact that expressing "how to compensate this" requires naming a second operation doesn't change that the claim being made is about the _first_ operation's behavior.

### 5.4 Open questions

- **Compensation ordering:** the reference implementation compensates in reverse (LIFO) order of completion. This SEP does not mandate that orchestrators use LIFO — only recommends it as a sensible default — since some workflows may have compensations that are safe to run in any order or in parallel.
- **Failure of compensation itself:** if a compensating operation fails, this SEP does not define a terminal protocol-level state for that case. It is left to the orchestrator (e.g., surface to a human, retry the compensation if it is itself idempotent) pending real-world experience with this field before standardizing further.

## 6. Backward Compatibility

Fully backward compatible. `recovery` is an optional field on `ToolAnnotations`; existing servers, clients, and tools that do not set it are unaffected, and existing clients that don't recognize the field will simply ignore it, per MCP's existing annotation-handling guidance.

## 7. Reference Implementation

A standalone prototype (~230 lines) implements a three-step workflow (`reserve_inventory` → `charge_payment` → `create_shipment`) with a simulated failure in the final step. It runs the workflow twice: once against a baseline orchestrator that reads only today's `ToolAnnotations` (workflow aborts, side effects left in place), and once against an orchestrator that also reads the proposed `recovery` field (workflow automatically compensates in reverse order and reaches a consistent terminal state). The orchestrator code contains no hard-coded references to `refund_payment` or `release_inventory` — those names appear only in the tool metadata itself, demonstrating that the recovery behavior is driven entirely by declared metadata rather than framework-specific glue. The reference implementation demonstrates that identical workflow logic can execute under both orchestrators, with the enhanced orchestrator deriving recovery behavior exclusively from declared metadata and without embedding tool-specific recovery logic. [Link to prototype repo/gist — to be added on submission.]

## 8. Security Implications

`recovery.compensatingOperation` causes a tool call to be invoked automatically, without a fresh human-in-the-loop approval, when a workflow fails — by an orchestrator that chooses to support this field. Implementers should treat a declared compensating operation with at least the same scrutiny as the original tool call: a malicious or compromised server could declare a `compensatingOperation` that does something other than what its name implies. As with existing `ToolAnnotations`, clients MUST NOT treat `recovery` metadata as fully trusted attestation from a potentially untrusted server, and orchestrators that auto-invoke compensating operations should consider surfacing them to the same approval/audit path as the original destructive or state-changing call.

Automatic compensation can itself trigger a destructive operation (a refund, a deletion, a release of a held resource) without a fresh human-in-the-loop approval at the moment it runs. An orchestrator MAY require the same approval policy for an automatically-invoked `compensatingOperation` that it would have required had that operation been invoked directly by the model — this is a natural extension of the existing approval discussion above, not a separate mechanism.
