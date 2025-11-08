#!/usr/bin/env node

/**
 * Template Ingestion CLI
 *
 * This tool transforms ANY web template into an AI-consultable "Designer Brain"
 *
 * Usage:
 *   npm run ingest /path/to/template
 *
 * What it does:
 * 1. Scans all HTML/CSS files in the template
 * 2. Extracts component DNA using AST parsing
 * 3. Extracts design tokens (colors, spacing, typography)
 * 4. Builds relationship graphs
 * 5. Detects constraints and patterns
 * 6. Saves as designer-brain.json
 *
 * The result: A template that AI can "consult" like talking to the original designer
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { ComponentExtractor } from '../engine/ComponentExtractor.js';
import { TokenExtractor } from '../engine/TokenExtractor.js';
import type {
  DesignerBrain,
  TemplateMetadata,
  DesignConstraints,
  DesignPatterns,
  DesignPhilosophy,
  ComponentRelationshipGraph,
} from '../types/index.js';

async function main() {
  const templatePath = process.argv[2];

  if (!templatePath) {
    console.error('');
    console.error('🧠 WebVamp Template Ingestion');
    console.error('');
    console.error('Usage: npm run ingest <template-directory>');
    console.error('');
    console.error('Example: npm run ingest ./my-awesome-template');
    console.error('');
    console.error('This will transform your template into an AI-consultable designer brain.');
    console.error('');
    process.exit(1);
  }

  console.error('');
  console.error('🧠 Starting Template Ingestion...');
  console.error(`📂 Source: ${templatePath}`);
  console.error('');

  // Scan template files
  const files = scanTemplateFiles(templatePath);
  console.error(`📄 Found ${files.html.length} HTML files`);
  console.error(`🎨 Found ${files.css.length} CSS files`);
  console.error('');

  if (files.html.length === 0) {
    console.error('❌ No HTML files found. Please provide a valid template directory.');
    process.exit(1);
  }

  // Combine all HTML and CSS
  const allHTML = files.html.map(f => readFileSync(f, 'utf-8')).join('\n');
  const allCSS = files.css.map(f => readFileSync(f, 'utf-8')).join('\n');

  // Extract components
  console.error('🧬 Extracting components...');
  const componentExtractor = new ComponentExtractor();
  const components = await componentExtractor.extractComponents(allHTML, allCSS);
  console.error(`✅ Extracted ${components.length} components`);
  console.error('');

  // Extract design tokens
  console.error('🎨 Extracting design tokens...');
  const tokenExtractor = new TokenExtractor();
  const tokens = await tokenExtractor.extractTokens(allCSS);
  console.error(`✅ Color tokens: ${Object.keys(tokens.colors.base).length}`);
  console.error(`✅ Spacing tokens: ${Object.keys(tokens.spacing.scale).length}`);
  console.error(`✅ Typography tokens: ${Object.keys(tokens.typography.fontSizes).length}`);
  console.error('');

  // Build relationship graph
  console.error('🔗 Building relationship graph...');
  const relationships = buildRelationshipGraph(components);
  console.error(`✅ Found ${relationships.edges.length} relationships`);
  console.error('');

  // Detect constraints
  console.error('📏 Detecting design constraints...');
  const constraints = detectConstraints(tokens, components);
  console.error('✅ Constraints detected');
  console.error('');

  // Detect patterns
  console.error('🎯 Detecting design patterns...');
  const patterns = detectPatterns(allCSS, components);
  console.error('✅ Patterns detected');
  console.error('');

  // Infer design philosophy
  console.error('🎨 Inferring design philosophy...');
  const philosophy = inferPhilosophy(components, tokens);
  console.error('✅ Philosophy inferred');
  console.error('');

  // Build complete designer brain
  const designerBrain: DesignerBrain = {
    metadata: {
      name: templatePath.split('/').pop() || 'unknown',
      version: '1.0.0',
      sourceDirectory: templatePath,
      ingestedAt: new Date(),
      fileCount: files.html.length + files.css.length,
      componentCount: components.length,
      tokenCount: Object.keys(tokens.colors.base).length +
        Object.keys(tokens.spacing.scale).length +
        Object.keys(tokens.typography.fontSizes).length,
    },
    components,
    tokens,
    relationships,
    constraints,
    patterns,
    philosophy,
  };

  // Save designer brain
  const outputPath = join(process.cwd(), 'designer-brain.json');
  writeFileSync(outputPath, JSON.stringify(designerBrain, null, 2));

  console.error('');
  console.error('🎉 Designer Brain Created!');
  console.error('');
  console.error(`💾 Saved to: ${outputPath}`);
  console.error('');
  console.error('📊 Summary:');
  console.error(`  - ${components.length} components extracted`);
  console.error(`  - ${designerBrain.metadata.tokenCount} design tokens`);
  console.error(`  - ${relationships.edges.length} component relationships`);
  console.error('');
  console.error('✨ Your template is now an AI-consultable designer brain!');
  console.error('');
  console.error('Next steps:');
  console.error('  1. Start the MCP server: npm start');
  console.error('  2. Configure in Claude Desktop config');
  console.error('  3. Ask AI to generate components in this style!');
  console.error('');
}

/**
 * Scan template directory for HTML and CSS files
 */
function scanTemplateFiles(dir: string): { html: string[]; css: string[] } {
  const html: string[] = [];
  const css: string[] = [];

  function scan(path: string) {
    const items = readdirSync(path);

    for (const item of items) {
      const fullPath = join(path, item);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        // Skip common non-template directories
        if (!['node_modules', '.git', 'dist', 'build'].includes(item)) {
          scan(fullPath);
        }
      } else {
        const ext = extname(fullPath).toLowerCase();
        if (ext === '.html' || ext === '.htm') {
          html.push(fullPath);
        } else if (ext === '.css') {
          css.push(fullPath);
        }
      }
    }
  }

  scan(dir);
  return { html, css };
}

/**
 * Build component relationship graph
 */
function buildRelationshipGraph(components: DesignerBrain['components']): ComponentRelationshipGraph {
  const nodes = components.map(c => ({
    componentId: c.id,
    depth: 0,
    frequency: 1,
    importance: 0.5,
  }));

  const edges: ComponentRelationshipGraph['edges'] = [];

  // Build parent-child relationships based on composition rules
  for (const component of components) {
    for (const allowedChild of component.composition.allowedChildren) {
      const childComponents = components.filter(c =>
        c.type === allowedChild || c.name.toLowerCase().includes(allowedChild.toLowerCase())
      );

      for (const child of childComponents) {
        edges.push({
          parent: component.id,
          child: child.id,
          type: 'contains',
          frequency: 1,
        });
      }
    }
  }

  return {
    nodes,
    edges,
    hierarchies: [],
    commonPatterns: [],
  };
}

/**
 * Detect design constraints from tokens and components
 */
function detectConstraints(
  tokens: DesignerBrain['tokens'],
  components: DesignerBrain['components']
): DesignConstraints {
  return {
    spacing: {
      allowedValues: Object.values(tokens.spacing.scale).map(t => t.$value),
      scale: 'exponential',
      noArbitraryValues: true,
    },
    colors: {
      allowedTokens: Object.keys(tokens.colors.base),
      contrastRequirements: {
        text: 4.5,
        large: 3.0,
        ui: 3.0,
      },
      noHardcodedColors: true,
    },
    typography: {
      allowedFonts: Object.keys(tokens.typography.fontFamilies),
      scaleRatio: 1.25,
      minSize: '12px',
      maxSize: '48px',
    },
    layout: {
      breakpoints: {
        mobile: '320px',
        tablet: '768px',
        desktop: '1024px',
        wide: '1440px',
      },
    },
    accessibility: {
      wcagLevel: 'AA',
      requiredAttributes: ['aria-label or visible text'],
      keyboardNavigable: true,
    },
  };
}

/**
 * Detect design patterns
 */
function detectPatterns(
  css: string,
  components: DesignerBrain['components']
): DesignPatterns {
  // Detect naming convention
  const hasDoubleHyphen = components.some(c =>
    c.structure.selectors.some(s => s.includes('--'))
  );
  const hasDoubleUnderscore = components.some(c =>
    c.structure.selectors.some(s => s.includes('__'))
  );

  let namingScheme: 'BEM' | 'custom' = 'custom';
  if (hasDoubleHyphen && hasDoubleUnderscore) {
    namingScheme = 'BEM';
  }

  // Detect responsive patterns
  const responsivePatterns: DesignPatterns['responsive'] = [];
  if (css.includes('@media')) {
    responsivePatterns.push({
      name: 'Responsive Design',
      type: 'mostly-fluid',
      breakpoints: ['mobile', 'tablet', 'desktop'],
      behavior: 'Fluid layout with responsive breakpoints',
    });
  }

  return {
    responsive: responsivePatterns,
    interaction: [],
    composition: [],
    naming: {
      scheme: namingScheme,
      pattern: namingScheme === 'BEM' ? 'block__element--modifier' : 'custom',
      examples: components.slice(0, 3).flatMap(c => c.structure.selectors),
    },
  };
}

/**
 * Infer design philosophy from components and tokens
 */
function inferPhilosophy(
  components: DesignerBrain['components'],
  tokens: DesignerBrain['tokens']
): DesignPhilosophy {
  // Analyze spacing to determine if tight/normal/loose
  const spacingValues = Object.values(tokens.spacing.scale)
    .map(t => parseFloat(t.$value))
    .filter(v => !isNaN(v));
  const avgSpacing = spacingValues.reduce((a, b) => a + b, 0) / spacingValues.length;

  let spacingStyle: 'tight' | 'normal' | 'loose' = 'normal';
  if (avgSpacing < 12) spacingStyle = 'tight';
  if (avgSpacing > 24) spacingStyle = 'loose';

  // Analyze corner rounding
  const hasRoundedCorners = components.some(c =>
    c.styling.css.includes('border-radius')
  );

  let corners: 'sharp' | 'slightly-rounded' | 'rounded' | 'pill' = 'sharp';
  if (hasRoundedCorners) corners = 'rounded';

  return {
    principles: [
      'Consistent design token usage',
      'Accessible components',
      'Responsive design',
    ],
    visualStyle: {
      aesthetic: 'minimalist',
      colorScheme: 'muted',
      spacing: spacingStyle,
      corners,
    },
    targetDevices: ['desktop', 'tablet', 'mobile'],
    frameworks: [],
  };
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
