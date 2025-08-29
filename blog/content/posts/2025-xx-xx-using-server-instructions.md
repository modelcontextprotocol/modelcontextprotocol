+++
date = '2025-08-04T18:00:00+01:00'
publishDate = '2025-08-04T18:00:00+01:00'
draft = true
title = 'Server Instructions: Giving LLMs a user manual for your server'
author = 'Ola Hungerford (Maintainer)'
tags = ['automation', 'mcp', 'server instructions', 'tutorial']
+++

Many of us are still exploring the nooks and crannies of MCP and learning how to best use the building blocks of the protocol to enhance our agents and applications.  Some features, like [Prompts](https://blog.modelcontextprotocol.io/posts/2025-07-29-prompts-for-automation/), are more frequently implemented and used.  Others may appear a bit more obscure but have a lot of influence on how well an agent will understand your server.  Server instructions are one of the latter.

## The Problem

Imagine you're a Large Language Model (LLM) who just got handed a collection of tools from servers A, B, and C to complete a task.  They might have already been carefully pre-selected or they might be more like what my physical workbench looks like in my garage - a mishmash of whatever I've been using in the last few weeks.

Now lets say that the developer of Server A has pre-existing knowledge or preferences about how best to use their tools or prompts, as well as more background information about the underlying systems that power them.

Some examples could include:

- 'Tool C should always be used after tool A and B'
- 'This prompt or tool works best if specialized tools from other servers X and Y are available'
- 'All tools are rate limited to 10 requests per minute'
- 'Always look up the user's language and accessibility preferences before attempting to fetch any resources with this server.'
- 'Only use tool A to ask the user for their preferences if elicitation is supported.  Otherwise, fall back to using default user preferences.'

## Solutions

One solution could be to include this extra information in every tool description or prompt provided by the server.  Going back to the physical tool analogy, however: you can only depend on "labeling" each tool if there is enough space to describe them.  A model's context window is limited - there's only so much information you can fit into that space.  And even if all those labels can fit within your model's context limits, the more tokens you cram into that space, the more likely it is you might cause more confusion than clarity.

Alternatively, relying on just prompts to give common instructions like this means that:

- The prompt always needs to be selected by the user, and
- The instructions are more likely to get lost in the shuffle of other messages.  

Imagine a pile of post-it notes, all filled with instructions on how to do things with a drawer full of tools.  It's totally possible that you have the right notes lined up in front of you to do everything reliably, but it's not always the most efficient way to provide this type of context.

For global instructions that you want the LLM to always follow - instead of including them in multiple tool descriptions or prompts, it can make more sense to include them in the model's system prompt instead.

This is where **server instructions** come in. Server instructions give the server a way to inject information that the LLM should always read in order to understand how to use the server - independent of individual prompts, tools, or messages.

**Note:** because the exact way that the MCP host uses server instructions is up to the implementer, it's not always guaranteed that they will be injected into the system prompt.  It's always recommended to evaluate a client's behavior with your server and its tools before relying on this functionality.

## Implementing Server Instructions Example: Tool Preferences For Prompts

One specific personal example where this is helpful: I often create a combination of Prompts and embedded Resources as "cheat sheets" which help assemble information from multiple sources including Confluence and GitHub.  I like to include these prompts in a MCP server so that I can reuse them easily in either an IDE or other apps.

In this case, I want the LLM to always prioritize using Confluence and GitHub-specific tools for getting certain internal information rather than using more generic fetch or web search tools.

TODO: add rest of example and grab screenshot of it working

## Implementing Server Instructions: General Tips For Server Developers

One key to good instructions is focusing on **what tools and resources don't convey**:

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

- **Guarantee certain behavior:** As with any text you give to an LLM, your instructions aren't going to be followed the same way all the time.  Anything you ask a model to do is like rolling a dice. The reliability of any instructions will vary based on randomness, sampling parameters, model, client implementation, other servers and tools at play, and many other variables.
	- Don't rely on instructions for any critical actions that need to happen in conjunction with other actions, especially in security or privacy domains. These are better implemented as deterministic rules or hooks.
- **Account for suboptimal tool design:** Tool descriptions and other aspects of interface design for agents are still going to make or break how well LLMs can use your server when they need to take an action.

## Implementing Server Instructions: For Client Developers

If you're a client developer, your job is more complex, since it involves deciding how to incorporate instructions into what ultimately gets passed to the model.

TODO: content below are placeholders generated by Claude.

### Instruction Composition Strategies

#### 1. Append Pattern (Simple)

```javascript
const systemPrompt = await buildSystemPrompt();
const serverInstructions = server.getInstructions();

const finalPrompt = `${systemPrompt}

MCP Server Instructions:
${serverInstructions}`;
```

#### 2. Structured Integration (Advanced)

```javascript
class InstructionManager {
  composeInstructions(servers) {
    const grouped = this.groupByCapability(servers);
    return `Available MCP Servers:

${grouped.fileServers.length > 0 ? `File Operations:
${grouped.fileServers.map(s => `- ${s.name}: ${s.instructions}`).join('\n')}` : ''}

${grouped.apiServers.length > 0 ? `API Integrations:
${grouped.apiServers.map(s => `- ${s.name}: ${s.instructions}`).join('\n')}` : ''}`;
  }
}
```

#### 3. Priority-Based Composition

```javascript
// For multiple servers with potential conflicts
const instructions = servers
  .sort((a, b) => b.priority - a.priority)
  .map(s => s.instructions)
  .join('\n\n');
```

### User Control Implementation

#### Edit Dialog Example

```typescript
interface InstructionEditor {
  server: string;
  original: string;
  edited: string;
  enabled: boolean;
}

function InstructionEditDialog({ instruction }: { instruction: InstructionEditor }) {
  return (
    <Dialog>
      <DialogTitle>Edit Instructions: {instruction.server}</DialogTitle>
      <TextArea 
        value={instruction.edited}
        onChange={(e) => updateInstruction(e.target.value)}
      />
      <Checkbox 
        checked={instruction.enabled}
        label="Include these instructions"
      />
    </Dialog>
  );
}
```

### Client Implementation Checklist

- [ ] Validate instruction content for control sequences
- [ ] Implement user visibility of all instructions
- [ ] Add edit/disable capabilities
- [ ] Log instruction usage
- [ ] Set reasonable length limits
- [ ] Sanitize before prompt injection
- [ ] Test with malicious instructions

## Currently Supported Host Applications

At the time of writing only a few host applications support server instructions.  For a complete list, refer to the [Clients](https://modelcontextprotocol.io/clients) page in the MCP documentation.  Claude Code was used to demonstrate server instructions for this post.

For a basic demo of server instructions in action, you can use the [Everything reference server](https://github.com/modelcontextprotocol/servers/tree/main/src/everything) to confirm that your client supports this feature:

1. Install the Everything Server in your host. The link above includes instructions on how to do this in a few popular applications.  In the example below, we're using [Claude Code](https://docs.anthropic.com/en/docs/claude-code/mcp).
2. Once you've confirmed that the server is connected, ask the model: `does the everything server tools have any special 
  instructions?`
3. If the model can see your instructions, you should get a response like the one below:

<img
    src="/posts/images/claude_code_instructions.JPG"
    alt="Screenshot of response which reads: Server instructions are working!"
  />

## Wrapping Up

Although it's just a simple text field, this post skimmed the surface of how server instructions can be used and implemented in both MCP clients and servers.  Be sure to share your own examples, thoughts, and questions on [Discord](https://modelcontextprotocol.io/community/communication).
