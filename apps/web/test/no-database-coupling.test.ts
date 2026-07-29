// ARCHITECTURAL INVARIANT (P2 brain split).
//
// apps/web is the BFF. It must reach research data ONLY over HTTP to the brain
// (apps/api-server), never by opening its own PostgreSQL connection. If this
// test fails, the split has regressed and deploying apps/web would ship database
// credentials to whatever host runs the frontend.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('../', import.meta.url));
const srcRoot = join(webRoot, 'src');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const sourceFiles = walk(srcRoot).map((path) => ({ path, text: readFileSync(path, 'utf8') }));

function relative(path: string): string {
  return path.slice(webRoot.length);
}

describe('apps/web holds no database coupling', () => {
  it('never imports @stock-insight/api (the brain-side data layer)', () => {
    const offenders = sourceFiles
      .filter(({ text }) =>
        /from\s+'@stock-insight\/api'|import\('@stock-insight\/api'\)/.test(text),
      )
      .map(({ path }) => relative(path));
    assert.deepEqual(offenders, [], `apps/web must not import @stock-insight/api: ${offenders}`);
  });

  it('never imports the pg driver', () => {
    const offenders = sourceFiles
      .filter(({ text }) => /from\s+'pg'|require\(['"]pg['"]\)|import\(['"]pg['"]\)/.test(text))
      .map(({ path }) => relative(path));
    assert.deepEqual(offenders, [], `apps/web must not import pg: ${offenders}`);
  });

  it('declares no database dependency in package.json', () => {
    const pkg = JSON.parse(readFileSync(join(webRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const banned of ['pg', '@types/pg', '@stock-insight/api', '@stock-insight/db-schema']) {
      assert.equal(all[banned], undefined, `apps/web must not depend on ${banned}`);
    }
  });

  it('reads no DATABASE_* environment variable', () => {
    const offenders = sourceFiles
      .filter(({ text }) => /DATABASE_(READ|WRITE)?_?URL/.test(text))
      .map(({ path }) => relative(path));
    assert.deepEqual(offenders, [], `apps/web must not read database URLs: ${offenders}`);
  });

  // The signing secret grants the ability to mint ANY user's scope, so it may
  // only be touched by the single brain-client module.
  it('confines internal-context signing to the brain client', () => {
    const offenders = sourceFiles
      .filter(({ path }) => !path.endsWith(join('server', 'brain-client.ts')))
      .filter(({ text }) =>
        /signInternalUserContext|signAnonymousInternalContext|INTERNAL_CONTEXT_SECRET/.test(text),
      )
      .map(({ path }) => relative(path));
    assert.deepEqual(
      offenders,
      [],
      `internal-context signing must stay in brain-client: ${offenders}`,
    );
  });

  // node:crypto in a client component would break the browser bundle; the
  // internal-context module is a server-only contracts subpath.
  it('keeps the server-only internal-context module out of client code', () => {
    const offenders = sourceFiles
      .filter(
        ({ path }) => path.includes(join('src', 'pages')) || path.includes(join('src', 'features')),
      )
      .filter(({ text }) => /@stock-insight\/contracts\/internal-context/.test(text))
      .map(({ path }) => relative(path));
    assert.deepEqual(offenders, [], `client code must not import internal-context: ${offenders}`);
  });
});
