import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

function walkFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Production artifact contains a symbolic link: ${absolute}`);
      }
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(absolute);
      else throw new Error(`Unsupported production artifact entry: ${absolute}`);
    }
  };
  visit(root);
  return files;
}

export function compareArtifactPaths(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function logicalPath(outputRoot, absolute) {
  return relative(outputRoot, absolute).split(sep).join('/');
}

function assertArtifactDirectory(directory) {
  const entry = lstatSync(directory);
  if (entry.isSymbolicLink()) {
    throw new Error(`Production artifact root is a symbolic link: ${directory}`);
  }
  if (!entry.isDirectory()) {
    throw new Error(`Production artifact root is not a directory: ${directory}`);
  }
}

export function hashProductionArtifact(outputDirectory) {
  const outputRoot =
    outputDirectory instanceof URL ? fileURLToPath(outputDirectory) : outputDirectory;
  assertArtifactDirectory(outputRoot);
  const shippedRoots = [join(outputRoot, 'server'), join(outputRoot, 'public')];
  const files = shippedRoots
    .flatMap((root) => {
      assertArtifactDirectory(root);
      const rootFiles = walkFiles(root);
      if (rootFiles.length === 0) {
        throw new Error(`Production artifact ${relative(outputRoot, root)} root is empty`);
      }
      return rootFiles;
    })
    .sort((left, right) =>
      compareArtifactPaths(logicalPath(outputRoot, left), logicalPath(outputRoot, right)),
    );

  const hash = createHash('sha256');
  for (const absolute of files) {
    const artifactPath = logicalPath(outputRoot, absolute);
    const size = statSync(absolute).size;
    hash.update(`${artifactPath}\0${size}\0`);
    hash.update(readFileSync(absolute));
    hash.update('\0');
  }
  return hash.digest('hex');
}
