---
date: "2026-03-12T00:00:00Z"
title: "How MCP, CLIs, and Agent Skills Fit Together"
description: "MCP, CLIs, and Agent Skills get pitched as competitors, but they solve different problems at different layers. A practical guide to when each one is the right tool — and how they compose together in real agent systems."
author: "David Soria Parra (Lead Maintainer)"
tags: ["mcp", "tools", "community"]
ShowToc: true
---

A bug report comes in from Slack. The agent files a Linear issue through an MCP tool, greps the source tree for the stack trace with a shell command, and follows the team's triage runbook from a Skill that tells it which labels to apply and who to page. The team that built it didn't pick between MCP, CLIs, and Agent Skills — they used whichever fit each step.

That's the normal shape of a working agent system. The question people often start with — _does my agent need an MCP server if it can just run `gh`?_ — treats them as alternatives. They're not. They're layers, and the work is knowing which layer fits which problem.

Here's what each one is, when to reach for which, and how they stack in practice.

## What each of these actually is

**CLIs** you already know — `git`, `gh`, `curl`, `jq`, `kubectl`, whatever your team ships. Put the binary in `$PATH` and the agent can call it. That's the whole integration.

The interface is the shell. The agent runs a command, reads whatever text comes back, and figures it out. No schema, no typed arguments — the tool has no idea an agent is calling it, and the agent has no idea what the tool can do until it tries.

**[Agent Skills](https://agentskills.io)** are folders of instructions and resources that an agent loads when they're relevant. A Skill doesn't give the agent a new capability; it teaches the agent how to use capabilities it already has. The contents are usually Markdown files, maybe some reference scripts, maybe some example outputs. "When the user asks for a design document, use this template and put it in `docs/rfcs/`." "To cut a release, run these four commands in this order and check for this output between steps two and three."

Skills are workflow knowledge, packaged in a form an agent can load on demand. They're close to documentation, except the audience is a model rather than a person. That also means they're trusted like operator instructions rather than read as inert docs. A Skill pulled from outside your organization carries the same supply-chain weight as an unvetted shell script, even if it's pure Markdown.

**MCP** is an integration protocol. A server exposes typed tools, resources, prompts, and other primitives over JSON-RPC. The client exposes capabilities back to the server: the server can ask the host's model for an inference (sampling), ask the user a question mid-call (elicitation), or ask the client what filesystem scope is in play (roots). Both sides of the session offer something. The [specification](https://modelcontextprotocol.io/specification/latest) covers structured arguments, OAuth-based authorization, subscriptions, progress notifications, and the rest of the contract you need when both ends of the wire are software.

That means building and running a server. Locally, a stdio process the host spawns per session; remotely, infrastructure you deploy and maintain. It's more work than writing Markdown or putting a binary in `$PATH`, and the return is an integration that works in every host that speaks the protocol, including the ones that ship next quarter.

## How they connect

```mermaid
graph TD
    Skill["Agent Skill<br/><i>how to do the work</i>"]

    MCP["MCP Server<br/><i>typed, discoverable capability</i>"]
    CLI["CLI<br/><i>capability via the shell</i>"]

    API[Remote API]
    DB[Database]
    FS[Local system]

    Skill -->|references| MCP
    Skill -->|references| CLI
    MCP -->|may wrap| CLI
    MCP --> API
    MCP --> DB
    CLI --> FS
    CLI --> API
```

Skills sit at the top. They don't execute anything themselves; they tell the agent which tools to call and how. MCP servers and CLIs are both things the agent calls: MCP with a typed contract in front, CLI through the shell. An MCP server can wrap a CLI when you want that contract in front of a binary that already works. Underneath, both reach the same places: remote APIs, databases, the local system.

## What about just calling the API?

The other version of the question: _I already have an OpenAPI spec. Why not hand it to the model and let it call the endpoints directly?_

It works for a dozen stateless endpoints. OpenAPI-to-tool converters exist, and the teams who've shipped with them converge on the same lesson: generate the scaffolding from the spec, then curate it for a caller that doesn't read docs. A model can't fill in the tribal knowledge a human integrator would. That curation layer is most of the work, and it's the work an MCP server does explicitly.

There's also a structural mismatch. An OpenAPI document describes an HTTP surface: a static contract, one direction of call. MCP is a session where both sides offer something. The server exposes tools and resources; the client exposes sampling, elicitation, roots. That bidirectional shape is what LSP provides between an IDE and a language server. You wouldn't expect `gopls` to ship an OpenAPI spec, because a language server is a conversation partner for the editor rather than an API endpoint. MCP occupies the same architectural slot for AI hosts.

On context bloat, the question that often follows: doesn't connecting to an MCP server flood the context window with tool definitions? Generally no. A raw OpenAPI spec in context is hundreds of flat endpoints competing for attention. MCP's primitive split (tools, resources, prompts in separate namespaces) and paginated runtime discovery let the host filter to what the task actually needs. Hosts ship tool search for exactly this reason. MCP's curation model was designed with a model's context budget in mind.

## Side by side

| Dimension                | CLI                         | Agent Skill                 | MCP Server                      |
| ------------------------ | --------------------------- | --------------------------- | ------------------------------- |
| What it provides         | Capability                  | Workflow knowledge          | Capability + contract           |
| Argument schema          | None (free-form argv)       | N/A                         | JSON Schema per tool            |
| Discovery                | None — agent must know      | Agent reads a manifest      | `tools/list`, `resources/list`  |
| Auth                     | Whatever the binary does    | None — inherits the session | OAuth, per-user scoping (HTTP)  |
| Isolation / trust        | Foreign code, your machine  | Trusted as operator input   | Process or network boundary     |
| Cross-client portability | High (if binary is present) | High — cross-vendor spec    | High — protocol contract        |
| Cross-OS portability     | OS- and env-dependent       | Often OS-dependent          | Host-independent (HTTP)         |
| Host requirements        | Shell + filesystem          | Usually shell + filesystem  | An MCP client                   |
| Distribution             | Package manager, `$PATH`    | Copy a folder               | Registry, URL, package manager  |
| Authoring cost           | Zero — it exists            | Low — write Markdown        | Medium — build and run a server |
| Output structure         | Text, exit code             | N/A                         | Typed results, resource content |

Scan down each column and the trade-offs are clear enough. CLIs win on friction: a package install away, zero authoring, no contract in front. Skills are the easiest thing to write, and they're the only one of the three that carries workflow knowledge. MCP costs the most to stand up, and what you get back is the typed interface, the auth story, and the cross-host contract. Each answers a different question.

The table is a feature matrix rather than a decision tree. Which rows matter depends on what you're building and who needs to use it. Prototyping alone on a laptop, authoring cost dominates. Shipping an integration to customers, auth and distribution do. Encoding a team's workflow, the instructions matter more than the interface.

## When to reach for which

The choice usually turns on a few things: whether the capability exists already, who else needs to use it, what security boundary you need, and how far it has to travel. Each scenario below starts from one of those.

**The tool already exists as a CLI, and you're the only one using it, in one environment.** Don't build anything. Let the agent call the binary. You are not obligated to put a protocol in front of `grep`.

**You're encoding _how_ to do something, not _what can be done_.** That's a Skill. "Deploy to staging" isn't a new capability — the agent already has `kubectl` and `gh`. What it lacks is the knowledge of which manifests to apply, what order, what to check between steps. Write it down.

**You need the same integration to work across multiple AI hosts.** You want Linear in Claude, in VS Code, in Cursor, in the internal tool your platform team built. Build an MCP server once and any compliant host picks it up — the server is the integration, nothing host-specific to write.

**You need a real security boundary.** OAuth flows, per-user tokens, scoped permissions — MCP's HTTP transport has these built in, and even a stdio server gives you a process boundary to hang policy on. Beyond auth, the server is the one place to enforce access rules, log what the model touched, and scope what it can reach. CLIs run as the agent with whatever privileges the agent has. Skills inherit the session wholesale.

**Your users aren't engineers.** CLIs assume someone who can install binaries, manage `$PATH`, and accept that every new tool runs with their local privileges. That works in a developer workflow. It's a non-starter for product users who aren't going to grant a local process full machine access every time they need new functionality. A remote MCP server is a URL — no install, no local trust surface — and the [Registry](https://modelcontextprotocol.io/registry/about) gives that URL somewhere to live.

**The job is a one-off script for your own machine.** The shell is the fastest path from intent to result. If nothing needs to travel, persist, or be handed to another team, there's no reason to reach past it.

**You're still finding the shape of the problem.** A typed schema pays off once the interface has stopped moving. While you're still poking at what the tool should even do, a shell and a binary iterate faster than a server and a contract. Build the MCP server once you know what you're building.

## Composing the layers

Most real systems don't stay on one layer, and they don't stay still. A Skill orchestrates MCP tools alongside shell commands. An MCP server puts a typed contract in front of a CLI that already works. Projects move between layers as their requirements change.

### Skill that leans on an MCP server

A Skill doesn't care whether the tools it references are CLIs, MCP tools, or a mix. It's describing a workflow, and workflows span layers.

```markdown
# Bug triage

When the user reports a bug from Slack:

1. Use the Linear MCP server's `create_issue` tool. Team is `ENG`, label is `triage`.
2. Paste the Slack permalink into the issue description.
3. If there's a stack trace, grep `src/` for the top frame and link the file in the issue.
4. Post the issue URL back to the Slack thread.
```

Step 1 is an MCP tool. Step 3 is a shell command. Step 4 might be either. The Skill is the glue that says "here's the shape of this task in this organization."

### MCP server wrapping a CLI

This pattern earns its keep when the CLI is something the model _hasn't_ seen — an internal tool, a bespoke script, something with a gnarly argument surface. You get a typed schema the model can target reliably, and underneath you're shelling out to a binary that already works.

```typescript
server.tool(
  "promote_build",
  {
    build_id: z.string(),
    environment: z.enum(["staging", "canary", "production"]),
    skip_smoke_tests: z.boolean().default(false),
  },
  async ({ build_id, environment, skip_smoke_tests }) => {
    const args = ["promote", "--build", build_id, "--env", environment];
    if (skip_smoke_tests) args.push("--skip-smoke");

    const { stdout, stderr } = await execFile("deployctl", args);
    return { content: [{ type: "text", text: stdout + stderr }] };
  },
);
```

The model gets a real schema — it knows `environment` is one of three strings, and it won't invent a `--flag` that doesn't exist on a tool it's never heard of. You also get one place to put auth and audit logging, rather than scattering credentials across every machine the agent runs on.

For something like `gh`, this is usually more ceremony than it's worth — the model already knows the flags, and the binary is everywhere. For your internal tooling, the calculus flips.

### Moving between layers

Some projects start as MCP servers on day one, because the target is cross-host distribution from the beginning. Others start as a CLI or a Skill and graduate later. For the second case, the signals that it's time to move tend to arrive together: a second team wants to run it, someone asks for audit logs, and the interface has stopped changing. The transition looks like the `deployctl` wrapper above, a thin layer over the same binary. The work goes into schema and deciding where auth lives. Nothing underneath rewrites.

The same thinking applies in reverse. A Skill that's started holding access control (which environments a user can promote to, who can merge what) is carrying policy that belongs in the server. Push it down. Let the Skill stay at "run these steps in this order" and let the server enforce who's allowed to.

## Putting it together

Use what's already there. When you need to teach the agent a process, write a Skill. When you need the integration to travel across hosts and users with a real security boundary, reach for MCP. When the job is something a well-known CLI can already do, use the CLI. Most systems end up a mix, and that's the system working as intended.

The boundaries between these three are softening by design. The [Skills Over MCP Interest Group](https://github.com/modelcontextprotocol/experimental-ext-skills) is working on exposing Skills as MCP resources, so a server can ship its tools and the workflow instructions for using them together. That direction of travel tells you something about the relationship: none of these was meant to stand alone.

To get started building, head to the [MCP documentation](https://modelcontextprotocol.io).
