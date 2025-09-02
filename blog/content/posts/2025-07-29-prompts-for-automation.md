+++
date = '2025-08-04T18:00:00+01:00'
publishDate = '2025-08-04T18:00:00+01:00'
draft = false
title = 'MCP Prompts: Building Workflow Automation'
author = 'Inna Harper (Core Maintainer)'
tags = ['automation', 'mcp', 'prompts', 'tutorial']
+++

[MCP (Model Context Protocol)](https://modelcontextprotocol.io/specification/2025-06-18) prompts enable workflow automation by combining AI capabilities with structured data access. This post demonstrates how to build automations using MCP's [prompts](https://modelcontextprotocol.io/specification/2025-06-18/server/prompts) and [resource templates](https://modelcontextprotocol.io/specification/2025-06-18/server/resources#resource-templates) through a practical example.

This guide demonstrates how MCP prompts can automate repetitive workflows. Whether you're interested in the MCP ecosystem or simply want to leverage AI for workflow automation, you'll learn how to build practical automations through a concrete meal planning example. No prior MCP experience needed—we'll cover the fundamentals before diving into implementation.

## The Problem: Time-Consuming Repetitive Tasks

Everyone has a collection of repetitive tasks that eat away at their productive hours. Common examples include applying code review feedback, generating weekly reports, updating documentation, or creating boilerplate code. These tasks aren't complex—they follow predictable patterns—but they're cumbersome and time-consuming. [MCP prompts](https://modelcontextprotocol.io/specification/2025-06-18/server/prompts) were designed to help automate this kind of work.

MCP prompts offer more than command shortcuts. They're a primitive for building workflow automation that combines the flexibility of scripting with the intelligence of modern AI systems. This post explores how to build automations using MCP's prompt system, resource templates, and modular servers. I'll demonstrate these concepts through a meal planning automation I built, but the patterns apply broadly to any structured, repetitive workflow.

## Example: Automating Weekly Meal Planning

I needed to solve a recurring problem: planning weekly meals by cuisine to manage ingredients efficiently. The manual process involved selecting a cuisine, choosing dishes, listing ingredients, shopping, and organizing recipes—repetitive steps that took significant time each week.

So I decided to use MCP! By automating these steps, I could reduce the entire workflow to selecting a cuisine and receiving a complete meal plan with shopping list. (Any client that supports MCP prompts should work!)

1. **Select a prompt**

   <img
   src="/posts/images/prompts-list.png"
   alt="MCP prompts list showing available automation commands"
   />

2. **Select a cuisine from a dropdown**
   <img
     src="/posts/images/prompts-suggestions.png"
     alt="Dropdown showing cuisine suggestions as user types"
   />
3. **Done!**
   The system generates a meal plan, shopping list, and even prints the shopping list and recipes.

<img
    src="/posts/images/prompts-final-result.png"
    alt="Final generated meal plan and shopping list output"
  />

Here we are focuses primarily on the Recipe Server with its prompts and resources. You can find the [printing server example here](https://github.com/ihrpr/mcp-server-tiny-print) (it works with a specific thermal printer model, but you could easily swap it for email, Notion, or any other output method). The beauty of separate servers is that you can mix and match different capabilities.

## Core Components

Let's dive into the three components that make this automation possible: [prompts](https://modelcontextprotocol.io/specification/2025-06-18/server/prompts), [resources](https://modelcontextprotocol.io/specification/2025-06-18/server/resources), and [completions](https://modelcontextprotocol.io/specification/2025-06-18/server/utilities/completion). I'll show you how each works conceptually, then we'll implement them together.

### 1. Resource Templates

In MCP, [static resources](https://modelcontextprotocol.io/specification/2025-06-18/server/resources#resource-types) represent specific pieces of content with unique URIs—like `file://recipes/italian.md` or `file://recipes/mexican.md`. While straightforward, this approach doesn't scale well. If you have recipes for 20 cuisines, you'd need to define 20 separate resources, each with its own URI and metadata.

[Resource templates](https://modelcontextprotocol.io/specification/2025-06-18/server/resources#resource-templates) solve this through URI patterns with parameters, transforming static resource definitions into dynamic content providers.

For example, a template like `file://recipes/{cuisine}.md` might represent a set of resources like these:

- `file://recipes/italian.md` returns Italian recipes
- `file://recipes/mexican.md` returns Mexican recipes

This pattern extends beyond simple filtering. You can create templates for:

- Hierarchical data: `file://docs/{category}/{topic}`
- Git repository content: `git://repo/{branch}/path/{file}`
- Web resources: `https://api.example.com/users/{userId}/data`
- Query parameters: `https://example.com/{collection}?type={filter}`

For more details on URI schemes and resource templates, see the [MCP Resource specification](https://modelcontextprotocol.io/specification/2025-06-18/server/resources#resource-templates).

### 2. Completions

Nobody remembers exact parameter values. Is it "italian" or "Italian" or "it"? [Completions](https://modelcontextprotocol.io/specification/2025-06-18/server/utilities/completion) bridge this gap by providing suggestions as users type, creating an interface that feels intuitive rather than restrictive.

Different MCP clients present completions differently:

- VS Code shows a filterable dropdown
- Command-line tools might use fuzzy matching
- Web interfaces could provide rich previews

But the underlying data comes from your server, maintaining consistency across all clients.

### 3. Prompts: Commands That Evolve With Context

[Prompts](https://modelcontextprotocol.io/specification/2025-06-18/server/prompts) are the entry points to your automation. They define what commands are available and can range from simple text instructions to rich, context-aware operations.

Let's see how prompts can evolve to handle increasingly sophisticated use cases:

**Basic prompt: Static instruction**

```
"Create a meal plan for a week"
```

This works, but it's generic. The AI will create a meal plan based on general knowledge.

**Adding parameters: Dynamic customization**

```
"Create a meal plan for a week using {cuisine} cuisine"
```

Now users can specify Italian, Mexican, or any other cuisine. The prompt adapts to user input, but still relies on the AI's general knowledge about these cuisines.

**Including resources: Your data**

Prompts can include resources to add context data beyond simple text instructions. This is crucial when you need the AI to work with your specific context rather than general knowledge.

In my meal planning example, I don't want generic recipes—I want the AI to use **my** collection of tested recipes that I know I like. Complex prompts make this possible by bundling prompt text with embedded resources.

Here's how it works:

1. **User selects a prompt** with parameters (e.g., "plan-meals" with cuisine="italian")
2. **Server returns** both instructional text AND resource references
3. **Client decides how to handle resources** - Applications might choose to select a subset of data using embeddings or keyword search, or pass the raw data directly to the model
4. **AI receives the context** and generates a response

In my example, VS Code attached the entire resource to the prompt, which worked great for this use case. The AI had access to all my Italian recipes when planning an Italian week, ensuring it only suggested dishes I actually had recipes for.

The key difference from simple prompts: instead of asking "Plan Italian meals" and getting generic suggestions, the AI works with your actual recipe collection, dietary preferences, and constraints.

<img
    src="/posts/images/prompts-rendered-prompt.png"
    alt="VS Code showing the rendered prompt with attached recipe resources"
  />

The recipe resources we've been using are **embedded resources** that have inline content from the server. According to the [MCP specification](https://modelcontextprotocol.io/specification/2025-06-18/server/prompts#data-types), prompts can also include other data types.

This enables advanced use cases beyond our text-based recipes, like design review prompts with screenshots or voice transcription services.

## Building the Recipe Server

Let's implement a complete MCP server that brings together all the concepts we've discussed. We'll start with the server setup and then implement each capability.

### Prerequisites

Before diving into the code, make sure you have:

1. **Node.js** (v18 or higher) and npm installed
2. **MCP SDK** installed:
   ```bash
   npm install @modelcontextprotocol/sdk
   ```
3. **An MCP-compatible client with prompt and resource support**,like VS Code with the MCP extension

For this tutorial, I'll use the TypeScript SDK, but MCP also supports Python and other languages.

### Server Setup and Capabilities

First, let's create our MCP server:

```typescript
const server = new McpServer({
  name: "favorite-recipes",
  version: "1.0.0",
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
```

### Implementing Resources

Next, let's register a resource template with completions.

```typescript
server.registerResource(
  "recipes",
  new ResourceTemplate("file://recipes/{cuisine}", {
    list: undefined,
    complete: {
      cuisine: (value) => {
        return CUISINES.filter((cuisine) => cuisine.startsWith(value));
      },
    },
  }),
  {
    title: "Cuisine-Specific Recipes",
    description: "Traditional recipes organized by cuisine",
  },
  async (uri, variables, _extra) => {
    const cuisine = variables.cuisine as string;

    if (!CUISINES.includes(cuisine)) {
      throw new Error(`Unknown cuisine: ${cuisine}`);
    }

    const content = formatRecipesAsMarkdown(cuisine);
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: content,
        },
      ],
    };
  },
);
```

### Implementing Prompts

Finally, let's register the prompt, which also has completions:

```typescript
server.registerPrompt(
  "weekly-meal-planner",
  {
    title: "Weekly Meal Planner",
    description:
      "Create a weekly meal plan and grocery shopping list from cuisine-specific recipes",
    argsSchema: {
      cuisine: completable(z.string(), (value) => {
        return CUISINES.filter((cuisine) => cuisine.startsWith(value));
      }),
    },
  },
  async ({ cuisine }) => {
    const resourceUri = `file://recipes/${cuisine}`;
    const recipeContent = formatRecipesAsMarkdown(cuisine);

    return {
      title: `Weekly Meal Planner - ${cuisine} Cuisine`,
      description: `Weekly meal planner for ${cuisine} cuisine`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Plan cooking for the week. I've attached the recipes from ${cuisine} cuisine.

Please create:
1. A 7-day meal plan using these recipes
2. An optimized grocery shopping list that minimizes waste by reusing ingredients across multiple recipes
3. Daily meal schedule with specific dishes for breakfast, lunch, and dinner
4. Preparation tips to make the week more efficient
5. Print Shopping list

Focus on ingredient overlap between recipes to reduce food waste.`,
          },
        },
        {
          role: "user",
          content: {
            type: "resource",
            resource: {
              uri: resourceUri,
              mimeType: "text/markdown",
              text: recipeContent,
            },
          },
        },
      ],
    };
  },
);
```

## Running It Yourself

The [full code for the recipe server is available here](https://github.com/ihrpr/mcp-server-fav-recipes).

Follow VS Code's [documentation to set up the server](https://code.visualstudio.com/docs/copilot/chat/mcp-servers). Once a server is set up in VS Code, you can see its status, debug what's happening, and iterate quickly on your automations.

After the server is set up in VS Code, type "/" in chat and select the prompt.

<img
    src="/posts/images/prompts-list.png"
    alt="MCP prompts list showing available automation commands"
 />

## Extending Your Automations

MCP prompts open up exciting automation possibilities:

- **Prompt Chains**: Execute multiple prompts in sequence (plan meals → generate shopping list → place grocery order)
- **Dynamic Prompts**: Adapt based on available resources or time of year
- **Cross-Server Workflows**: Coordinate multiple MCP servers for complex automations
- **External Triggers**: Activate prompts via webhooks or schedules

The patterns demonstrated in meal planning apply to many domains:

- Documentation generation that knows your codebase
- Report creation with access to your data sources
- Development workflows that understand your project structure
- Customer support automations with full context

**Key takeaways:**

- MCP prompts can include dynamic resources, giving AI full context for tasks
- Resource templates enable scalable content serving without duplication
- Modular server architecture lets you mix and match capabilities

## Wrapping Up

This meal planning automation started as a simple desire to avoid rewriting shopping lists every week. It evolved into a complete system that handles meal planning, shopping lists, and recipe printing with just a few clicks.

MCP prompts provide practical tools to automate repetitive tasks. The modular architecture means you can start small—perhaps just automating one part of your workflow—and expand as needed. Whether you're automating documentation, reports, or meal planning, the patterns remain the same: identify repetitive tasks, build focused automations, and let the system handle the tedious parts.
