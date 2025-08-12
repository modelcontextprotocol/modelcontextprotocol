+++
date = '2025-08-04T18:00:00+01:00'
publishDate = '2025-08-04T18:00:00+01:00'
draft = false
title = 'Server Instructions: Giving LLMs a user manual for your server'
author = 'Ola Hungerford (Maintainer)'
tags = ['automation', 'mcp', 'server instructions', 'tutorial']
+++

Many of us are still exploring the nooks and crannies of MCP, and learning how to best use the building blocks of the protocol to enhance our agents and applications.  Some features like [Prompts](https://blog.modelcontextprotocol.io/posts/2025-07-29-prompts-for-automation/) are more prominently featured in the spec and documentation.  Others are more hidden, but potentially very influential to how well an agent will understand your server.  Server `instructions` are one of the latter.

## The Problem

Imagine you're a Large Language Model (LLM) who just got handed a collection of tools from servers A, B, and C to complete a certain task.  They might have already been carefully pre-selected, or they might be more like what my own physical workbench looks like in my garage (in other words, a mishmash of whatever I've been using in the last few weeks).

Now lets say that the creator of Server A has pre-existing knowledge or preferences about how best to use their tools or prompts, and/or more background information about the underlying systems.

Some examples could include:

- 'Tool C should always be used after tool A and B'
- 'This Prompt or Tool works best if specialized tools from other servers X and Y are available'
- 'All Tools are rate limited to 10 requests per minute'
- 'Always look up the user's language and accessibility preferences before attempting to fetch any resources with this server.'
- 'Only use Tool A to ask the user for their preferences if elicitation is supported.  Otherwise, fall back to using default user preferences.'

## Example: TODO more specific and detailed example

TODO

## Solutions

One solution could be to include this extra information in every tool description or prompt provided by the server.  However, going back to the physical tool analogy: you can only depend on 'labeling' each tool if there is enough space to describe them.  A model's context window limitations are similar, since they have hard limits to how much information you can fit into that space.  (And even if all those labels can fit within your model's context limits, the more tokens you cram into that space, the more likely it is you might cause more confusion than clarity.)

Alternatively, relying on just prompts to give common instructions like this means that:

- The prompt always needs to be selected by the user, and
- The instructions are more likely to get lost in the shuffle of other messages.  

Imagine a pile of post-it notes, all filled out with instructions on how to do this or that with a drawer full of tools.  Its totally possible that you have the right notes lined up in front of you to do everything reliably, but its not always the most efficient way to provide this type of context.

For 'global' instructions you always want the LLM to follow, instead of repeating them in multiple tool descriptions or prompts in a server, it can make more sense to include them in the model's system prompt instead.  This is where **server instructions** come in, to give the server a way to inject information that the LLM should always 'read' in order to understand how to use the server - independent of individual prompts, tools or messages.

**Note:** since the exact way that the host uses server instructions is up to the implementer (as a `MAY` in the spec), its not guaranteed that they will be injected into the system prompt.  Its recommended to evaluate a given clients behavior with your server and its tools before relying on this functionality.

## Implementing Server Instructions - For Server Developers

The key to good instructions is focusing on **what tools/resources don't convey**:

1. **Capture cross-feature relationships**:
    
    ```json
    {
      "instructions": "Always call 'authenticate' before any 'fetch_*' tools. The 'cache_clear' tool invalidates all 'fetch_*' results."
    }
    ```
    
2. **Document operational patterns**:
    
    ```json
    {
      "instructions": "For best performance: 1) Use 'batch_fetch' for multiple items, 2) Check 'rate_limit_status' before bulk operations, 3) Results are cached for 5 minutes."
    }
    ```
    
3. **Specify constraints and limitations**:
    
    ```json
    {
      "instructions": "File operations limited to workspace directory. Binary files over 10MB will be rejected. Rate limit: 100 requests/minute across all tools."
    }
    ```
    

### Anti-Patterns to Avoid

❌ **Don't repeat tool descriptions**:

```json
// Bad - duplicates what's in tool.description
"instructions": "The search tool searches for files. The read tool reads files."

// Good - adds relationship context
"instructions": "Use 'search' before 'read' to validate file paths. Search results expire after 10 minutes."
```

❌ **Don't include marketing or superiority claims**:

```json
// Bad
"instructions": "This is the best server for all your needs! Superior to other servers!"

// Good
"instructions": "Specialized for Python AST analysis. Not suitable for binary file processing."
```

❌ **Don't write a manual**:

```json
// Bad - too long and detailed
"instructions": "This server provides comprehensive functionality for... [500 words]"

// Good - concise and actionable
"instructions": "GitHub integration server. Workflow: 1) 'auth_github', 2) 'list_repos', 3) 'clone_repo'. API rate limits apply - check 'rate_status' before bulk operations."
```

### What Server Instructions Can't Do:

- **Guarantee certain behavior:** As with any text you give to an LLM, your instructions aren't going to be followed the same way 100% of the time.  Anything you ask a model to do is like rolling a dice  The reliability of any instructions will vary based on randomness, sampling parameters, model, client implementation, other servers/tools at play, and many other variables.
	- Given the above, don't rely on instructions for any critical 'must-do' actions that need to happen in conjunction with other actions, especially in security or privacy domains.  These are better implemented as deterministic rules or hooks.
- **Make up for suboptimal tool design:** Tool descriptions and other aspects of interface design for agents are still going to make or break how well LLMs can use your server, when they need to take an action.

## Implementing Server Instructions - For Client Developers

If you're a client developer, your job is a more complex, since it involves deciding how to incorporate instructions into what ultimately gets passed to the model.

TODO

## Which host applications support server instructions?

At the time of writing, only a few host applications definitively support server instructions - for a complete list, refer to the [Clients](https://modelcontextprotocol.io/clients) page in the MCP documentation.  Claude Code and VSCode (Insider's Edition) were the clients used to demonstrate server instructions for this post.

For a basic demo of server instructions in action, you can use the [Everything reference server](https://github.com/modelcontextprotocol/servers/tree/main/src/everything) to confirm that the client supports this feature:

1. Install the Everything Server in your host: The link above includes instructions on how to do this in a few popular applications.  In the example below, we're using [Claude Code](https://docs.anthropic.com/en/docs/claude-code/mcp).
2. Once you've confirmed that the server is connected, ask the model: `does the everything server tools have any special 
  instructions?`
3. If the model can see your instructions, you should get a response like the one below:

<img
    src="/posts/images/claude_code_instructions.JPG"
    alt="Screenshot of response which reads: Server instructions are working!"
  />

### Fallback Strategies

Since not all clients support instructions, this is something you may want to implement conditionally based on client capabilities.

TODO

## Wrapping Up

Although its just a simple text field, this post skimmed the surface of how `instructions` can be used and implemented in both MCP clients and servers.  Be sure to share your own examples, thoughts, and questions in the [channels mentioned here](https://modelcontextprotocol.io/community/communication).
