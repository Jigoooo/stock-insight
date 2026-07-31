import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const packageUrl = new URL('../package.json', import.meta.url);
const viteUrl = new URL('../vite.config.ts', import.meta.url);
const componentsUrl = new URL('../components.json', import.meta.url);
const tailwindUrl = new URL('../src/shared/ui/tailwind.css', import.meta.url);
const utilsUrl = new URL('../src/shared/lib/utils.ts', import.meta.url);
const rootRouteUrl = new URL('../src/routes/__root.tsx', import.meta.url);

describe('Tailwind v4 and shadcn foundation', () => {
  it('uses the Tailwind v4 Vite plugin and provider-free utility dependencies', async () => {
    const [packageSource, viteSource] = await Promise.all([
      readFile(packageUrl, 'utf8'),
      readFile(viteUrl, 'utf8'),
    ]);
    const packageJson = JSON.parse(packageSource) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    assert.match(packageJson.devDependencies?.tailwindcss ?? '', /^\^4\./);
    assert.match(packageJson.devDependencies?.['@tailwindcss/vite'] ?? '', /^\^4\./);
    assert.ok(packageJson.dependencies?.clsx);
    assert.ok(packageJson.dependencies?.['tailwind-merge']);
    assert.match(viteSource, /import tailwindcss from '@tailwindcss\/vite'/);
    assert.match(viteSource, /plugins:\s*\[[\s\S]*tailwindcss\(\)/);
  });

  it('targets generated shadcn code at the FSD shared layer', async () => {
    const components = JSON.parse(await readFile(componentsUrl, 'utf8')) as {
      aliases?: Record<string, string>;
      rsc?: boolean;
      style?: string;
      tailwind?: Record<string, unknown>;
      tsx?: boolean;
    };

    assert.equal(components.style, 'new-york');
    assert.equal(components.rsc, false);
    assert.equal(components.tsx, true);
    assert.deepEqual(components.tailwind, {
      baseColor: 'neutral',
      config: '',
      css: 'src/shared/ui/tailwind.css',
      cssVariables: true,
      prefix: '',
    });
    assert.equal(components.aliases?.components, '@/shared/ui');
    assert.equal(components.aliases?.ui, '@/shared/ui');
    assert.equal(components.aliases?.lib, '@/shared/lib');
    assert.equal(components.aliases?.utils, '@/shared/lib/utils');
  });

  it('excludes Preflight while exposing shadcn tokens through the design profile', async () => {
    const source = await readFile(tailwindUrl, 'utf8');

    assert.match(source, /@import ['"]tailwindcss\/theme\.css['"] layer\(theme\)/);
    assert.match(source, /@import ['"]tailwindcss\/utilities\.css['"];/);
    assert.doesNotMatch(source, /tailwindcss\/preflight\.css/);
    assert.doesNotMatch(source, /@import ['"]tailwindcss['"]/);
    assert.match(source, /--background:\s*var\(--color-canvas\)/);
    assert.match(source, /--foreground:\s*var\(--color-text-primary\)/);
    assert.match(source, /--primary:\s*var\(--color-accent-strong\)/);
    assert.match(source, /--accent:\s*var\(--color-accent-strong\)/);
    assert.match(source, /--accent-foreground:\s*var\(--color-on-accent\)/);
    assert.match(source, /--destructive:\s*var\(--color-risk\)/);
    assert.match(source, /--ring:\s*var\(--color-focus\)/);
    assert.match(source, /@theme inline\s*\{/);
    assert.match(source, /--color-background:\s*var\(--background\)/);
    assert.doesNotMatch(source, /(?:^|\n)\s*\*\s*\{/);
    assert.match(source, /\.outline-none:focus-visible\s*\{\s*outline:\s*none/);
    assert.match(
      source,
      /@media \(forced-colors: active\)[\s\S]*?\.outline-none:focus-visible[\s\S]*?outline:\s*2px solid Highlight/,
    );
  });

  it('loads the Tailwind foundation once from the application root', async () => {
    const source = await readFile(rootRouteUrl, 'utf8');
    const imports = source.match(/import ['"]@\/shared\/ui\/tailwind\.css['"];?/g) ?? [];

    assert.equal(imports.length, 1);
  });

  it('provides the canonical shadcn class merge helper without a runtime Provider', async () => {
    const source = await readFile(utilsUrl, 'utf8');

    assert.match(source, /import \{ clsx, type ClassValue \} from 'clsx'/);
    assert.match(source, /import \{ twMerge \} from 'tailwind-merge'/);
    assert.match(source, /export function cn\(\.\.\.inputs: ClassValue\[\]\)/);
    assert.match(source, /return twMerge\(clsx\(inputs\)\)/);
    assert.doesNotMatch(source, /Provider/);
  });
});
