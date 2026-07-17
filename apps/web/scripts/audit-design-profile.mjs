import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIRECT_COLOR_PATTERN = /#[\da-f]{3,8}\b|\b(?:rgb|hsl|oklab|oklch|lab|lch|color)\([^)]*\)/gi;
const GRADIENT_PATTERN = /\b(?:linear|radial|conic)-gradient\(/gi;
const SHADOW_PATTERN = /\bbox-shadow\s*:/gi;
const LITERAL_RADIUS_PATTERN = /(?:\bborder-radius|--[\w-]*radius[\w-]*)\s*:\s*(?!var\()[^;\n}]+/gi;
const MOTION_DURATION_PATTERN = /\b\d*\.?\d+(?:ms|s)\b/gi;
const TOKEN_DEFINITION_PATTERN = /--[\w-]+\s*:/g;
const RADIUS_PX_PATTERN = /(?:\bborder-radius|--[\w-]*radius[\w-]*)\s*:\s*(\d*\.?\d+)px/gi;
const HEIGHT_PX_PATTERN = /\b(?:min-height|height)\s*:\s*(\d*\.?\d+)px/gi;
const PADDING_DECLARATION_PATTERN = /\bpadding(?:-[\w-]+)?\s*:\s*([^;\n}]+)/gi;
const SCRIPT_MOTION_RECIPE_PATTERN =
  /(?:^|[,{]\s*)(?:duration|ease|scale|x|y)\s*:\s*(?:-?\d*\.?\d+|['"][^'"]+['"])/gim;

function countMatches(source, pattern) {
  return source.match(pattern)?.length ?? 0;
}

export function summarizeCssSources(sources) {
  const componentDirectColorFiles = [];
  const radiusValues = [];
  const summary = {
    files: sources.length,
    profiles: 0,
    scripts: 0,
    directColors: 0,
    componentDirectColors: 0,
    gradients: 0,
    shadows: 0,
    literalRadii: 0,
    motionDurations: 0,
    profileTokenDefinitions: 0,
    componentTokenOverrides: 0,
    scriptDirectColors: 0,
    scriptMotionRecipes: 0,
  };

  for (const item of sources) {
    const directColors = countMatches(item.source, DIRECT_COLOR_PATTERN);
    const tokenDefinitions = countMatches(item.source, TOKEN_DEFINITION_PATTERN);
    summary.profiles += item.kind === 'profile' ? 1 : 0;
    summary.scripts += item.kind === 'script' ? 1 : 0;
    summary.directColors += directColors;
    summary.gradients += countMatches(item.source, GRADIENT_PATTERN);
    summary.shadows += countMatches(item.source, SHADOW_PATTERN);
    summary.literalRadii += countMatches(item.source, LITERAL_RADIUS_PATTERN);
    summary.motionDurations += countMatches(item.source, MOTION_DURATION_PATTERN);
    summary.profileTokenDefinitions += item.kind === 'profile' ? tokenDefinitions : 0;
    summary.componentTokenOverrides += item.kind === 'component' ? tokenDefinitions : 0;
    summary.scriptDirectColors += item.kind === 'script' ? directColors : 0;
    summary.scriptMotionRecipes +=
      item.kind === 'script' ? countMatches(item.source, SCRIPT_MOTION_RECIPE_PATTERN) : 0;
    for (const match of item.source.matchAll(RADIUS_PX_PATTERN))
      radiusValues.push(Number(match[1]));

    if (item.kind === 'component' && directColors > 0) {
      summary.componentDirectColors += directColors;
      componentDirectColorFiles.push(item.path);
    }
  }

  const compactHeightDeclarations = sources.reduce(
    (count, item) =>
      count +
      [...item.source.matchAll(HEIGHT_PX_PATTERN)].filter((match) => Number(match[1]) <= 32).length,
    0,
  );
  const compactPaddingDeclarations = sources.reduce(
    (count, item) =>
      count +
      [...item.source.matchAll(PADDING_DECLARATION_PATTERN)].filter((match) =>
        [...match[1].matchAll(/\d*\.?\d+px/g)].some((value) => Number.parseFloat(value[0]) <= 8),
      ).length,
    0,
  );
  const distinctRadiusValues = [...new Set(radiusValues)].sort((left, right) => left - right);

  return {
    mode: 'advisory',
    blocking: false,
    summary,
    componentDirectColorFiles: [...new Set(componentDirectColorFiles)].sort(),
    radiusSpread: {
      minPx: distinctRadiusValues.at(0) ?? null,
      maxPx: distinctRadiusValues.at(-1) ?? null,
      distinctPx: distinctRadiusValues,
    },
    density: {
      compactHeightDeclarations,
      compactPaddingDeclarations,
    },
    note: 'Values describe the current profile; they do not grade aesthetic quality.',
  };
}

async function collectFiles(root, kind, baseDirectory, extensions) {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolutePath);
      else if (entry.isFile() && extensions.some((extension) => entry.name.endsWith(extension))) {
        files.push({
          path: path.relative(baseDirectory, absolutePath).split(path.sep).join('/'),
          kind,
          source: await readFile(absolutePath, 'utf8'),
        });
      }
    }
  }
  await visit(root);
  return files;
}

export async function collectDesignAudit(
  appDirectory = path.resolve(fileURLToPath(new URL('..', import.meta.url))),
) {
  const [profiles, components, scripts] = await Promise.all([
    collectFiles(path.join(appDirectory, 'public/styles/profiles'), 'profile', appDirectory, [
      '.css',
    ]),
    collectFiles(path.join(appDirectory, 'src'), 'component', appDirectory, ['.css']),
    collectFiles(path.join(appDirectory, 'src'), 'script', appDirectory, ['.ts', '.tsx']),
  ]);
  return summarizeCssSources([...profiles, ...components, ...scripts]);
}

const entryPoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entryPoint) {
  const report = await collectDesignAudit();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
