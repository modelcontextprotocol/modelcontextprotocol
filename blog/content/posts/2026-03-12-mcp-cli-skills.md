---
date: "2026-03-12T00:00:00Z"
title: "How MCP, CLIs, and Agent Skills Fit Together"
description: "MCP, CLIs, and Agent Skills get pitched as competitors, but they solve different problems at different layers. A practical guide to when each one is the right tool — and how they compose together in real agent systems."
author: "David Soria Parra (Lead Maintainer)"
tags: ["mcp", "tools", "community"]
ShowToc: true
---

A question that comes up a lot, in Discord and in GitHub threads and in hallway conversations at conferences: _does my agent really need an MCP server if it can just run `gh`?_

It's a fair question — but it treats MCP, command-line tools, and Agent Skills as three horses in the same race. They aren't. They solve different problems at different layers, and in most real systems you use all three at once. Sometimes the CLI is the right call. Sometimes MCP is. Those aren't competing answers — they're answers to different questions, and the job is knowing which question you're asking.

Here's where each one fits.

## What each of these actually is

**CLIs** are programs with a command-line interface — `git`, `gh`, `curl`, `jq`, `kubectl`, your company's internal tooling. Decades of battle-tested software; the integration cost is putting the binary in `$PATH`. If the agent has a shell, it can call anything the shell can call.

The interface is the shell itself. The agent invokes a binary, reads whatever text comes back, and makes sense of it. There's no schema, no typed arguments, no capability negotiation — the tool doesn't know an agent is calling it, and the agent doesn't know what the tool can do until it tries.

**[Agent Skills](https://agentskills.io)** are folders of instructions and resources that an agent loads when they're relevant. A Skill doesn't give the agent a new capability — it teaches the agent how to use capabilities it already has. The contents are usually markdown files, maybe some reference scripts, maybe some example outputs. "When the user asks for a design document, use this template and put it in `docs/rfcs/`." "To cut a release, run these four commands in this order and check for this output between steps two and three."

Skills are workflow knowledge, packaged in a form an agent can load on demand. They're close to documentation, except the audience is a model rather than a person — which also means they're trusted like operator instructions, not read like inert docs. A Skill pulled from outside your organization carries the same supply-chain weight as an unvetted shell script, even if it's pure markdown.

**MCP** is an integration protocol. A server exposes typed tools, resources, and prompts over JSON-RPC; a client negotiates protocol capabilities at initialize, then discovers available tools and resources at runtime and presents them to the model. The [specification](https://modelcontextprotocol.io/specification/latest) covers structured arguments, OAuth-based authorization, subscriptions, progress notifications, and a handful of other things you need when the thing on the other end of the wire is software rather than a person.

The obvious cost is that someone has to build and run the server.

## They sit at different layers

If you arrange these three by what question they answer, the picture gets clearer:

```mermaid
graph TD
    Skill["Agent Skill<br/><i>how to do the work</i>"]

    MCP["MCP Server<br/><i>typed, discoverable capability</i>"]
    CLI["CLI<br/><i>capability that already exists</i>"]

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

A CLI is a capability. An MCP server is a capability with a contract on the front — schema, discovery, auth — so any MCP-aware host can use it without bespoke glue. A Skill is instructions layered on top of either one. They stack; they don't compete.

## Side by side

| Dimension                | CLI                         | Agent Skill                 | MCP Server                      |
| ------------------------ | --------------------------- | --------------------------- | ------------------------------- |
| What it provides         | Capability                  | Workflow knowledge          | Capability + contract           |
| Argument schema          | None (free-form argv)       | N/A — no execution surface  | JSON Schema per tool            |
| Discovery                | None — agent must know      | Agent reads a manifest      | `tools/list`, `resources/list`  |
| Auth                     | Whatever the binary does    | None — inherits the session | OAuth, per-user scoping         |
| Isolation / trust        | Foreign code, your machine  | Trusted as operator input   | Process or network boundary     |
| Cross-client portability | High (if binary is present) | Low today (format varies)   | High — that's the point         |
| Cross-OS portability     | OS- and env-dependent       | Often OS-dependent          | Host-independent                |
| Host requirements        | Shell + filesystem          | Usually shell + filesystem  | Just an MCP client              |
| Distribution             | Package manager, `$PATH`    | Copy a folder               | Registry, remote URL, stdio     |
| Authoring cost           | Zero — it exists            | Low — write markdown        | Medium — build and run a server |
| Output structure         | Text, exit code             | N/A                         | Typed results, resource content |

No column wins. They're answering different questions. The useful exercise is figuring out which question you're actually asking.

## When to reach for which

Some heuristics that have held up for me.

**The tool already exists as a CLI, and you're the only one using it, in one environment.** Don't build anything. Let the agent call the binary. You are not obligated to put a protocol in front of `grep`.

**You're encoding _how_ to do something, not _what can be done_.** That's a Skill. "Deploy to staging" isn't a new capability — the agent already has `kubectl` and `gh`. What it lacks is the knowledge of which manifests to apply, what order, what to check between steps. Write it down.

**You need the same integration to work across multiple AI hosts.** You want Linear in Claude, in VS Code, in Cursor, in the internal tool your platform team built. MCP is the only one of the three that was designed for this. Write it once, any compliant host picks it up.

**You need real auth.** OAuth flows, per-user tokens, scoped permissions — MCP's HTTP transport has this built in. Stdio servers pull credentials from the environment, same as a CLI. CLIs handle auth in a hundred different ways and none of them were designed with a model in the loop. Skills don't handle auth at all; they inherit whatever the session has.

**You're shipping an integration as part of a product.** Customers don't want to install a binary and manage its config file. They want to paste a URL or click a button. Use MCP — a remote server install is just a URL, and the [Registry](https://modelcontextprotocol.io/registry/about) (in preview) gives that URL somewhere to live.

**The job is a one-off script for your own machine.** Shell. You're done. Move on.

## They compose — that's the useful part

The framing that breaks most often is "pick one." In practice the interesting systems use all three.

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

## Where MCP is more than you need

MCP gives you a typed contract, discovery, and real auth. Those are valuable when you're distributing an integration — and they're overhead when you aren't.

**A server is something to run.** A stdio process, or hosted infrastructure. When the alternative is a binary already sitting in `$PATH`, make sure the contract is actually buying you something before you take on the operational cost.

**Schema rewards a settled shape.** Typed arguments pay off once you know what you're building. Earlier than that — when you're still poking at a problem to find its edges — a shell and a binary iterate faster. Build the server once the interface has stopped moving.

**A protocol doesn't encode a process.** If the agent doesn't know that your deploys need a migration check first, schema won't teach it. That's what Skills and [server instructions](https://blog.modelcontextprotocol.io/posts/2025-11-03-using-server-instructions/) are for — and why the layers matter.

## The boring answer

Use what's already there. When you need to teach the agent a process, write a Skill. When you need the integration to travel — across hosts, across users, with real auth and a real contract — reach for MCP. When you need your agent to do something that a well-known CLI can already do on your system — use the CLI.

Most of the time you'll end up with a mix, and that's the system working as intended.
