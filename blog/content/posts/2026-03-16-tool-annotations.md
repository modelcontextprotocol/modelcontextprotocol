---
date: "2026-03-16T00:00:00+00:00"
publishDate: "2026-03-16T00:00:00+00:00"
title: "Tool Annotations as Risk Vocabulary: What Hints Can and Can't Do"
author: "Ola Hungerford (Maintainer), Sam Morrow (GitHub), Luca Chang (AWS)"
tags: ["mcp", "tool annotations", "security", "tools"]
ShowToc: true
draft: false
---

MCP tool annotations were introduced nearly a year ago as a way for servers to describe the behavior of their tools — whether they're read-only, destructive, idempotent, or reach outside their local environment. Since then, the community has filed five independent [Specification Enhancement Proposals](https://modelcontextprotocol.io/community/sep-guidelines) (SEPs) proposing new annotations, driven in part by a sharper collective understanding of where risk actually lives in agentic workflows. This post recaps where tool annotations are today, what they can and can't realistically do, and offers a framework for evaluating new proposals.

## What Tool Annotations Are

[Tool annotations](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) shipped in the `2025-03-26` spec revision. The current [`ToolAnnotations` interface](https://modelcontextprotocol.io/specification/2025-11-25/schema#toolannotations) looks like this:

```typescript
interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean; // default: false
  destructiveHint?: boolean; // default: true
  idempotentHint?: boolean; // default: false
  openWorldHint?: boolean; // default: true
}
```

Every property is a **hint**. The spec is explicit about this: annotations are not guaranteed to faithfully describe tool behavior, and clients **must** treat them as untrusted unless they come from a trusted server.

These four boolean hints give clients a basic risk vocabulary:

- **`readOnlyHint`**: Does the tool modify its environment?
- **`destructiveHint`**: If it does modify things, is the change destructive (as opposed to additive)?
- **`idempotentHint`**: Can you safely call it again with the same arguments?
- **`openWorldHint`**: Does the tool interact with an open world of external entities, or is its domain closed?

The first three hints mostly answer a preflight question: should the client ask for confirmation before calling this tool? `openWorldHint` is different. It's about where the tool reaches and what its output might carry back, which matters after the call as much as before. It's also the hint most sensitive to deployment context. "External" might mean anything outside a corporate network or anything beyond the local machine, depending on where the server runs. The safest posture is to treat anything a tool considers **external** as a potential source of untrusted content.

The defaults are deliberately cautious: a tool with no annotations is assumed to be non-read-only, potentially destructive, non-idempotent, and open-world. The spec assumes the worst until told otherwise. Making annotations optional kept the barrier to entry low for server authors, but it also means coverage is uneven. Many servers ship without them, and clients vary in how strictly they honor the pessimistic defaults. Closing that gap is part of what the current wave of SEPs is trying to do.

## How We Got Here

The [original proposal discussion](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/185) surfaced a question that still shapes every annotation proposal today: **what value do hints provide when they can't be trusted?** MCP co-creator Justin Spahr-Summers [raised it directly during review](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/185#discussion_r2010043988):

> I think the information itself, _if it could be trusted_, would be very useful, but I wonder how a client makes use of this flag knowing that it's _not_ trustable.

Basil Hosmer [pushed the point further](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/185#discussion_r2010702646), arguing that clients should ignore annotations from untrusted servers entirely:

> "Clients should ignore annotations from untrusted servers" applies to **all** annotations, even `title` — but especially the ones that describe operational properties.

The spec landed on a compromise: call everything a **hint**, require clients to treat hints as untrusted by default, and leave it to each client to decide how much weight to give them based on what it knows about the server.

The interface has stayed small since then, and that's been intentional. [`title` went in](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/663) because it's just a display name with no trust implications. `taskHint` was proposed as an annotation but [landed as `Tool.execution` instead](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1854), on the grounds that execution metadata isn't really a behavioral hint. Earlier takes on [stateless, streaming, and async annotations](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/489) and [security annotations](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1075) are worth knowing about too, since the same concerns show up again in the SEPs open today.

## What's Open Now

Five SEPs currently propose new annotations or closely related capabilities:

| SEP                                                                               | Proposal                                         | Status   |
| --------------------------------------------------------------------------------- | ------------------------------------------------ | -------- |
| [#1913](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1913)   | Trust and Sensitivity Annotations                | Draft    |
| [#1984](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1984)   | Comprehensive Tool Annotations for Governance/UX | Draft    |
| [#1561](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1561) | `unsafeOutputHint`                               | Proposal |
| [#1560](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1560) | `secretHint`                                     | Proposal |
| [#1487](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1487) | `trustedHint`                                    | Proposal |

The trust and sensitivity work is co-authored by GitHub and OpenAI based on gaps they hit running MCP in production. A Tool Annotations Interest Group is forming to work through these alongside related proposals like [tool resolution and preflight checks](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1862). Reviewing each one in isolation makes it easy to miss how a given annotation interacts with others, and it's those interactions that determine how risky a tool actually is in a given session.

## The Lethal Trifecta: Why Combinations Matter

Simon Willison's [lethal trifecta](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/) names three capabilities that, when combined, create the conditions for data theft: **access to private data**, **exposure to untrusted content**, and **the ability to externally communicate**. The attack is simple: LLMs follow instructions in content, and they can't reliably tell a user's instructions apart from ones an attacker embedded in a web page, email, or calendar event. If the agent has all three capabilities, an attacker who controls one piece of untrusted content can trick the model into reading private data and sending it out.

[Researchers have demonstrated this](https://layerxsecurity.com/blog/claude-desktop-extensions-rce/) using a malicious Google Calendar event description, an MCP calendar server, and a local code execution tool. This matters for MCP because users often combine tools from several servers in one session, so the risk profile is a property of the session, not of any single server.

One commenter on Willison's newsletter connected this directly to tool annotations:

> If the current state is tainted, block (or require explicit human approval for) any action with exfiltration potential... This also makes MCP's mix-and-match story extra risky unless tools carry metadata like: `reads_private_data` / `sees_untrusted_content` / `can_exfiltrate` — and the runtime enforces 'never allow all three in a single tainted execution path.'

Several of the open SEPs are trying to define that kind of metadata so a client can spot when a session has all three legs of the trifecta available.

## What Annotations Can Do

**Drive confirmation prompts.** A tool marked `readOnlyHint: true` from a trusted server might be auto-approved, while `destructiveHint: true` gets a confirmation step. A user asks their agent to clean up old files, the agent reaches for `delete_file`, and the client shows a dialog listing what's about to be deleted before anything happens. This is the most common use of annotations today.

**Enable graduated trust.** An enterprise running its own internal MCP servers behind auth has a very different trust relationship than someone installing a random server off the internet. Annotations from the first can drive policy; from the second they're informational at best. In practice most clients still treat installation itself as the trust signal and don't distinguish further, so this is more of a design opportunity than a widely shipped feature.

**Improve UX.** `title` is just a display name. Annotations that help users understand what tools do without running them are useful regardless of trust. No MCP client currently lets users filter tools by annotation values, though GitHub's read-only mode is a production analog, enabled by about 17% of users.

**Feed policy engines.** Annotations can be one input among several into a policy engine enforcing rules like "no destructive tools without approval" or "open-world tools are blocked in sessions that have accessed private data." The hints don't need to be perfectly trustworthy if the engine cross-references other signals.

Adoption across all of these is uneven, partly because MCP users split into two camps. Developers building autonomous agents treat confirmations as friction and lean on sandboxing instead. Enterprise adopters want more annotations than currently exist. One camp barely notices annotations, the other wants a much richer vocabulary.

## What Annotations Can't Do

**They don't stop prompt injection.** Annotations are static metadata on a tool definition. Prompt injection is a runtime attack on the model. Nothing in the annotation tells the model to ignore malicious instructions it reads from a calendar event.

**An untrusted server can lie.** A server can claim `readOnlyHint: true` and delete your files anyway. This is why the spec says clients **must** treat annotations from untrusted servers as untrusted.

**They aren't enforcement.** If you need a guarantee that a tool can't exfiltrate data, that's a job for network controls or sandboxing, not a boolean hint. We made the [same point about server instructions](https://blog.modelcontextprotocol.io/posts/2025-11-03-using-server-instructions/): don't rely on soft signals for things that need to be hard guarantees.

**A tool's risk depends on what else is in the session.** `search_emails` isn't safe or dangerous on its own; it depends on what other tools the agent has. Annotations on one tool can't tell you that.

## Questions for Evaluating New Annotations

As a starting point for the Interest Group, we're putting forward a tentative set of questions to ask of each annotation proposal. These will likely change as the group works through the open SEPs.

### 1. What client behavior does it enable?

Maintainer Jonathan Hefner [put this directly on an early draft](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/616#issuecomment-3330296295) of what became the governance/UX annotations proposal:

> It's not clear to me exactly how a client would behave differently when presented with these annotations.

If there's no concrete client action that changes based on the annotation, it probably doesn't belong in the protocol. Each of the existing hints maps to at least one decision a client can make:

| Hint                    | Example client behavior                                              |
| ----------------------- | -------------------------------------------------------------------- |
| `readOnlyHint: true`    | Skip the confirmation dialog                                         |
| `destructiveHint: true` | Show a warning before executing                                      |
| `idempotentHint: true`  | Safe to retry on failure                                             |
| `openWorldHint: true`   | Scrutinize output for untrusted content; flag a trust-boundary cross |

### 2. Does it need trust to be useful?

`title` is useful even from an untrusted server; worst case you show a bad display name. `readOnlyHint` from an untrusted server isn't actionable, because the decision it informs — whether to skip a confirmation — only makes sense if you believe the hint. Proposals should say where they fall on that spectrum, since it determines which clients can actually use them.

### 3. Could `_meta` handle it instead?

Tools already have [`_meta`](https://modelcontextprotocol.io/specification/2025-11-25/basic#_meta), which accepts namespaced keys like `com.example/my-field` for exactly this kind of metadata. If an annotation only matters to a handful of specialized clients or one deployment style, it probably belongs there instead of in the protocol. `_meta` is also a good way to prove out an idea before writing a SEP. A vendor can ship a namespaced field, see how it holds up in production, and come back with a proposal backed by actual usage instead of a design doc.

### 4. Does it help reason about combinations?

Annotations that help a client understand what happens when tools are used together are worth more than ones that only describe a tool in isolation. `openWorldHint` already hints at this: a client could use it to notice that a session mixes closed-world data access tools with open-world communication tools.

### 5. Is it a hint or a contract?

Hints inform decisions; contracts enforce them. If a proposal's value depends on the annotation being true, it's asking for a contract, and the right place for that is the authorization layer, the transport, or the runtime rather than `ToolAnnotations`. Hints work best when they're still useful even if some servers get them wrong.

## Where This Is Heading

The Tool Annotations Interest Group includes participants from Microsoft, OpenAI, AWS, and Anthropic, among others. These are companies that build both MCP hosts and MCP servers at scale, so they sit on both sides of the annotation contract: they need annotations expressive enough to surface risk to their users, and they need to author annotations that other clients will actually honor. Among the questions on the group's agenda are whether annotations belong on tool responses as well as tool definitions, and whether any annotations should be evaluated at runtime rather than declared statically.

In the meantime, the existing annotations are worth using. If you're writing a server, set `readOnlyHint: true` on read-only tools, `destructiveHint: false` on additive operations, and `openWorldHint: false` on closed-domain tools. If you're writing a client, treat annotations from untrusted servers as informational and lean on them for UX, but keep your actual safety guarantees in deterministic controls. And if you're thinking of proposing a new annotation, the questions above are a good place to start shaping it.

## Get Involved

The Tool Annotations Interest Group is forming now. If you're interested in contributing:

- Review the open SEPs linked above and leave feedback
- Join the conversation in `#agents-wg` on the [MCP Contributors Discord](https://modelcontextprotocol.io/community/communication#discord)
- Watch for the formal interest group proposal and channel in the Discord server

## Acknowledgements

This post draws on discussions with the MCP community, particularly the contributors involved in the Tool Annotations Interest Group proposal, including **Sam Morrow** (GitHub), **Robert Reichel** (OpenAI), **Den Delimarsky** (Anthropic), **Nick Cooper** (OpenAI), **Connor Peet** (Microsoft), and **Luca Chang** (AWS).
