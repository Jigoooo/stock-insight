import { readdir, readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const thresholdBytes = 70 * 1024;
const assetsDirectory = new URL('../.output/public/assets/', import.meta.url);
const names = (await readdir(assetsDirectory))
  .filter((name) => /^workspace-[A-Za-z0-9_-]+\.js$/.test(name))
  .sort();

if (names.length === 0) {
  throw new Error(
    'No built workspace JavaScript chunks found; run pnpm --filter @stock-insight/web build first',
  );
}

const chunks = await Promise.all(
  names.map(async (name) => {
    const source = await readFile(new URL(name, assetsDirectory));
    return {
      file: name,
      gzipBytes: gzipSync(source, { level: 9 }).byteLength,
      rawBytes: source.byteLength,
    };
  }),
);
const largest = chunks.reduce((current, chunk) =>
  chunk.gzipBytes > current.gzipBytes ? chunk : current,
);
const result = {
  chunks,
  codeSplitRequired: largest.gzipBytes > thresholdBytes,
  largestWorkspaceChunk: largest,
  thresholdBytes,
};

console.log(JSON.stringify(result, null, 2));
if (result.codeSplitRequired) process.exitCode = 1;
