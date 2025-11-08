/**
 * Component DNA Extractor
 *
 * This is the core engine that extracts "Designer DNA" from any web template.
 * It uses AST parsing (PostCSS, PostHTML, CSS Tree) to understand components
 * at a structural level, not just as text.
 *
 * Think of this as reverse-engineering the designer's brain from their code.
 */

import postcss, { Root as PostCSSRoot, Rule, Declaration as PostCSSDeclaration } from 'postcss';
import selectorParser from 'postcss-selector-parser';
// @ts-ignore - no types available
import * as csstree from 'css-tree';
import { parser as posthtmlParser } from 'posthtml-parser';
import type {
  ComponentDNA,
  ComponentType,
  ComponentCategory,
  HTMLNode,
  CSSNode,
  ComponentVariant,
  ComponentState,
  TokenUsage,
  InteractionPattern,
  Declaration,
} from '../types/index.js';

export class ComponentExtractor {
  /**
   * Extract components from HTML and CSS
   * Returns the complete "DNA" of each component
   */
  async extractComponents(
    html: string,
    css: string
  ): Promise<ComponentDNA[]> {
    console.error('🧬 Extracting Component DNA...');

    // Parse HTML and CSS into ASTs
    const htmlAST = this.parseHTML(html);
    const cssAST = this.parseCSS(css);

    // Build selector → element mapping
    const selectorMap = this.buildSelectorMap(htmlAST, cssAST);

    // Identify component boundaries
    const componentCandidates = this.identifyComponents(htmlAST, selectorMap);

    // Extract complete DNA for each component
    const components: ComponentDNA[] = [];
    for (const candidate of componentCandidates) {
      const dna = await this.extractComponentDNA(
        candidate,
        htmlAST,
        cssAST,
        selectorMap
      );
      if (dna) {
        components.push(dna);
      }
    }

    console.error(`✅ Extracted ${components.length} components`);
    return components;
  }

  /**
   * Parse HTML into AST using PostHTML
   */
  private parseHTML(html: string): HTMLNode[] {
    return posthtmlParser(html) as HTMLNode[];
  }

  /**
   * Parse CSS into AST using PostCSS
   */
  private parseCSS(css: string): PostCSSRoot {
    return postcss.parse(css);
  }

  /**
   * Build mapping of CSS selectors to HTML elements
   */
  private buildSelectorMap(
    htmlAST: HTMLNode[],
    cssAST: PostCSSRoot
  ): Map<string, { elements: HTMLNode[]; declarations: Declaration[] }> {
    const selectorMap = new Map();

    cssAST.walkRules((rule: Rule) => {
      const elements = this.querySelectorFromAST(htmlAST, rule.selector);
      const declarations: Declaration[] = [];

      rule.walkDecls((decl) => {
        declarations.push({
          property: decl.prop,
          value: decl.value,
          important: decl.important,
        });
      });

      selectorMap.set(rule.selector, { elements, declarations });
    });

    return selectorMap;
  }

  /**
   * Find HTML elements matching a CSS selector
   */
  private querySelectorFromAST(
    nodes: (HTMLNode | string)[],
    selector: string
  ): HTMLNode[] {
    const matches: HTMLNode[] = [];

    const traverse = (node: HTMLNode | string) => {
      if (typeof node === 'string') return;

      // Simple matching - enhance this with full CSS selector matching
      if (this.matchesSelector(node, selector)) {
        matches.push(node);
      }

      if (node.content) {
        for (const child of node.content) {
          traverse(child);
        }
      }
    };

    for (const node of nodes) {
      traverse(node);
    }

    return matches;
  }

  /**
   * Check if node matches selector (simplified)
   */
  private matchesSelector(node: HTMLNode, selector: string): boolean {
    // Class selector
    if (selector.startsWith('.')) {
      const className = selector.slice(1);
      const classes = node.attrs?.class?.split(' ') || [];
      return classes.includes(className);
    }

    // ID selector
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      return node.attrs?.id === id;
    }

    // Tag selector
    return node.tag === selector;
  }

  /**
   * Identify component boundaries in HTML
   */
  private identifyComponents(
    htmlAST: HTMLNode[],
    selectorMap: Map<string, any>
  ): ComponentCandidate[] {
    const candidates: ComponentCandidate[] = [];

    const traverse = (node: HTMLNode | string, depth: number = 0) => {
      if (typeof node === 'string') return;

      if (this.isComponentCandidate(node)) {
        candidates.push({
          node,
          depth,
          type: this.inferComponentType(node),
          category: this.inferComponentCategory(node),
        });
      }

      if (node.content) {
        for (const child of node.content) {
          traverse(child, depth + 1);
        }
      }
    };

    for (const node of htmlAST) {
      traverse(node);
    }

    return candidates;
  }

  /**
   * Determine if node is a component candidate
   */
  private isComponentCandidate(node: HTMLNode): boolean {
    // Has classes = likely a component
    if (node.attrs?.class) return true;

    // Semantic elements are components
    const semanticElements = [
      'header', 'nav', 'main', 'article', 'section', 'aside', 'footer',
      'button', 'form', 'table', 'figure', 'dialog'
    ];
    if (semanticElements.includes(node.tag)) return true;

    // Has ARIA role = likely a component
    if (node.attrs?.role) return true;

    return false;
  }

  /**
   * Infer component type from HTML structure
   */
  private inferComponentType(node: HTMLNode): ComponentType {
    const tag = node.tag;
    const classes = node.attrs?.class?.toLowerCase() || '';
    const role = node.attrs?.role;

    // Button detection
    if (tag === 'button' || role === 'button' || classes.includes('btn')) {
      return 'button';
    }

    // Input detection
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      return 'input';
    }

    // Card detection
    if (classes.includes('card') || classes.includes('panel')) {
      return 'card';
    }

    // Modal detection
    if (role === 'dialog' || classes.includes('modal')) {
      return 'modal';
    }

    // Navigation detection
    if (tag === 'nav' || role === 'navigation') {
      return 'nav';
    }

    // Header/Footer
    if (tag === 'header') return 'header';
    if (tag === 'footer') return 'footer';

    // Form
    if (tag === 'form') return 'form';

    // Table
    if (tag === 'table') return 'table';

    // List
    if (tag === 'ul' || tag === 'ol') return 'list';

    return 'custom';
  }

  /**
   * Infer component category
   */
  private inferComponentCategory(node: HTMLNode): ComponentCategory {
    const type = this.inferComponentType(node);

    const categoryMap: Record<string, ComponentCategory> = {
      button: 'actions',
      input: 'inputs',
      card: 'content',
      modal: 'feedback',
      nav: 'navigation',
      header: 'layout',
      footer: 'layout',
      form: 'inputs',
      table: 'data-display',
      list: 'data-display',
    };

    return categoryMap[type] || 'content';
  }

  /**
   * Extract complete DNA for a component
   */
  private async extractComponentDNA(
    candidate: ComponentCandidate,
    htmlAST: HTMLNode[],
    cssAST: PostCSSRoot,
    selectorMap: Map<string, any>
  ): Promise<ComponentDNA | null> {
    const { node, type, category } = candidate;
    const name = this.extractComponentName(node);

    // Extract relevant CSS for this component
    const relevantCSS = this.extractRelevantCSS(node, cssAST);

    // Detect variants (e.g., .btn--primary, .btn--large)
    const variants = this.detectVariants(node, cssAST);

    // Detect states (hover, focus, active, etc.)
    const states = this.detectStates(node, cssAST);

    // Extract token usage
    const tokenUsage = this.extractTokenUsage(relevantCSS);

    // Detect interactions
    const interactions = this.detectInteractions(node, relevantCSS);

    // Generate component ID
    const id = `${type}-${name}-${Date.now()}`;

    const dna: ComponentDNA = {
      id,
      name,
      type,
      category,
      structure: {
        html: this.nodeToHTML(node),
        ast: node,
        selectors: this.extractSelectors(node),
        semanticElements: this.extractSemanticElements(node),
      },
      styling: {
        css: relevantCSS,
        cssAST: this.parseCSS(relevantCSS).toJSON() as CSSNode,
        appliedTokens: tokenUsage,
        customProperties: this.extractCustomProperties(relevantCSS),
      },
      behavior: interactions.length > 0 ? {
        interactions,
        states,
      } : undefined,
      composition: {
        allowedChildren: this.inferAllowedChildren(node),
        allowedParents: ['*'], // Will be refined by relationship analysis
        commonPairings: [],
        invalidCombinations: [],
      },
      variants,
      usageContext: {
        description: `${type} component`,
        useCases: this.inferUseCases(type),
        examples: [{
          name: `Basic ${name}`,
          code: this.nodeToHTML(node),
          useCase: `Standard ${type} usage`,
        }],
        bestPractices: [],
      },
      accessibility: this.extractAccessibility(node),
    };

    return dna;
  }

  /**
   * Extract component name from node
   */
  private extractComponentName(node: HTMLNode): string {
    const classes = node.attrs?.class?.split(' ') || [];
    const baseClass = classes[0] || node.tag;

    // Remove BEM modifiers to get base name
    return baseClass.split('--')[0].split('__')[0];
  }

  /**
   * Extract CSS relevant to this component
   */
  private extractRelevantCSS(node: HTMLNode, cssAST: PostCSSRoot): string {
    const selectors = this.extractSelectors(node);
    let relevantCSS = '';

    cssAST.walkRules((rule: Rule) => {
      // Check if rule applies to this component
      for (const selector of selectors) {
        if (rule.selector.includes(selector)) {
          relevantCSS += rule.toString() + '\n';
          break;
        }
      }
    });

    return relevantCSS;
  }

  /**
   * Extract all selectors for a node
   */
  private extractSelectors(node: HTMLNode): string[] {
    const selectors: string[] = [];

    // Class selectors
    const classes = node.attrs?.class?.split(' ') || [];
    for (const cls of classes) {
      selectors.push(`.${cls}`);
    }

    // ID selector
    if (node.attrs?.id) {
      selectors.push(`#${node.attrs.id}`);
    }

    // Tag selector
    selectors.push(node.tag);

    return selectors;
  }

  /**
   * Detect component variants (BEM modifiers, utility classes)
   */
  private detectVariants(node: HTMLNode, cssAST: PostCSSRoot): ComponentVariant[] {
    const classes = node.attrs?.class?.split(' ') || [];
    const baseClass = classes[0];
    if (!baseClass) return [];

    const variants: ComponentVariant[] = [];

    // Find BEM modifiers: .button--primary
    for (const cls of classes) {
      if (cls.startsWith(baseClass + '--')) {
        const variantName = cls.replace(baseClass + '--', '');
        variants.push({
          name: variantName,
          modifierClass: cls,
          tokenOverrides: [],
          description: `${variantName} variant`,
        });
      }
    }

    return variants;
  }

  /**
   * Detect component states (hover, focus, active)
   */
  private detectStates(node: HTMLNode, cssAST: PostCSSRoot): ComponentState[] {
    const states: ComponentState[] = [];
    const selectors = this.extractSelectors(node);

    cssAST.walkRules((rule: Rule) => {
      for (const selector of selectors) {
        if (rule.selector.includes(selector)) {
          // Check for pseudo-classes
          if (rule.selector.includes(':hover')) {
            states.push({
              name: 'hover',
              selector: rule.selector,
              styleChanges: this.extractStyleChanges(rule),
            });
          }
          if (rule.selector.includes(':focus')) {
            states.push({
              name: 'focus',
              selector: rule.selector,
              styleChanges: this.extractStyleChanges(rule),
            });
          }
          if (rule.selector.includes(':active')) {
            states.push({
              name: 'active',
              selector: rule.selector,
              styleChanges: this.extractStyleChanges(rule),
            });
          }
          if (rule.selector.includes(':disabled')) {
            states.push({
              name: 'disabled',
              selector: rule.selector,
              styleChanges: this.extractStyleChanges(rule),
            });
          }
        }
      }
    });

    return states;
  }

  /**
   * Extract style changes from a CSS rule
   */
  private extractStyleChanges(rule: Rule): Record<string, string> {
    const changes: Record<string, string> = {};
    rule.walkDecls((decl) => {
      changes[decl.prop] = decl.value;
    });
    return changes;
  }

  /**
   * Extract token usage from CSS
   */
  private extractTokenUsage(css: string): TokenUsage[] {
    const usage: TokenUsage[] = [];
    const ast = this.parseCSS(css);

    ast.walkDecls((decl) => {
      // Check for CSS custom properties (variables)
      if (decl.value.includes('var(--')) {
        const match = decl.value.match(/var\((--[^)]+)\)/);
        if (match) {
          usage.push({
            property: decl.prop,
            tokenPath: match[1],
            resolvedValue: decl.value,
            isCustom: false,
          });
        }
      } else {
        // Hard-coded value (not a token)
        usage.push({
          property: decl.prop,
          tokenPath: '',
          resolvedValue: decl.value,
          isCustom: true,
        });
      }
    });

    return usage;
  }

  /**
   * Extract custom properties (CSS variables)
   */
  private extractCustomProperties(css: string): Record<string, string> {
    const props: Record<string, string> = {};
    const ast = this.parseCSS(css);

    ast.walkDecls((decl) => {
      if (decl.prop.startsWith('--')) {
        props[decl.prop] = decl.value;
      }
    });

    return props;
  }

  /**
   * Detect interaction patterns
   */
  private detectInteractions(node: HTMLNode, css: string): InteractionPattern[] {
    const interactions: InteractionPattern[] = [];

    // Check for hover interactions in CSS
    if (css.includes(':hover')) {
      interactions.push({
        trigger: 'hover',
        effect: 'style change',
        jsRequired: false,
      });
    }

    // Check for focus interactions
    if (css.includes(':focus')) {
      interactions.push({
        trigger: 'focus',
        effect: 'style change',
        jsRequired: false,
      });
    }

    // Check for transitions/animations
    if (css.includes('transition') || css.includes('animation')) {
      interactions.push({
        trigger: 'hover',
        effect: 'animated transition',
        jsRequired: false,
      });
    }

    return interactions;
  }

  /**
   * Extract semantic HTML elements used
   */
  private extractSemanticElements(node: HTMLNode): string[] {
    const elements: string[] = [];
    const semanticTags = [
      'header', 'nav', 'main', 'article', 'section', 'aside', 'footer',
      'button', 'a', 'form', 'input', 'label', 'figure', 'figcaption'
    ];

    const traverse = (n: HTMLNode | string) => {
      if (typeof n === 'string') return;
      if (semanticTags.includes(n.tag)) {
        elements.push(n.tag);
      }
      if (n.content) {
        for (const child of n.content) {
          traverse(child);
        }
      }
    };

    traverse(node);
    return [...new Set(elements)];
  }

  /**
   * Infer allowed children based on component type
   */
  private inferAllowedChildren(node: HTMLNode): string[] {
    const type = this.inferComponentType(node);

    const allowedChildrenMap: Record<string, string[]> = {
      button: ['span', 'svg', 'icon'],
      card: ['heading', 'paragraph', 'image', 'button', 'link'],
      nav: ['list', 'link', 'button'],
      form: ['input', 'button', 'label', 'select'],
      table: ['thead', 'tbody', 'tr', 'td', 'th'],
      list: ['li'],
    };

    return allowedChildrenMap[type] || ['*'];
  }

  /**
   * Infer use cases based on component type
   */
  private inferUseCases(type: ComponentType): string[] {
    const useCaseMap: Record<string, string[]> = {
      button: ['Form submission', 'Primary action', 'Secondary action', 'Navigation'],
      input: ['Form data entry', 'Search', 'Filter'],
      card: ['Content preview', 'Product display', 'Feature highlight'],
      modal: ['User confirmation', 'Data entry', 'Notifications'],
      nav: ['Primary navigation', 'Secondary navigation', 'Breadcrumbs'],
    };

    return useCaseMap[type] || ['General purpose'];
  }

  /**
   * Extract accessibility information
   */
  private extractAccessibility(node: HTMLNode): ComponentDNA['accessibility'] {
    return {
      role: node.attrs?.role,
      requiredAttributes: this.getRequiredA11yAttributes(node),
      keyboardNav: this.getKeyboardNav(node),
      screenReaderText: node.attrs?.['aria-label'],
    };
  }

  /**
   * Get required accessibility attributes for a node
   */
  private getRequiredA11yAttributes(node: HTMLNode): string[] {
    const type = this.inferComponentType(node);
    const attrMap: Record<string, string[]> = {
      button: ['aria-label or visible text'],
      input: ['aria-label or associated label', 'aria-required'],
      modal: ['aria-modal', 'aria-labelledby'],
      nav: ['aria-label'],
    };

    return attrMap[type] || [];
  }

  /**
   * Get keyboard navigation for component
   */
  private getKeyboardNav(node: HTMLNode): string[] {
    const type = this.inferComponentType(node);
    const navMap: Record<string, string[]> = {
      button: ['Enter', 'Space'],
      input: ['Tab', 'Arrow keys'],
      modal: ['Escape', 'Tab'],
      nav: ['Arrow keys', 'Tab'],
    };

    return navMap[type] || ['Tab'];
  }

  /**
   * Convert HTMLNode to HTML string
   */
  private nodeToHTML(node: HTMLNode): string {
    let html = `<${node.tag}`;

    if (node.attrs) {
      for (const [key, value] of Object.entries(node.attrs)) {
        html += ` ${key}="${value}"`;
      }
    }

    html += '>';

    if (node.content) {
      for (const child of node.content) {
        if (typeof child === 'string') {
          html += child;
        } else {
          html += this.nodeToHTML(child);
        }
      }
    }

    html += `</${node.tag}>`;
    return html;
  }
}

interface ComponentCandidate {
  node: HTMLNode;
  depth: number;
  type: ComponentType;
  category: ComponentCategory;
}
