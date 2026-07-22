import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

function walkFiles(root) {
  const files = [];
  const visit = (directory) => {
    assertArtifactDirectory(directory);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      const currentEntry = lstatSync(absolute);
      if (entry.isSymbolicLink() || currentEntry.isSymbolicLink()) {
        throw new Error(`Production artifact contains a symbolic link: ${absolute}`);
      }
      if (entry.isDirectory() && currentEntry.isDirectory()) visit(absolute);
      else if (entry.isFile() && currentEntry.isFile()) files.push(absolute);
      else throw new Error(`Unsupported production artifact entry: ${absolute}`);
    }
  };
  visit(root);
  return files;
}

function readArtifactFile(absolute) {
  if (typeof constants.O_NOFOLLOW !== 'number') {
    throw new Error('Production artifact hashing requires O_NOFOLLOW support');
  }
  const descriptor = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const entry = fstatSync(descriptor);
    if (!entry.isFile()) {
      throw new Error(`Production artifact entry is not a regular file: ${absolute}`);
    }
    return { bytes: readFileSync(descriptor), size: entry.size };
  } finally {
    closeSync(descriptor);
  }
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
  for (const root of shippedRoots) assertArtifactDirectory(root);
  const files = walkFiles(outputRoot).sort((left, right) =>
    compareArtifactPaths(logicalPath(outputRoot, left), logicalPath(outputRoot, right)),
  );
  for (const root of shippedRoots) {
    const rootPath = `${logicalPath(outputRoot, root)}/`;
    const rootFiles = files.filter((file) => logicalPath(outputRoot, file).startsWith(rootPath));
    if (rootFiles.length === 0) {
      throw new Error(`Production artifact ${relative(outputRoot, root)} root is empty`);
    }
  }

  const hash = createHash('sha256');
  for (const absolute of files) {
    const artifactPath = logicalPath(outputRoot, absolute);
    const { bytes, size } = readArtifactFile(absolute);
    hash.update(`file\0${artifactPath}\0${size}\0`);
    hash.update(bytes);
    hash.update('\0');
  }
  return hash.digest('hex');
}
