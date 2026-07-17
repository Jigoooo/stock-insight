export const requiredSemanticTokens = [
  '--color-canvas',
  '--color-surface',
  '--color-surface-subtle',
  '--color-surface-muted',
  '--color-chrome',
  '--color-chrome-raised',
  '--color-on-chrome',
  '--color-on-chrome-secondary',
  '--color-on-chrome-tertiary',
  '--color-text-primary',
  '--color-text-secondary',
  '--color-text-tertiary',
  '--color-border',
  '--color-border-strong',
  '--color-accent',
  '--color-accent-strong',
  '--color-accent-soft',
  '--color-on-accent',
  '--color-positive',
  '--color-positive-soft',
  '--color-signal',
  '--color-signal-soft',
  '--color-copper',
  '--color-risk',
  '--color-risk-soft',
  '--color-focus',
  '--surface-auth-background',
  '--surface-topbar-background',
  '--surface-inspector-background',
  '--surface-border-color',
  '--shadow-panel',
  '--shadow-hover',
  '--shadow-raised',
  '--radius-xs',
  '--radius-sm',
  '--radius-md',
  '--radius-lg',
  '--radius-control',
  '--radius-panel',
  '--radius-auth',
  '--duration-press',
  '--duration-fast',
  '--duration-base',
  '--ease-out',
  '--ease-standard',
  '--ease-material',
] as const;

export type RequiredSemanticToken = (typeof requiredSemanticTokens)[number];

export interface DesignProfileMetadata {
  id: string;
  label: string;
  cssHref: string;
  colorSchemes: readonly ('light' | 'dark')[];
  themeColors: Readonly<{
    light: string;
    dark: string;
  }>;
}

export const activeDesignProfile = {
  id: 'calm-market',
  label: 'Calm Market Lens',
  cssHref: '/styles/profiles/calm-market.css',
  colorSchemes: ['light', 'dark'],
  themeColors: {
    light: '#f3f6fa',
    dark: '#070c14',
  },
} as const satisfies DesignProfileMetadata;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findTopLevelRootBlock(source: string) {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const rootPattern = /:root\s*\{/g;
  for (const match of css.matchAll(rootPattern)) {
    const start = match.index ?? 0;
    let outerDepth = 0;
    for (const character of css.slice(0, start)) {
      if (character === '{') outerDepth += 1;
      else if (character === '}') outerDepth -= 1;
    }
    if (outerDepth !== 0) continue;

    const openBrace = css.indexOf('{', start);
    let blockDepth = 0;
    for (let index = openBrace; index < css.length; index += 1) {
      if (css[index] === '{') blockDepth += 1;
      else if (css[index] === '}') blockDepth -= 1;
      if (blockDepth === 0) return css.slice(openBrace + 1, index);
    }
  }
  return '';
}

export function inspectDesignProfileSource(source: string) {
  const baseRootBlock = findTopLevelRootBlock(source);
  const missingTokens = requiredSemanticTokens.filter(
    (token) => !new RegExp(`${escapeRegExp(token)}\\s*:`).test(baseRootBlock),
  );

  return {
    missingTokens,
    hasDarkScheme: /@media\s*\(prefers-color-scheme:\s*dark\)/.test(source),
  };
}
