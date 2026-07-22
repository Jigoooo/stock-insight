import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  compareArtifactPaths,
  hashProductionArtifact,
} from '../../../scripts/production-artifact-hash.mjs';

describe('production artifact hash', () => {
  it('orders artifact paths independently of the host locale', () => {
    assert.deepEqual(['ä.js', 'z.js', 'A.js'].sort(compareArtifactPaths), ['A.js', 'z.js', 'ä.js']);
  });

  it('covers nested SSR libraries and client assets deterministically', () => {
    const output = mkdtempSync(join(tmpdir(), 'stock-insight-artifact-hash-'));
    try {
      mkdirSync(join(output, 'server', '_ssr'), { recursive: true });
      mkdirSync(join(output, 'public', 'assets'), { recursive: true });
      writeFileSync(join(output, 'server', 'index.mjs'), 'import "./_ssr/workspace.mjs";');
      writeFileSync(join(output, 'server', '_ssr', 'workspace.mjs'), 'export const value = 1;');
      writeFileSync(join(output, 'public', 'assets', 'workspace.js'), 'console.log(1);');

      const baseline = hashProductionArtifact(output);
      assert.equal(hashProductionArtifact(output), baseline);

      writeFileSync(join(output, 'server', '_ssr', 'workspace.mjs'), 'export const value = 2;');
      assert.notEqual(hashProductionArtifact(output), baseline);
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  });

  it('covers public runtime files outside the assets directory', () => {
    const output = mkdtempSync(join(tmpdir(), 'stock-insight-artifact-public-'));
    try {
      mkdirSync(join(output, 'server'), { recursive: true });
      mkdirSync(join(output, 'public', 'assets'), { recursive: true });
      writeFileSync(join(output, 'server', 'index.mjs'), 'export {};');
      writeFileSync(join(output, 'public', 'assets', 'workspace.js'), 'console.log(1);');
      writeFileSync(join(output, 'public', 'manifest.webmanifest'), '{"name":"one"}');

      const baseline = hashProductionArtifact(output);
      writeFileSync(join(output, 'public', 'manifest.webmanifest'), '{"name":"two"}');
      assert.notEqual(hashProductionArtifact(output), baseline);
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  });

  it('fails closed when a shipped artifact path is a symbolic link', () => {
    const output = mkdtempSync(join(tmpdir(), 'stock-insight-artifact-symlink-'));
    try {
      mkdirSync(join(output, 'server'), { recursive: true });
      mkdirSync(join(output, 'public'), { recursive: true });
      writeFileSync(join(output, 'server', 'index.mjs'), 'export {};');
      writeFileSync(join(output, 'public', 'workspace.js'), 'console.log(1);');
      symlinkSync(join(output, 'public', 'workspace.js'), join(output, 'public', 'alias.js'));

      assert.throws(() => hashProductionArtifact(output), /symbolic link/i);
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  });

  it('fails closed when a shipped artifact root is a symbolic link', () => {
    const output = mkdtempSync(join(tmpdir(), 'stock-insight-artifact-root-symlink-'));
    try {
      mkdirSync(join(output, 'real-server'), { recursive: true });
      mkdirSync(join(output, 'public'), { recursive: true });
      writeFileSync(join(output, 'real-server', 'index.mjs'), 'export {};');
      writeFileSync(join(output, 'public', 'workspace.js'), 'console.log(1);');
      symlinkSync(join(output, 'real-server'), join(output, 'server'), 'dir');

      assert.throws(() => hashProductionArtifact(output), /symbolic link/i);
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  });

  it('requires both the server and public artifact roots to contain files', () => {
    for (const emptyRoot of ['server', 'public'] as const) {
      const output = mkdtempSync(join(tmpdir(), `stock-insight-artifact-empty-${emptyRoot}-`));
      try {
        mkdirSync(join(output, 'server'), { recursive: true });
        mkdirSync(join(output, 'public'), { recursive: true });
        const populatedRoot = emptyRoot === 'server' ? 'public' : 'server';
        writeFileSync(join(output, populatedRoot, 'runtime.js'), 'export {};');

        assert.throws(() => hashProductionArtifact(output), new RegExp(`${emptyRoot}.*empty`, 'i'));
      } finally {
        rmSync(output, { recursive: true, force: true });
      }
    }
  });
});
