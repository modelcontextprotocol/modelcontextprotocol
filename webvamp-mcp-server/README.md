# WebVamp MCP Design System

## The Next Generation of Web Templates

**Traditional web templates are dead. Long live AI-consultable designer intelligence.**

### What is This?

This is NOT another template marketplace or component library.

This IS the **future of web templates** - where templates become **living designer brains** that AI can consult like talking to the original developer.

## The Problem with Traditional Templates

When you buy a template today, you get:
- Static HTML/CSS/JS files
- "Here's what I built, good luck modifying it"
- The template dies the moment you download it
- You're on your own to customize it

## The WebVamp Solution

**WebVamp transforms ANY template into an AI-consultable "Designer Brain"**

Think of it like this:

> "I love this template. I wish I could hire the designer who made it to build MY specific product with this exact aesthetic."

**WebVamp makes that real.**

It's like having the template's original designer sitting next to your AI, saying:

- "Here's how I think about spacing"
- "This is my color philosophy"
- "Here's why these components work together"
- "Let me build your new component in my exact style"

## How It Works

### 1. Ingest ANY Template

Point WebVamp at any web template directory:

```bash
npm run ingest ./my-awesome-template
```

### 2. Designer Brain Extraction

WebVamp uses advanced AST parsing (PostCSS, PostHTML, CSS Tree) to extract:

- **Component DNA**: Every component's complete genetic code
- **Design Tokens**: Colors, spacing, typography (W3C DTCG format)
- **Relationships**: How components compose together
- **Constraints**: The designer's rules (no arbitrary values)
- **Patterns**: Responsive strategies, naming conventions
- **Philosophy**: The designer's aesthetic principles

All saved as `designer-brain.json` - **the designer's complete mental model**

### 3. MCP Server

Start the MCP server to expose this designer brain to AI:

```bash
npm start
```

### 4. AI Consultation

Now AI can:

✅ **Search components** - "Find me a button for dangerous actions"
✅ **Get complete DNA** - Every detail about any component
✅ **Generate NEW components** - "Build a user profile card in this style"
✅ **Validate components** - "Does this match the design system?"

The AI receives **full context** on every request - it's like the original designer is building it.

## Installation

```bash
# Clone and install
git clone <repo>
cd webvamp-mcp-server
npm install

# Build
npm run build

# Ingest a template
npm run ingest /path/to/your/template

# Start MCP server
npm start
```

## Configure with Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "webvamp-design-system": {
      "command": "node",
      "args": ["/absolute/path/to/webvamp-mcp-server/build/index.js"],
      "env": {
        "DESIGNER_BRAIN_PATH": "/absolute/path/to/designer-brain.json"
      }
    }
  }
}
```

Restart Claude Desktop.

## Usage Examples

### Example 1: Search Components

**You:** "Show me all button components"

**AI:** *(Uses `search_components` tool)*

```
Found 3 button components:
1. Primary Button - For main call-to-action
2. Secondary Button - For secondary actions
3. Danger Button - For destructive actions
```

### Example 2: Generate New Component

**You:** "Create a user profile card with avatar, name, bio, and follow button"

**AI:** *(Uses `generate_component` tool)*

The AI receives:
- 3-5 example card components from the template
- All design tokens (colors, spacing, typography)
- Design constraints (no hardcoded colors, use token scale)
- Design philosophy (minimalist, rounded corners, etc.)

**Result:** A component that's **indistinguishable** from the original template's style

### Example 3: Validate Custom Component

**You:** "Does this component match the design system?"

```html
<div class="custom-card" style="padding: 15px; color: #FF0000;">
```

**AI:** *(Uses `validate_component` tool)*

```
❌ Issues found:
- Hardcoded color #FF0000 (should use design token)
- Non-standard spacing 15px (should use: 8px, 16px, 24px, 32px)
- Missing accessibility attributes

Score: 60/100
```

## Architecture

### Component DNA Extraction

```typescript
interface ComponentDNA {
  id: string;
  name: string;
  type: 'button' | 'input' | 'card' | ...;
  structure: {
    html: string;
    ast: HTMLNode;  // PostHTML AST
    selectors: string[];
  };
  styling: {
    css: string;
    cssAST: CSSNode;  // PostCSS AST
    appliedTokens: TokenUsage[];
  };
  variants: ComponentVariant[];
  composition: {
    allowedChildren: string[];
    commonPairings: string[];
  };
  accessibility: {
    requiredAttributes: string[];
    keyboardNav: string[];
  };
}
```

### Design Token Brain

Following **W3C DTCG specification**:

```typescript
interface DesignTokenBrain {
  colors: {
    base: { blue: { $value: "#0066FF", $type: "color" } };
    semantic: { actionPrimary: { $value: "{color.base.blue}" } };
    component: { buttonBg: { $value: "{color.semantic.actionPrimary}" } };
  };
  spacing: {
    scale: { xs: "4px", sm: "8px", md: "16px", ... };
  };
  typography: {
    fontSizes: { ... };
    fontWeights: { ... };
  };
}
```

### MCP Tools

| Tool | Purpose |
|------|---------|
| `search_components` | Semantic search for components |
| `get_component` | Get complete component DNA |
| `generate_component` | Generate new component in style |
| `validate_component` | Validate against design system |

### MCP Resources

| Resource | Data |
|----------|------|
| `design://catalog` | All component metadata |
| `design://tokens` | Complete token system |
| `design://constraints` | Designer's rules |
| `design://philosophy` | Aesthetic principles |

## The Revolutionary Part

### Before WebVamp

**Templates = Static Files**

1. Download template
2. Try to understand the code
3. Modify carefully (hope you don't break it)
4. Add new components (hope they match)
5. Result: Inconsistent, breaks easily

### After WebVamp

**Templates = AI-Consultable Designer Intelligence**

1. Ingest template → designer brain
2. AI understands the complete design system
3. Ask AI to build anything in that style
4. AI generates pixel-perfect components
5. Result: Perfect consistency, infinite extensibility

## What Makes This Possible

### 1. AST-Level Extraction

Not regex text parsing - actual Abstract Syntax Tree analysis:

- **PostCSS** - CSS parsing with full selector understanding
- **PostHTML** - HTML structure analysis
- **CSS Tree** - W3C-compliant CSS validation

### 2. Design Token Philosophy

Extracts the designer's **thinking**, not just values:

- Why did they choose these colors?
- What's the spacing rhythm?
- How do components compose?

### 3. RAG-Level Context

Every AI request includes:

- All similar components as examples
- Complete token system
- Design constraints
- Relationship graphs

### 4. Constraint-Based Generation

AI generates within **defined boundaries**:

- ONLY use design tokens
- Follow spacing scale
- Match naming conventions
- Ensure accessibility

## Comparison to Existing Solutions

| Solution | What It Does | WebVamp Does |
|----------|--------------|--------------|
| **shadcn/ui** | Copy components to your code | ✅ + Extracts from ANY template |
| **Storybook** | Document components | ✅ + Makes them AI-consultable |
| **Figma** | Design components | ✅ + Captures developer intent |
| **v0** | AI generates components | ✅ + In YOUR exact style |

**WebVamp = All of the above + Designer Brain Extraction**

## Real-World Use Cases

### Use Case 1: Agency with Custom Client Templates

Before:
- 50 client websites
- Each needs minor changes
- Manually code each change
- Inconsistencies creep in

After:
- Ingest each client's template
- AI builds new features in exact style
- Perfect brand consistency
- 10x faster development

### Use Case 2: Template Marketplace 2.0

Before:
- Sell static template files
- Customers struggle to customize
- Support requests flood in

After:
- Sell "Designer Brain" + files
- Customers use AI to customize
- AI builds perfect-match components
- Support requests drop to zero

### Use Case 3: Design System Maintenance

Before:
- Design system docs get outdated
- Developers forget token names
- Components drift from standards

After:
- Designer brain is always accurate
- AI validates all components
- Impossible to break the system

## Technical Deep Dive

### Component Extraction Engine

```typescript
class ComponentExtractor {
  // Parse HTML/CSS into ASTs
  parseHTML(html: string): HTMLNode[]
  parseCSS(css: string): PostCSSRoot

  // Build selector → element mapping
  buildSelectorMap(htmlAST, cssAST): Map<string, ...>

  // Identify component boundaries
  identifyComponents(htmlAST): ComponentCandidate[]

  // Extract complete DNA
  extractComponentDNA(candidate): ComponentDNA
}
```

### Token Extraction Engine

```typescript
class TokenExtractor {
  // Extract color systems (base → semantic → component)
  extractColors(cssAST): ColorTokenSystem

  // Extract spacing scales
  extractSpacing(cssAST): SpacingTokenSystem

  // Extract typography systems
  extractTypography(cssAST): TypographyTokenSystem

  // Detect designer's patterns
  detectPatterns(css): DesignPatterns
}
```

## Roadmap

- [x] Component DNA extraction
- [x] Design token extraction
- [x] MCP server with Tools/Resources
- [x] Validation system
- [ ] RAG system with ChromaDB embeddings
- [ ] Visual regression testing
- [ ] Figma import support
- [ ] Multi-framework output (React, Vue, Svelte)
- [ ] Template marketplace integration
- [ ] Automatic component screenshots
- [ ] Design system evolution tracking

## Contributing

This is the future of web templates. Help us build it.

## License

MIT

---

## The Vision

**Templates should not be static files.**

**Templates should be AI-consultable designer intelligence.**

WebVamp makes that real.

Now when you find a template you love, you're not just buying files - you're buying **the designer's brain as an API**.

Ask it to build anything. It will match the style perfectly. Every time.

Welcome to the next generation of web development.
