#!/usr/bin/env node

/**
 * WebVamp MCP Design System Server
 *
 * This is the NEXT GENERATION of web templates.
 *
 * Instead of static files, templates become AI-consultable "designer brains."
 * It's like having the template's original developer sitting next to the AI,
 * ready to build component #48 that perfectly matches components 1-47.
 *
 * How it works:
 * 1. Ingest ANY web template (HTML/CSS/JS)
 * 2. Extract the designer's complete mental model
 * 3. Expose as MCP server so AI can "consult" the designer
 * 4. AI generates new components in the exact style
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { DesignerBrain, ComponentDNA } from './types/index.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const DESIGNER_BRAIN_PATH = process.env.DESIGNER_BRAIN_PATH ||
  join(process.cwd(), 'designer-brain.json');

// ============================================================================
// LOAD DESIGNER BRAIN
// ============================================================================

let designerBrain: DesignerBrain | null = null;

function loadDesignerBrain(): DesignerBrain {
  console.error('🧠 Loading Designer Brain...');

  if (!existsSync(DESIGNER_BRAIN_PATH)) {
    console.error(`❌ Designer Brain not found at: ${DESIGNER_BRAIN_PATH}`);
    console.error('💡 Run: npm run ingest <template-directory> to create one');
    process.exit(1);
  }

  try {
    const data = readFileSync(DESIGNER_BRAIN_PATH, 'utf-8');
    const brain = JSON.parse(data) as DesignerBrain;
    console.error(`✅ Loaded ${brain.components.length} components`);
    console.error(`✅ Loaded ${Object.keys(brain.tokens.colors.base).length} color tokens`);
    return brain;
  } catch (error) {
    console.error('❌ Failed to load Designer Brain:', error);
    process.exit(1);
  }
}

designerBrain = loadDesignerBrain();

// ============================================================================
// MCP SERVER
// ============================================================================

const server = new McpServer({
  name: 'webvamp-design-system',
  version: '1.0.0',
  capabilities: {
    tools: {},
    resources: {},
  },
});

// ============================================================================
// TOOLS - What the AI can DO with the designer brain
// ============================================================================

/**
 * TOOL: Search components by semantic query
 *
 * AI can ask: "Find me a button for dangerous actions"
 * Returns: Components matching that semantic description
 */
server.tool(
  'search_components',
  'Search for components by semantic description or type',
  {
    query: z.string().describe('Semantic search query (e.g., "primary action button", "user card")'),
    type: z.enum([
      'button', 'input', 'card', 'modal', 'nav',
      'header', 'footer', 'form', 'table', 'list', 'custom'
    ]).optional().describe('Filter by component type'),
    category: z.enum([
      'actions', 'inputs', 'feedback', 'layout',
      'navigation', 'data-display', 'content'
    ]).optional().describe('Filter by category'),
    limit: z.number().optional().default(5).describe('Maximum number of results'),
  },
  async ({ query, type, category, limit }) => {
    console.error(`🔍 Searching: "${query}"`);

    if (!designerBrain) {
      return {
        content: [{
          type: 'text',
          text: 'Designer brain not loaded',
        }],
      };
    }

    // Filter components
    let results = designerBrain.components;

    if (type) {
      results = results.filter(c => c.type === type);
    }

    if (category) {
      results = results.filter(c => c.category === category);
    }

    // Simple text matching (would use embeddings in production)
    const queryLower = query.toLowerCase();
    results = results.filter(c =>
      c.name.toLowerCase().includes(queryLower) ||
      c.usageContext.description.toLowerCase().includes(queryLower) ||
      c.usageContext.useCases.some(uc => uc.toLowerCase().includes(queryLower))
    );

    results = results.slice(0, limit);

    const response = results.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      category: c.category,
      description: c.usageContext.description,
      useCases: c.usageContext.useCases,
      variants: c.variants.map(v => v.name),
      example: c.usageContext.examples[0]?.code || '',
    }));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2),
      }],
    };
  }
);

/**
 * TOOL: Get complete component DNA
 *
 * Returns EVERYTHING about a component - its complete genetic code
 */
server.tool(
  'get_component',
  'Get complete details about a specific component',
  {
    componentId: z.string().describe('Component ID from search results'),
  },
  async ({ componentId }) => {
    console.error(`📦 Getting component: ${componentId}`);

    if (!designerBrain) {
      return {
        content: [{
          type: 'text',
          text: 'Designer brain not loaded',
        }],
      };
    }

    const component = designerBrain.components.find(c => c.id === componentId);

    if (!component) {
      return {
        content: [{
          type: 'text',
          text: `Component not found: ${componentId}`,
        }],
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(component, null, 2),
      }],
    };
  }
);

/**
 * TOOL: Generate new component in designer's style
 *
 * This is the MAGIC - AI asks the designer brain to build something new
 */
server.tool(
  'generate_component',
  'Generate a new component matching the design system style',
  {
    type: z.enum([
      'button', 'input', 'card', 'modal', 'nav',
      'header', 'footer', 'form', 'table', 'list', 'custom'
    ]).describe('Type of component to generate'),
    description: z.string().describe('What the component should do'),
    variant: z.string().optional().describe('Variant (e.g., "primary", "large")'),
    includeTokens: z.boolean().optional().default(true).describe('Include design token usage'),
  },
  async ({ type, description, variant, includeTokens }) => {
    console.error(`🎨 Generating ${type}: ${description}`);

    if (!designerBrain) {
      return {
        content: [{
          type: 'text',
          text: 'Designer brain not loaded',
        }],
      };
    }

    // Find similar components as examples
    const similarComponents = designerBrain.components
      .filter(c => c.type === type)
      .slice(0, 3);

    if (similarComponents.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No ${type} components found in design system to use as reference`,
        }],
      };
    }

    // Build generation context
    const context = {
      request: {
        type,
        description,
        variant,
      },
      designSystem: {
        tokens: includeTokens ? designerBrain.tokens : undefined,
        constraints: designerBrain.constraints,
        philosophy: designerBrain.philosophy,
      },
      examples: similarComponents.map(c => ({
        name: c.name,
        html: c.structure.html,
        css: c.styling.css,
        tokens: c.styling.appliedTokens,
        variants: c.variants,
      })),
      instructions: [
        '1. Study the example components - they show the designer\'s exact style',
        '2. Use ONLY the provided design tokens - no hardcoded colors/spacing',
        '3. Follow the same naming conventions and structure patterns',
        '4. Ensure accessibility (ARIA attributes, keyboard nav)',
        '5. Match the aesthetic - it should be indistinguishable from examples',
      ],
    };

    return {
      content: [{
        type: 'text',
        text: `DESIGNER BRAIN CONTEXT for generating ${type}:\n\n` +
          JSON.stringify(context, null, 2) +
          `\n\n---\n\n` +
          `The above context contains everything from the original designer's brain.\n` +
          `Generate a ${type} component that matches this exact style.\n\n` +
          `Return:\n` +
          `1. HTML structure\n` +
          `2. CSS styling (using the provided tokens)\n` +
          `3. Token usage explanation\n` +
          `4. Accessibility notes`,
      }],
    };
  }
);

/**
 * TOOL: Validate component against design system
 *
 * Check if a component matches the designer's style
 */
server.tool(
  'validate_component',
  'Validate if a component matches the design system',
  {
    html: z.string().describe('HTML code of the component'),
    css: z.string().describe('CSS code of the component'),
  },
  async ({ html, css }) => {
    console.error('✅ Validating component...');

    if (!designerBrain) {
      return {
        content: [{
          type: 'text',
          text: 'Designer brain not loaded',
        }],
      };
    }

    const issues: string[] = [];
    const suggestions: string[] = [];

    // Check for hardcoded colors (should use tokens)
    const colorRegex = /#[0-9a-f]{3,6}|rgb\(|hsl\(/gi;
    if (colorRegex.test(css)) {
      issues.push('❌ Hardcoded colors found - should use design tokens');
      suggestions.push(`Use tokens like: ${Object.keys(designerBrain.tokens.colors.base).slice(0, 3).join(', ')}`);
    }

    // Check for arbitrary spacing (should use scale)
    const spacingRegex = /\d+px/g;
    const spacingMatches = css.match(spacingRegex) || [];
    const allowedSpacing = Object.values(designerBrain.tokens.spacing.scale).map(t => t.$value);

    for (const spacing of spacingMatches) {
      if (!allowedSpacing.includes(spacing)) {
        issues.push(`⚠️  Non-standard spacing: ${spacing}`);
      }
    }

    // Check for accessibility attributes
    if (!html.includes('aria-') && !html.includes('role=')) {
      issues.push('⚠️  Missing accessibility attributes');
      suggestions.push('Add ARIA labels, roles, and keyboard navigation');
    }

    const score = Math.max(0, 100 - (issues.length * 20));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          valid: issues.length === 0,
          score,
          issues,
          suggestions,
          message: score > 80
            ? '✅ Component matches design system well!'
            : '⚠️  Component needs adjustments to match design system',
        }, null, 2),
      }],
    };
  }
);

// ============================================================================
// RESOURCES - Design system data AI can read
// ============================================================================

/**
 * RESOURCE: Component catalog
 *
 * List of all available components
 */
server.resource(
  'design://catalog',
  'Component catalog with all available components',
  async () => {
    if (!designerBrain) {
      return {
        contents: [{
          uri: 'design://catalog',
          mimeType: 'application/json',
          text: JSON.stringify({ error: 'Designer brain not loaded' }),
        }],
      };
    }

    const catalog = {
      metadata: designerBrain.metadata,
      components: designerBrain.components.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        category: c.category,
        description: c.usageContext.description,
        variants: c.variants.map(v => v.name),
      })),
    };

    return {
      contents: [{
        uri: 'design://catalog',
        mimeType: 'application/json',
        text: JSON.stringify(catalog, null, 2),
      }],
    };
  }
);

/**
 * RESOURCE: Design tokens
 *
 * All design tokens (colors, spacing, typography)
 */
server.resource(
  'design://tokens',
  'All design tokens (colors, spacing, typography)',
  async () => {
    if (!designerBrain) {
      return {
        contents: [{
          uri: 'design://tokens',
          mimeType: 'application/json',
          text: JSON.stringify({ error: 'Designer brain not loaded' }),
        }],
      };
    }

    return {
      contents: [{
        uri: 'design://tokens',
        mimeType: 'application/json',
        text: JSON.stringify(designerBrain.tokens, null, 2),
      }],
    };
  }
);

/**
 * RESOURCE: Design constraints
 *
 * The designer's rules and constraints
 */
server.resource(
  'design://constraints',
  "The designer's rules and constraints",
  async () => {
    if (!designerBrain) {
      return {
        contents: [{
          uri: 'design://constraints',
          mimeType: 'application/json',
          text: JSON.stringify({ error: 'Designer brain not loaded' }),
        }],
      };
    }

    return {
      contents: [{
        uri: 'design://constraints',
        mimeType: 'application/json',
        text: JSON.stringify(designerBrain.constraints, null, 2),
      }],
    };
  }
);

/**
 * RESOURCE: Design philosophy
 *
 * The designer's aesthetic principles
 */
server.resource(
  'design://philosophy',
  "The designer's aesthetic principles",
  async () => {
    if (!designerBrain) {
      return {
        contents: [{
          uri: 'design://philosophy',
          mimeType: 'application/json',
          text: JSON.stringify({ error: 'Designer brain not loaded' }),
        }],
      };
    }

    return {
      contents: [{
        uri: 'design://philosophy',
        mimeType: 'application/json',
        text: JSON.stringify(designerBrain.philosophy, null, 2),
      }],
    };
  }
);

// ============================================================================
// START SERVER
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('');
  console.error('🚀 WebVamp MCP Design System Server');
  console.error('');
  console.error('💡 This template is now an AI-consultable designer brain');
  console.error(`📦 ${designerBrain?.components.length || 0} components loaded`);
  console.error(`🎨 ${Object.keys(designerBrain?.tokens.colors.base || {}).length} color tokens`);
  console.error('');
  console.error('✨ AI can now:');
  console.error('  - Search components');
  console.error('  - Get complete component DNA');
  console.error('  - Generate NEW components in the exact style');
  console.error('  - Validate components against the design system');
  console.error('');
  console.error('Running on stdio...');
  console.error('');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
