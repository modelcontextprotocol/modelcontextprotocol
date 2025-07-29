+++
date = '2025-07-02T11:46:28+01:00'
draft = false
title = 'MCP Prompts: Building Workflow Automation'
tags = ['automation', 'mcp', 'prompts', 'tutorial']
+++

MCP (Model Context Protocol) prompts enable workflow automation by combining AI capabilities with structured data access. This post shows how to build an automation using MCP's prompt and resource templates. The patterns demonstrated apply to any repetitive workflow—from code documentation to meal planning automation.

**Key takeaways:**
- MCP prompts can include dynamic resources, giving AI full context for tasks
- Resource templates enable scalable content serving without duplication
- Modular server architecture lets you mix and match capabilities

**Who Is This For**

This post is for anyone who:
- Is interested in the Model Context Protocol (MCP) ecosystem
- Wants to leverage AI for workflow automation of repetitive tasks
- Has basic programming knowledge (TypeScript/JavaScript helpful but not required)


Whether you're automating documentation updates, report generation, or meal planning (like I did), this guide will show you how MCP prompts can transform repetitive work into an automation.

No prior MCP experience needed—I'll cover the basics before diving into implementation.


## The Problem: Time-Consuming Repetitive Tasks

Everyone has a collection of repetitive tasks that eat away at their productive hours. Common examples include applying PR feedback, generating weekly reports, updating documentation, or creating boilerplate code. These tasks aren't complex—they follow predictable patterns—but they're cumbersome and time-consuming. MCP prompts were designed to help automate this kind of work.

MCP prompts offer more than command shortcuts. They're a primitive for building workflow automation that combines the flexibility of scripting with the intelligence of modern AI systems. This post explores how to build automations using MCP's prompt system, resource templates, and modular servers. I'll demonstrate these concepts through a meal planning automation I built, but the patterns apply broadly to any structured, repetitive workflow.

## A Real Use Case: Weekly Meal Planning

Recently, I got into cooking. Not only did I realize how difficult it is to make a nice dish, but also discovered you need an overwhelming number of ingredients. In the spirit of trying new things and reducing food waste, I decided to dedicate each week to cooking dishes from a single cuisine.

The process started simple enough: pick a cuisine, decide on dishes, write down ingredients, go grocery shopping, and stick the recipes on the fridge. Yes, it sounds charmingly old-school, and it was—for about three weeks. 

Then I realized I could automate most of this process. All I wanted was to pick a cuisine and let everything else happen like magic.

So I decided to write some MCP servers! The goal was to turn our multi-step manual process into a few clicks:

1. Select a prompt
    <img
    src="/posts/images/prompts-list.png"
    alt="MCP prompts list showing available automation commands"
  />
2. Select a cuisine from a dropdown
    <img
    src="/posts/images/prompts-suggestions.png"
    alt="Dropdown showing cuisine suggestions as user types"
  />
3. Done! The system generates a meal plan, shopping list, and even prints the shopping list and recipes.

  <img
    src="/posts/images/prompts-final-result.png"
    alt="Final generated meal plan and shopping list output"
  />


This post focuses primarily on the Recipe Server with its prompts and resources. You can find the [printing server example here](https://github.com/ihrpr/mcp-server-tiny-print) (it works with a specific thermal printer model, but you could easily swap it for email, Notion, or any other output method). The beauty of separate servers is that you can mix and match different capabilities.


## Understanding MCP Prompts: Simple vs Complex

MCP provides different ways to define prompts, and understanding the distinction is crucial for building effective automations. For a complete technical reference, see the [MCP Prompts specification](https://modelcontextprotocol.io/specification/2025-06-18/server/prompts).

### Simple Prompts

Simple prompts return text strings. They work well for straightforward instructions where the AI can operate on general knowledge. For example:

```
"Create a meal plan for a week - use only Italian cuisine and ingredients that can be re-used"
```

This works fine—modern AI models are powerful enough to generate reasonable meal plans from this instruction alone. But there's a limitation: the AI only knows what it was trained on, not your specific preferences, dietary restrictions, or that amazing pasta recipe you saved last month.

### Complex Prompts

Complex prompts go beyond simple text instructions by including structured data and resources. This is crucial when you need the AI to work with your specific context rather than general knowledge.

In my meal planning example, I don't want generic Italian recipes—I want the AI to use MY collection of tested recipes that I know I like. Complex prompts make this possible by bundling prompt text with embedded resources.

Here's how it works:

1. **User selects a prompt** with parameters (e.g., "plan-meals" with cuisine="italian")
2. **Server returns** both instructional text AND resource references
3. **Client decides how to handle resources** - Applications might choose to select a subset of data using embeddings or keyword search, or pass the raw data directly to the model
4. **AI receives the context** and generates a response

In my example, VS Code attached the entire resource to the prompt, which worked great for this use case. The AI had access to all my Italian recipes when planning an Italian week, ensuring it only suggested dishes I actually had recipes for.

The key difference from simple prompts: instead of asking "Plan Italian meals" and getting generic suggestions, the AI works with your actual recipe collection, dietary preferences, and constraints.

  <img
    src="/posts/images/promots-rendered-prompt.png"
    alt="VS Code showing the rendered prompt with attached recipe resources"
  />

The recipe resources we've been using are **embedded resources** - direct references to server-side content. According to the [MCP specification](https://modelcontextprotocol.io/specification/2025-06-18/server/prompts#data-types), prompts can also include other data types:
- **Text Content**: Direct text in the prompt messages
- **Image Content**: Base64-encoded images for visual context
- **Audio Content**: Base64-encoded audio for voice-based interactions

This enables advanced use cases beyond our text-based recipes, like design review prompts with screenshots or voice transcription services.

## Core Components

Let's dive into the three components that make this automation possible: prompts, resources, and completions. I'll show you how each works conceptually, then we'll implement them together.

### 1. Resource Templates: Dynamic Content at Scale

Traditional static resources don't scale well. If you have recipes for 20 cuisines, creating 20 separate resources becomes unwieldy. Resource templates solve this through URI patterns that dynamically serve content.

A template like `file://recipes/${cuisine}` transforms a single resource definition into a dynamic content provider:
- `file://recipes/italian` returns Italian recipes
- `file://recipes/japanese` returns Japanese recipes
- `file://recipes/mexican` returns Mexican recipes

This pattern extends beyond simple filtering. You can create templates for:
- Hierarchical data: `file://docs/${category}/${topic}`
- Versioned content: `file://api/v${version}/${endpoint}`
- Query-based filtering: `file://data/${type}?filter=${criteria}`
- User-specific content: `file://user/${userId}/${dataType}`

### 2. Completions: Creating Fluid Interactions

Nobody remembers exact parameter values. Is it "italian" or "Italian" or "it"? Completions bridge this gap by providing suggestions as users type, creating an interface that feels intuitive rather than restrictive.

Different MCP clients present completions differently:
- VS Code shows a filterable dropdown
- Command-line tools might use fuzzy matching
- Web interfaces could provide rich previews

But the underlying data comes from your server, maintaining consistency across all clients.

### 3. Prompts: The Automation Commands

Prompts are the entry points to your automation. They define what commands are available and what resources they need. In my meal planning system, I have a prompt called "plan-meals" that:
- Accepts a cuisine parameter
- Returns instructions for the AI
- Includes references to the relevant recipe resources

## Building the Recipe Server

Let's implement a complete MCP server that brings together all the concepts we've discussed. We'll start with the server setup and then implement each capability.

### Prerequisites

Before diving into the code, make sure you have:

1. **Node.js** (v18 or higher) and npm installed
2. **TypeScript** knowledge (basic familiarity is enough)
3. **MCP SDK** installed:
   ```bash
   npm install @modelcontextprotocol/sdk
   ```
4. **A MCP-compatible client** like VS Code with the MCP extension

For this tutorial, I'll use the TypeScript SDK, but MCP also supports Python and other languages.

### Server Setup and Capabilities

First, let's create our MCP server and declare its capabilities:

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  CompleteRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

class RecipeServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "favorite-recipes",
        version: "1.0.0",
      },
      {
        capabilities: {
          resources: {},     // Enable resource serving
          prompts: {},       // Enable prompt automation
          completion: {},    // Enable parameter completions
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    // We'll implement each handler next
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

// Start the server
const server = new RecipeServer();
server.run().catch(console.error);
```

Each capability declaration tells MCP clients what features your server supports:
- `resources`: Your server can provide dynamic content (recipe collections)
- `prompts`: Your server offers automation commands
- `completion`: Your server provides parameter suggestions

### Implementing Resources

I need two handlers for resource templates:

**List Resources Handler** - This enables resource discovery:

```typescript
this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: COUNTRIES.map((cuisine) => ({
      uri: `file://recipes/${cuisine}`,
      name: `${cuisine.charAt(0).toUpperCase() + cuisine.slice(1)} Recipes`,
      mimeType: "text/markdown",
      description: `Traditional recipes from ${
        cuisine.charAt(0).toUpperCase() + cuisine.slice(1)
      } cuisine`,
    })),
  };
});
```

**Read Resource Handler** - This serves the actual content:

```typescript
this.server.setRequestHandler(
  ReadResourceRequestSchema,
  async (request) => {
    const uri = request.params.uri;

    if (!uri.startsWith("file://recipes/")) {
      throw new Error(`Unknown resource: ${uri}`);
    }

    const cuisine = uri.replace("file://recipes/", "");
    if (!COUNTRIES.includes(cuisine)) {
      throw new Error(`Unknown cuisine: ${cuisine}`);
    }

    const content = formatRecipesAsMarkdown(cuisine);

    return {
      contents: [
        {
          uri,
          mimeType: "text/markdown",
          text: content,
        },
      ],
    };
  }
);
```

### Implementing Completions

Completions help users discover valid parameter values:

```typescript
this.server.setRequestHandler(
  CompleteRequestSchema,
  async (request) => {
    // Handle completion for cuisine parameter
    if (request.params.ref.name === "plan-meals" && 
        request.params.argument.name === "cuisine") {
      
      const partial = request.params.argument.value?.toLowerCase() || "";
      
      return {
        completion: {
          values: COUNTRIES
            .filter(cuisine => cuisine.startsWith(partial))
            .map(cuisine => ({
              value: cuisine,
              description: `Plan meals using ${cuisine} recipes`
            }))
        }
      };
    }
    
    return { completion: { values: [] } };
  }
);
```

### Implementing Prompts

Finally, the prompt that ties everything together:

```typescript
this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: "plan-meals",
        description: "Plan a week of meals from a specific cuisine",
        arguments: [
          {
            name: "cuisine",
            description: "The cuisine to use for meal planning",
            required: true
          }
        ]
      }
    ]
  };
});

this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (request.params.name !== "plan-meals") {
    throw new Error("Unknown prompt");
  }

  const cuisine = request.params.arguments?.cuisine;
  if (!cuisine || !COUNTRIES.includes(cuisine)) {
    throw new Error("Valid cuisine parameter required");
  }

  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Create a meal plan for one week using ${cuisine} cuisine...`
        }
      }
    ],
    resources: [
      {
        uri: `file://recipes/${cuisine}`,
        // This tells the client to include this resource with the prompt
      }
    ]
  };
});
```

The separation between listing and reading enables efficient implementations. Clients can show available prompts without executing them, completions work without loading all resources, and resources generate content on-demand.

### Putting It All Together

Now let's complete our server implementation by wiring up all the handlers:

```typescript
private setupHandlers() {
  // Resource handlers
  this.server.setRequestHandler(ListResourcesRequestSchema, this.handleListResources.bind(this));
  this.server.setRequestHandler(ReadResourceRequestSchema, this.handleReadResource.bind(this));
  
  // Prompt handlers
  this.server.setRequestHandler(ListPromptsRequestSchema, this.handleListPrompts.bind(this));
  this.server.setRequestHandler(GetPromptRequestSchema, this.handleGetPrompt.bind(this));
  
  // Completion handler
  this.server.setRequestHandler(CompleteRequestSchema, this.handleComplete.bind(this));
}
```

When a user interacts with this server:
1. They see available prompts via `ListPrompts`
2. They get parameter suggestions via `Complete`
3. They execute the prompt via `GetPrompt`
4. The server dynamically includes the right resources
5. The AI receives full context for the task


## What's Next?

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


## Running It Yourself

Setting up local MCP servers in VS Code is straightforward. You can see their status, debug what's happening, and iterate quickly on your automations. The [full code for the recipe server is available here](https://github.com/ihrpr/mcp-server-fav-recipes).

## Wrapping Up

This meal planning automation started as a simple desire to avoid rewriting shopping lists every week. It evolved into a complete system that handles meal planning, shopping lists, and recipe printing with just a few clicks.

MCP prompts provide practical tools to automate repetitive tasks. The modular architecture means you can start small—perhaps just automating one part of your workflow—and expand as needed. Whether you're automating documentation, reports, or meal planning, the patterns remain the same: identify repetitive tasks, build focused automations, and let the system handle the tedious parts.