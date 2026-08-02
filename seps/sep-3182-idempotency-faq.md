# FAQ: Request Idempotency SEP

Companion to `sep-3182-request-idempotency.md`. Answers to questions likely to come up in review.

---

## Design decisions

**Why isn't the JSON-RPC `id` field sufficient?**
`id` exists to correlate a response with its request, not to detect duplicates. A retry commonly gets a fresh `id`, and JSON-RPC doesn't require a server to remember the `id`s of requests it has already completed.

**Why isn't `_meta` sufficient?**
An idempotency key placed in `_meta` would be implementation-specific, with no guarantee it survives end-to-end. That's not just a theoretical concern — three client frameworks already in use (Microsoft's Agent Framework, Agno, and OpenAI's Agents SDK) drop `_meta` from tool results entirely, and one of their own maintainers has called this a spec violation. A field that real clients already strip out isn't something you can build a guarantee on.

**Why isn't this a transport-level mechanism, like an HTTP header?**
Because MCP supports transports that have no header layer at all. Stdio — the default for Claude Desktop, Claude Code, and most IDE integrations — is newline-delimited JSON-RPC with no concept of headers. A header-based design simply wouldn't apply everywhere MCP is used.

**SEP-1686 says idempotency "applies to all MCP messages" — why does this SEP only cover `tools/call`?**
SEP-1686 was describing the scope of the problem, not requiring the first fix to solve it everywhere at once. Every piece of evidence gathered — the ad hoc conventions servers have already built, the industry precedent, SEP-1686's own motivating example — is about side-effecting tool calls specifically. Nothing suggests `initialize`, `ping`, `listTools`, or notifications carry the same duplicate-execution risk. Starting narrow and letting a later SEP extend the mechanism if evidence turns up elsewhere is the same approach SEP-1036 took.

**Why require a capability negotiation instead of just letting servers ignore the field if they don't support it?**
Because silent ignoring is worse than an explicit error. If a client sends `idempotencyKey` with no way to confirm the server actually honors it, it has no way to tell "deduplicated correctly" apart from "ignored and executed twice." The capability lets a client check that guarantee is real before it depends on it. Sending the key to a server that hasn't advertised support does no harm — it just doesn't buy you anything.

**Why replay the original error too, not just successful results?**
Because a client that never got a response has no way to know whether the original call succeeded, failed, or crashed midway. Replaying whatever actually happened — including an error — is what keeps the retry honest. Guessing "it must have failed" and re-executing would defeat the whole point. This also matches how Stripe's own idempotency keys behave: they replay the original outcome regardless of whether it was a success or an error.

**Why not require a specific comparison algorithm, like RFC 8785 canonicalization, to check whether two requests match?**
What matters for interoperability is that two servers reach the same answer to "are these the same request," not how they get there. A server with large, complex arguments might hash them; one with small payloads might just compare directly. Both are fine as long as they agree on the outcome, which is why the SEP specifies the comparison rules themselves (how numbers and strings should be treated) rather than mandating one library or algorithm.

**Why reject a reused key with different arguments, instead of replaying the cached result or just treating it as a new call?**
Both of those alternatives do the wrong thing quietly. Replaying the cached result would apply the first operation's outcome to what the client meant as a second, different operation. Treating it as new defeats the whole purpose of the key, and the client never finds out something went wrong. Rejecting the call outright is the only option that actually surfaces the problem — which is almost always a client-side bug — so the client can fix it, typically by generating a new key.

**Isn't this just Stripe's idempotency key, copied into MCP?**
The core idea — a client-generated identifier for a retry — is the same, because it's solving the same problem: a client that can't tell "this never arrived" from "this arrived, ran, and the response got lost." Everything specific to how it's wired into MCP (where the field sits in the request, how support is negotiated, why it's scoped to `tools/call`) is new here, not carried over from Stripe.

**Why does this need to live in the protocol — couldn't an SDK just handle retries safely on its own?**
Because an SDK-level fix only protects clients built on that SDK. MCP deployments routinely mix languages and frameworks — a Python server, a TypeScript client, a Go gateway in between — and no SDK can make another SDK's users follow its convention. If every SDK solved this on its own, you'd end up with the same fragmentation already happening today, just one layer down instead of fixed.

**Isn't idempotency really a per-tool or per-application concern, not something the protocol should standardize?**
The protocol already standardizes how a client asks a server to run a tool — that's what `tools/call` is for. So it makes sense for the protocol to also standardize how a client says "this call is a retry of one I already made." Whether a specific tool, like `charge_payment`, needs to behave idempotently is an application question. But whether a client and server can even agree on what a retry means is a protocol question, and right now MCP has no answer to it — which is exactly why every server ends up inventing its own field name and storage approach.

**Doesn't the fact that well-built servers already handle this on their own mean the protocol doesn't need to get involved?**
It's actually the opposite — that's the argument for standardizing it. This is the same situation SEP-1036 was in: implementers weren't incapable of returning login URLs and having clients recognize them, they were already doing it, just each in their own incompatible way. The hard part was never building the mechanism. It's getting independent implementations to agree on the same interface, which only a shared standard can do.

**MCP 2026-07-28 made the protocol stateless and removed sessions and the `initialize` handshake — does this proposal still make sense?**
Yes, and the change actually strengthens the case for it. Capability discovery moves to `server/discover`, which this proposal already reflects. The bigger effect is on deployment: session affinity used to mean a retry had some chance of landing back on the same server instance that handled the original request, which gave an in-memory dedup store a kind of accidental partial protection. Under the stateless core, any instance can handle any request, so that accidental protection is gone — a production server now needs a dedup store that's actually shared across instances, not per-process. The mechanism this SEP defines doesn't change; what changes is that skipping it is riskier than it used to be.

**How does this interact with Multi Round-Trip Requests (MRTR)?**
They solve different problems and shouldn't be conflated. An MRTR exchange consists of multiple independent `tools/call` requests (SEP-2322). This SEP does **not** define idempotency semantics for MRTR continuation requests carrying `requestState` and `inputResponses`; those requests are intentionally outside the scope of this proposal, and this SEP should not be read as encouraging reuse of a single `idempotencyKey` across an entire MRTR exchange. Whether MRTR continuations should participate in this mechanism — and, if so, what constitutes request equivalence for them — is left to future work.

---

## Tradeoffs — real costs, not hidden ones

**Does "must not execute twice" actually hold if the server crashes?**
Not unconditionally. If a server runs the side effect and then crashes before it saves the record of having done so, a retry afterward will run it again. This isn't a gap specific to this proposal — no protocol field can guarantee exactly-once execution across a server's own crash, and HTTP-based idempotency keys have the same limit. The SEP's language should be read as describing normal operation, not an absolute guarantee that survives any failure. See the "Implementation ordering is intentionally unspecified" section in the Specification for the full explanation.

**Is documenting the retention window a MUST or just a SHOULD?**
It's a SHOULD. Some MCP servers — small, local, embedded ones — have no real way to publish documentation, and a hard MUST would shut them out of conforming to the SEP at all. That's a genuine tradeoff: a client talking to a server with an undocumented retention window has no way to know how long a retry stays safe. Reasonable people could land on MUST instead if they weight interoperability more heavily than accommodating the smallest implementations — this is a judgment call, not a settled question.

**How much real interoperability does this create, if storage, retention, and comparison logic are all left up to each server?**
What's actually standardized is the retry key itself, the decision to deduplicate, and what happens on conflict — not how a server stores state, how long it keeps it, or how it implements comparison. That's the same scope HTTP idempotency keys take on, and it's meant to standardize only the parts two implementations actually need to agree on to interoperate. It's a narrower guarantee than a fully specified wire protocol, and that's a deliberate tradeoff, not an oversight.

**What happens if the tool's implementation changes between the original call and a retry — does the server replay the old result or run the new code?**
A retry within the retention window always replays the original result, because equivalence is defined by the tool name and arguments, not by which version of the tool ran. On a server that ships tool changes frequently and keeps a long retention window, a client could get back a result produced by logic that's since been replaced. The reasoning for this default: a retry should get the outcome of the operation the client actually asked for, not a different one substituted silently. A server that finds this tradeoff unacceptable can simply use a shorter retention window.

**If the world changes after the original call — say, someone manually undoes a delete — and a client later retries and gets back the original "deleted successfully" response, is that a bug?**
No, that's expected behavior, not a bug. Replay means returning what happened at the time of the original call, not re-checking current state. Idempotency guarantees that the same request produces the same recorded outcome — it doesn't guarantee that the response still reflects reality. Trying to do both would turn this into a staleness-detection mechanism, which is a separate and harder problem this SEP doesn't attempt to solve. A client that needs to know whether a cached result is still accurate needs a different mechanism for that.

**Should the capability advertise the retention window itself, instead of leaving that to server documentation?**
That would be a reasonable addition for a future SEP. Something like `"idempotency": {"retentionSeconds": 86400}` would let a client check retry safety programmatically instead of relying on docs it can't read at runtime. It isn't included here because it adds a separate concern to a proposal that's meant to stay narrow, and because nothing so far suggests retention-window discovery is causing the same kind of incompatible workarounds that motivated the core mechanism.

**Is there enough real-world MCP implementation experience behind this yet?**
This is the weakest part of the case. There's solid evidence the underlying problem is real — independent papers, engineering write-ups, and a working prototype ([github.com/abluva/mcp-request-idempotency-reference](https://github.com/abluva/mcp-request-idempotency-reference)) all point the same way. What's thinner is evidence of multiple MCP-native implementations already running in production and independently converging on this design — what exists so far mostly describes the problem and sketches ad hoc fixes, rather than shipped, competing implementations. More implementations — ideally in more than one language, from more than one author — during review would genuinely help close that gap.
