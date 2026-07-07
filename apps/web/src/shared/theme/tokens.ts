export const brand = {
  name: 'Futur Insight',
  tagline: 'Research terminal',
};

export const colorTokens = {
  ink: '#f4f7fb',
  inkSoft: '#c6ced8',
  graphite: '#0a0d12',
  graphiteRaised: '#111720',
  graphiteLine: '#2b3440',
  teal: '#7c8cff',
  tealDeep: '#a8b3ff',
  tealSoft: '#20284a',
  background: '#0d1117',
  backgroundStrong: '#0a0d12',
  paper: '#151a21',
  paperSubtle: '#1b212a',
  paperMuted: '#242c36',
  line: '#2b3440',
  lineStrong: '#3a4654',
  brass: '#d8bd63',
  brassSoft: '#332d1c',
  copper: '#d38c6d',
  copperSoft: '#38251f',
  moss: '#65cf98',
  mossSoft: '#193126',
  rust: '#ff8a82',
  rustSoft: '#3a2020',
  slate: '#96a0ad',
  cloud: '#0d1117',
} as const;

export const chartPalette = {
  primary: colorTokens.teal,
  primaryDeep: colorTokens.tealDeep,
  positive: colorTokens.moss,
  caution: colorTokens.copper,
  risk: colorTokens.rust,
  neutral: colorTokens.slate,
  line: colorTokens.line,
  grid: colorTokens.line,
  axis: colorTokens.slate,
  surface: colorTokens.paperSubtle,
  themeFlow: [colorTokens.teal, colorTokens.brass, colorTokens.copper, colorTokens.moss],
} as const;

export type ThemeShareColorRole = 'semiconductor' | 'infrastructure' | 'platform' | 'reserve';

export const themeShareColors: Record<ThemeShareColorRole, string> = {
  semiconductor: colorTokens.teal,
  infrastructure: colorTokens.brass,
  platform: colorTokens.copper,
  reserve: colorTokens.slate,
};

export const motionTokens = {
  panelEase: 'power3.out',
  fast: 0.18,
  base: 0.28,
  slow: 0.44,
  reduced: 0.01,
};
