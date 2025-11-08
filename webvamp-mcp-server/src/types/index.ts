/**
 * WebVamp MCP Design System Types
 *
 * These types represent the "Designer Brain" - the complete mental model
 * of a template's original designer, extracted and made AI-consultable.
 */

// ============================================================================
// DESIGNER BRAIN - Core Intelligence Model
// ============================================================================

/**
 * The complete designer intelligence extracted from a template
 * This IS the designer sitting next to you
 */
export interface DesignerBrain {
  metadata: TemplateMetadata;
  components: ComponentDNA[];
  tokens: DesignTokenBrain;
  relationships: ComponentRelationshipGraph;
  constraints: DesignConstraints;
  patterns: DesignPatterns;
  philosophy: DesignPhilosophy;
}

// ============================================================================
// TEMPLATE METADATA
// ============================================================================

export interface TemplateMetadata {
  name: string;
  version: string;
  author?: string;
  description?: string;
  sourceDirectory: string;
  ingestedAt: Date;
  fileCount: number;
  componentCount: number;
  tokenCount: number;
}

// ============================================================================
// COMPONENT DNA - Every component's complete genetic code
// ============================================================================

/**
 * Component DNA: Everything the AI needs to understand and replicate
 * a component in the designer's exact style
 */
export interface ComponentDNA {
  id: string;
  name: string;
  type: ComponentType;
  category: ComponentCategory;

  // Structure - What it's made of
  structure: {
    html: string;
    ast: HTMLNode;
    selectors: string[];
    semanticElements: string[];
  };

  // Styling - How it looks
  styling: {
    css: string;
    cssAST: CSSNode;
    appliedTokens: TokenUsage[];
    customProperties: Record<string, string>;
  };

  // Behavior - How it acts
  behavior?: {
    interactions: InteractionPattern[];
    states: ComponentState[];
    animations?: AnimationPattern[];
  };

  // Composition - How it relates to others
  composition: {
    allowedChildren: string[];
    allowedParents: string[];
    commonPairings: string[];
    invalidCombinations: string[];
  };

  // Variants - Different versions
  variants: ComponentVariant[];

  // Usage context - When/why to use it
  usageContext: {
    description: string;
    useCases: string[];
    examples: ComponentExample[];
    bestPractices: string[];
  };

  // Accessibility - How it's accessible
  accessibility: {
    role?: string;
    requiredAttributes: string[];
    keyboardNav: string[];
    screenReaderText?: string;
    contrastRatio?: number;
  };

  // Embedding for RAG
  embedding?: number[];
}

export type ComponentType =
  | 'button' | 'input' | 'card' | 'modal' | 'nav'
  | 'header' | 'footer' | 'form' | 'table' | 'list'
  | 'custom';

export type ComponentCategory =
  | 'actions' | 'inputs' | 'feedback' | 'layout'
  | 'navigation' | 'data-display' | 'content';

export interface ComponentVariant {
  name: string;
  modifierClass: string;
  tokenOverrides: TokenUsage[];
  description: string;
}

export interface ComponentExample {
  name: string;
  code: string;
  screenshot?: string;
  useCase: string;
}

export interface ComponentState {
  name: 'default' | 'hover' | 'focus' | 'active' | 'disabled' | 'loading';
  selector: string;
  styleChanges: Record<string, string>;
}

export interface InteractionPattern {
  trigger: 'click' | 'hover' | 'focus' | 'scroll' | 'keypress';
  effect: string;
  jsRequired: boolean;
}

export interface AnimationPattern {
  name: string;
  trigger: string;
  duration: string;
  easing: string;
  properties: string[];
}

// ============================================================================
// DESIGN TOKENS - The designer's visual language
// ============================================================================

/**
 * Design Token Brain: The designer's complete token philosophy
 * Following W3C DTCG specification
 */
export interface DesignTokenBrain {
  colors: ColorTokenSystem;
  spacing: SpacingTokenSystem;
  typography: TypographyTokenSystem;
  effects: EffectTokenSystem;
  semantic: SemanticTokenLayer;
}

export interface ColorTokenSystem {
  base: Record<string, DTCGToken<string>>;  // #0066FF
  semantic: Record<string, DTCGToken<string>>;  // {color.base.blue}
  component: Record<string, DTCGToken<string>>;  // {color.semantic.action.primary}
  themes: ThemeVariation[];
}

export interface SpacingTokenSystem {
  scale: Record<string, DTCGToken<string>>;  // xs: 4px, sm: 8px, md: 16px
  component: Record<string, DTCGToken<string>>;  // button.padding: {spacing.md}
}

export interface TypographyTokenSystem {
  fontFamilies: Record<string, DTCGToken<string>>;
  fontSizes: Record<string, DTCGToken<string>>;
  fontWeights: Record<string, DTCGToken<number>>;
  lineHeights: Record<string, DTCGToken<string>>;
  letterSpacing: Record<string, DTCGToken<string>>;
  scales: TypographyScale[];
}

export interface EffectTokenSystem {
  shadows: Record<string, DTCGToken<string>>;
  borders: Record<string, DTCGToken<string>>;
  borderRadius: Record<string, DTCGToken<string>>;
  opacity: Record<string, DTCGToken<number>>;
}

export interface SemanticTokenLayer {
  action: Record<string, string>;  // primary, secondary, destructive
  feedback: Record<string, string>;  // success, warning, error
  surface: Record<string, string>;  // background, foreground, overlay
}

export interface ThemeVariation {
  name: 'light' | 'dark' | 'high-contrast' | string;
  tokens: Record<string, string>;
}

export interface TypographyScale {
  name: string;
  baseSize: string;
  ratio: number;
  steps: Record<string, string>;
}

/**
 * W3C DTCG Token Format
 */
export interface DTCGToken<T> {
  $value: T;
  $type: DTCGTokenType;
  $description?: string;
  $extensions?: Record<string, unknown>;
}

export type DTCGTokenType =
  | 'color' | 'dimension' | 'fontFamily' | 'fontWeight'
  | 'duration' | 'cubicBezier' | 'number' | 'string';

export interface TokenUsage {
  property: string;  // 'background-color'
  tokenPath: string;  // 'color.action.primary'
  resolvedValue: string;  // '#0066FF'
  isCustom: boolean;  // true if not from design system
}

// ============================================================================
// COMPONENT RELATIONSHIPS - How components work together
// ============================================================================

export interface ComponentRelationshipGraph {
  nodes: ComponentNode[];
  edges: ComponentRelationship[];
  hierarchies: ComponentHierarchy[];
  commonPatterns: CompositionPattern[];
}

export interface ComponentNode {
  componentId: string;
  depth: number;
  frequency: number;  // How often used
  importance: number;  // 0-1 priority score
}

export interface ComponentRelationship {
  parent: string;
  child: string;
  type: 'contains' | 'uses' | 'requires' | 'suggests';
  frequency: number;
  constraints?: string[];
}

export interface ComponentHierarchy {
  root: string;
  levels: string[][];
}

export interface CompositionPattern {
  name: string;
  components: string[];
  description: string;
  frequency: number;
  examples: string[];
}

// ============================================================================
// DESIGN CONSTRAINTS - The designer's rules
// ============================================================================

export interface DesignConstraints {
  spacing: {
    allowedValues: string[];
    scale: 'linear' | 'exponential' | 'fibonacci';
    noArbitraryValues: boolean;
  };
  colors: {
    allowedTokens: string[];
    contrastRequirements: {
      text: number;  // 4.5:1 minimum
      large: number;  // 3:1 minimum
      ui: number;  // 3:1 minimum
    };
    noHardcodedColors: boolean;
  };
  typography: {
    allowedFonts: string[];
    scaleRatio: number;
    minSize: string;
    maxSize: string;
  };
  layout: {
    gridSystem?: {
      columns: number;
      gutter: string;
      margin: string;
    };
    breakpoints: Record<string, string>;
    maxWidth?: string;
  };
  accessibility: {
    wcagLevel: 'A' | 'AA' | 'AAA';
    requiredAttributes: string[];
    keyboardNavigable: boolean;
  };
}

// ============================================================================
// DESIGN PATTERNS - Recurring solutions
// ============================================================================

export interface DesignPatterns {
  responsive: ResponsivePattern[];
  interaction: InteractionPattern[];
  composition: CompositionPattern[];
  naming: NamingConvention;
}

export interface ResponsivePattern {
  name: string;
  type: 'mostly-fluid' | 'column-drop' | 'layout-shifter' | 'tiny-tweaks' | 'off-canvas';
  breakpoints: string[];
  behavior: string;
}

export interface NamingConvention {
  scheme: 'BEM' | 'OOCSS' | 'SMACSS' | 'atomic' | 'custom';
  pattern: string;
  examples: string[];
}

// ============================================================================
// DESIGN PHILOSOPHY - The designer's thinking
// ============================================================================

export interface DesignPhilosophy {
  principles: string[];
  visualStyle: {
    aesthetic: 'minimalist' | 'material' | 'neumorphic' | 'glassmorphic' | 'brutalist' | 'custom';
    colorScheme: 'vibrant' | 'muted' | 'monochrome' | 'colorful';
    spacing: 'tight' | 'normal' | 'loose';
    corners: 'sharp' | 'slightly-rounded' | 'rounded' | 'pill';
  };
  targetDevices: ('desktop' | 'tablet' | 'mobile')[];
  frameworks: string[];
}

// ============================================================================
// AST NODES - Parsed HTML/CSS structures
// ============================================================================

export interface HTMLNode {
  tag: string;
  attrs?: Record<string, string>;
  content?: (string | HTMLNode)[];
}

export interface CSSNode {
  type: string;
  selector?: string;
  declarations?: Declaration[];
  rules?: CSSNode[];
}

export interface Declaration {
  property: string;
  value: string;
  important: boolean;
}

// ============================================================================
// MCP SERVER TYPES - What AI can request
// ============================================================================

export interface ComponentSearchQuery {
  semanticQuery?: string;
  type?: ComponentType;
  category?: ComponentCategory;
  requiredTokens?: string[];
  limit?: number;
}

export interface ComponentGenerationRequest {
  componentType: ComponentType;
  description: string;
  variant?: string;
  tokens?: Record<string, string>;
  constraints?: Partial<DesignConstraints>;
}

export interface ComponentValidationRequest {
  html: string;
  css: string;
  componentType?: ComponentType;
}

export interface ComponentValidationResult {
  valid: boolean;
  score: number;  // 0-100
  issues: ValidationIssue[];
  suggestions: string[];
  aestheticMatch: number;  // 0-1, how well it matches the template style
}

export interface ValidationIssue {
  type: 'token' | 'structure' | 'accessibility' | 'naming' | 'constraint';
  severity: 'error' | 'warning' | 'info';
  message: string;
  location?: string;
  fix?: string;
}

// ============================================================================
// RAG SYSTEM TYPES
// ============================================================================

export interface ComponentEmbedding {
  componentId: string;
  embedding: number[];
  metadata: {
    type: ComponentType;
    category: ComponentCategory;
    tokens: string[];
    description: string;
  };
}

export interface RetrievalResult {
  component: ComponentDNA;
  similarity: number;
  reason: string;
}
