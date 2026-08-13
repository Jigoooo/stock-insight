import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const SCRIPTS = new URL('../scripts/', import.meta.url);

/**
 * `pipeline_require_db_assertion <name> "<SQL>"` 의 SQL 은 통째로 셸의 큰따옴표
 * 문자열 하나다. 그 안에 큰따옴표나 역따옴표가 들어가면 — **주석 안이라도** —
 * 셸이 인자를 그 자리에서 끊거나 명령 치환을 하고, SQL 은 문법 오류로 죽는다.
 *
 * 2026-08-13 에 실제로 그렇게 죽었다. analytics 파이프라인이 모든 단계를
 * 통과하고 마지막 단언에서:
 *
 *   LINE 20: -- no_eligible_source 이던 자리라, 조용히 빠지면 원래
 *   analytics DB readback query failed
 *
 * 원인은 그 주석 안의 큰따옴표 한 쌍이었다. 그 단언은 그때까지 한 번도
 * 실행된 적이 없어서(파이프라인이 늘 더 앞에서 실패했다) 아무도 몰랐다.
 *
 * 셸 문법 검사(`bash -n`)는 이것을 못 잡는다 — 따옴표가 짝이 맞아 **문법적으로는
 * 올바른** 명령이 되기 때문이다. 다만 SQL 이 조각나 있을 뿐이다.
 */
test('DB 단언 SQL 안에는 큰따옴표도 역따옴표도 없다', async () => {
  const names = (await readdir(SCRIPTS)).filter((name) => name.endsWith('.sh'));
  const offenders: string[] = [];

  for (const name of names) {
    const source = await readFile(new URL(name, SCRIPTS), 'utf8');
    // `pipeline_require_db_assertion <이름> "` 부터 줄 첫머리의 `"` 까지가 한 인자다.
    for (const match of source.matchAll(
      /pipeline_require_db_assertion\s+\S+\s+"\n([\s\S]*?)\n"/g,
    )) {
      const body = match[1] ?? '';
      body.split('\n').forEach((line, index) => {
        if (line.includes('"') || line.includes('`')) {
          offenders.push(`${name}: SQL 인자 ${index + 1}번째 줄 — ${line.trim().slice(0, 70)}`);
        }
      });
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `DB 단언 SQL 안의 따옴표는 인자를 끊는다. 작은따옴표로 바꿀 것:\n  ${offenders.join('\n  ')}`,
  );
});

test('검사가 실제로 무언가를 보고 있다', () => {
  // 정규식이 조용히 0개를 매치하면 위 테스트는 장식이 된다.
  const sample = 'pipeline_require_db_assertion analytics "\nSELECT 1 -- "따옴표"\n"';
  const bodies = [...sample.matchAll(/pipeline_require_db_assertion\s+\S+\s+"\n([\s\S]*?)\n"/g)];
  assert.equal(bodies.length, 1);
  assert.ok(bodies[0]![1]!.includes('"'));
});
