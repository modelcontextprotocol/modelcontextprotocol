/**
 * Design Token Brain Extractor
 *
 * This extracts the designer's complete "token philosophy" from CSS:
 * - Color systems (base → semantic → component)
 * - Spacing scales
 * - Typography scales
 * - Effects (shadows, borders, radii)
 *
 * Outputs W3C DTCG-compliant design tokens
 */

import postcss, { Root as PostCSSRoot } from 'postcss';
import type {
  DesignTokenBrain,
  ColorTokenSystem,
  SpacingTokenSystem,
  TypographyTokenSystem,
  EffectTokenSystem,
  DTCGToken,
} from '../types/index.js';

export class TokenExtractor {
  /**
   * Extract complete design token brain from CSS
   */
  async extractTokens(css: string): Promise<DesignTokenBrain> {
    console.error('🎨 Extracting Design Token Brain...');

    const ast = postcss.parse(css);

    const colors = await this.extractColors(ast);
    const spacing = await this.extractSpacing(ast);
    const typography = await this.extractTypography(ast);
    const effects = await this.extractEffects(ast);

    const brain: DesignTokenBrain = {
      colors,
      spacing,
      typography,
      effects,
      semantic: this.buildSemanticLayer(colors, spacing),
    };

    console.error('✅ Token extraction complete');
    return brain;
  }

  /**
   * Extract color system
   */
  private async extractColors(ast: PostCSSRoot): Promise<ColorTokenSystem> {
    const base: Record<string, DTCGToken<string>> = {};
    const semantic: Record<string, DTCGToken<string>> = {};
    const component: Record<string, DTCGToken<string>> = {};

    // Extract CSS custom properties (variables)
    ast.walkRules((rule) => {
      if (rule.selector === ':root') {
        rule.walkDecls((decl) => {
          if (decl.prop.startsWith('--color') || decl.prop.startsWith('--')) {
            const name = decl.prop.replace('--', '');
            const value = decl.value;

            // Categorize: base, semantic, or component
            if (this.isColorValue(value)) {
              if (name.includes('primary') || name.includes('secondary')) {
                semantic[name] = this.createDTCGToken(value, 'color');
              } else if (name.includes('button') || name.includes('card')) {
                component[name] = this.createDTCGToken(value, 'color');
              } else {
                base[name] = this.createDTCGToken(value, 'color');
              }
            }
          }
        });
      }
    });

    // Extract colors from declarations
    ast.walkDecls((decl) => {
      if (this.isColorProperty(decl.prop)) {
        const value = decl.value;
        if (this.isColorValue(value) && !value.includes('var(')) {
          // Hard-coded color - add to base with auto-generated name
          const colorName = this.generateColorName(value);
          base[colorName] = this.createDTCGToken(value, 'color');
        }
      }
    });

    return {
      base,
      semantic,
      component,
      themes: [
        {
          name: 'light',
          tokens: this.flattenTokens(base),
        },
      ],
    };
  }

  /**
   * Extract spacing system
   */
  private async extractSpacing(ast: PostCSSRoot): Promise<SpacingTokenSystem> {
    const scale: Record<string, DTCGToken<string>> = {};
    const component: Record<string, DTCGToken<string>> = {};

    const spacingValues: Record<string, number> = {};

    // Extract all spacing values
    ast.walkDecls((decl) => {
      if (this.isSpacingProperty(decl.prop)) {
        const value = decl.value;
        const numbers = this.extractNumbers(value);

        for (const num of numbers) {
          spacingValues[num] = (spacingValues[num] || 0) + 1;
        }
      }
    });

    // Build scale from most common values
    const sortedValues = Object.entries(spacingValues)
      .sort((a, b) => b[1] - a[1])
      .map(([val]) => val);

    // Create scale (xs, sm, md, lg, xl)
    const scaleNames = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];
    sortedValues.slice(0, 6).forEach((value, index) => {
      if (index < scaleNames.length) {
        scale[scaleNames[index]] = this.createDTCGToken(value, 'dimension');
      }
    });

    return { scale, component };
  }

  /**
   * Extract typography system
   */
  private async extractTypography(ast: PostCSSRoot): Promise<TypographyTokenSystem> {
    const fontFamilies: Record<string, DTCGToken<string>> = {};
    const fontSizes: Record<string, DTCGToken<string>> = {};
    const fontWeights: Record<string, DTCGToken<number>> = {};
    const lineHeights: Record<string, DTCGToken<string>> = {};
    const letterSpacing: Record<string, DTCGToken<string>> = {};

    const sizes: Set<string> = new Set();
    const weights: Set<number> = new Set();

    ast.walkDecls((decl) => {
      switch (decl.prop) {
        case 'font-family':
          const familyName = this.cleanFontFamily(decl.value);
          if (!fontFamilies[familyName]) {
            fontFamilies[familyName] = this.createDTCGToken(decl.value, 'fontFamily');
          }
          break;

        case 'font-size':
          sizes.add(decl.value);
          break;

        case 'font-weight':
          const weight = parseInt(decl.value) || this.namedWeightToNumber(decl.value);
          if (weight) weights.add(weight);
          break;

        case 'line-height':
          if (!lineHeights[decl.value]) {
            lineHeights[decl.value] = this.createDTCGToken(decl.value, 'dimension');
          }
          break;

        case 'letter-spacing':
          if (!letterSpacing[decl.value]) {
            letterSpacing[decl.value] = this.createDTCGToken(decl.value, 'dimension');
          }
          break;
      }
    });

    // Build font size scale
    const sortedSizes = Array.from(sizes).sort((a, b) => {
      return this.parseSize(a) - this.parseSize(b);
    });

    sortedSizes.forEach((size, index) => {
      fontSizes[`size-${index + 1}`] = this.createDTCGToken(size, 'dimension');
    });

    // Build font weight scale
    Array.from(weights).sort().forEach((weight) => {
      const name = this.weightNumberToName(weight);
      fontWeights[name] = this.createDTCGToken(weight, 'fontWeight');
    });

    return {
      fontFamilies,
      fontSizes,
      fontWeights,
      lineHeights,
      letterSpacing,
      scales: [],
    };
  }

  /**
   * Extract effects (shadows, borders, radii)
   */
  private async extractEffects(ast: PostCSSRoot): Promise<EffectTokenSystem> {
    const shadows: Record<string, DTCGToken<string>> = {};
    const borders: Record<string, DTCGToken<string>> = {};
    const borderRadius: Record<string, DTCGToken<string>> = {};
    const opacity: Record<string, DTCGToken<number>> = {};

    ast.walkDecls((decl) => {
      switch (decl.prop) {
        case 'box-shadow':
          if (!shadows[decl.value]) {
            shadows[`shadow-${Object.keys(shadows).length + 1}`] =
              this.createDTCGToken(decl.value, 'string');
          }
          break;

        case 'border':
        case 'border-top':
        case 'border-right':
        case 'border-bottom':
        case 'border-left':
          if (!borders[decl.value]) {
            borders[`border-${Object.keys(borders).length + 1}`] =
              this.createDTCGToken(decl.value, 'string');
          }
          break;

        case 'border-radius':
          if (!borderRadius[decl.value]) {
            borderRadius[decl.value] = this.createDTCGToken(decl.value, 'dimension');
          }
          break;

        case 'opacity':
          const opacityValue = parseFloat(decl.value);
          if (!isNaN(opacityValue)) {
            opacity[decl.value] = this.createDTCGToken(opacityValue, 'number');
          }
          break;
      }
    });

    return { shadows, borders, borderRadius, opacity };
  }

  /**
   * Build semantic token layer
   */
  private buildSemanticLayer(
    colors: ColorTokenSystem,
    spacing: SpacingTokenSystem
  ): DesignTokenBrain['semantic'] {
    return {
      action: {},
      feedback: {},
      surface: {},
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private createDTCGToken<T>(value: T, type: string): DTCGToken<T> {
    return {
      $value: value,
      $type: type as any,
    };
  }

  private isColorProperty(prop: string): boolean {
    return [
      'color',
      'background-color',
      'border-color',
      'outline-color',
      'fill',
      'stroke',
    ].includes(prop);
  }

  private isColorValue(value: string): boolean {
    return (
      value.startsWith('#') ||
      value.startsWith('rgb') ||
      value.startsWith('hsl') ||
      value.startsWith('oklch') ||
      this.isNamedColor(value)
    );
  }

  private isNamedColor(value: string): boolean {
    const namedColors = [
      'black', 'white', 'red', 'green', 'blue', 'yellow', 'orange', 'purple',
      'pink', 'gray', 'transparent', 'currentColor'
    ];
    return namedColors.includes(value);
  }

  private generateColorName(value: string): string {
    // Generate semantic name from color value
    if (value.startsWith('#')) {
      return `hex-${value.slice(1)}`;
    }
    return value.replace(/[(),%\s]/g, '-');
  }

  private isSpacingProperty(prop: string): boolean {
    return [
      'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
      'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
      'gap', 'row-gap', 'column-gap',
    ].includes(prop);
  }

  private extractNumbers(value: string): string[] {
    const matches = value.match(/\d+(\.\d+)?(px|rem|em|%)?/g);
    return matches || [];
  }

  private cleanFontFamily(value: string): string {
    return value.split(',')[0].replace(/['"]/g, '').trim();
  }

  private namedWeightToNumber(name: string): number {
    const map: Record<string, number> = {
      thin: 100,
      extralight: 200,
      light: 300,
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      extrabold: 800,
      black: 900,
    };
    return map[name.toLowerCase()] || 400;
  }

  private weightNumberToName(weight: number): string {
    const map: Record<number, string> = {
      100: 'thin',
      200: 'extralight',
      300: 'light',
      400: 'normal',
      500: 'medium',
      600: 'semibold',
      700: 'bold',
      800: 'extrabold',
      900: 'black',
    };
    return map[weight] || `weight-${weight}`;
  }

  private parseSize(size: string): number {
    const num = parseFloat(size);
    if (size.endsWith('rem')) return num * 16;
    if (size.endsWith('em')) return num * 16;
    return num;
  }

  private flattenTokens(tokens: Record<string, DTCGToken<any>>): Record<string, string> {
    const flattened: Record<string, string> = {};
    for (const [key, token] of Object.entries(tokens)) {
      flattened[key] = String(token.$value);
    }
    return flattened;
  }
}
