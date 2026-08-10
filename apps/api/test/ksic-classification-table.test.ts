import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseKsicTable, parseKsicTableArgs } from '../src/ingest/run-ksic-classification-table.ts';

describe('KSIC table parsing', () => {
  const header = '"Industy_code","Industy_name"';

  it('reads quoted rows', () => {
    const table = parseKsicTable(`${header}\n"01","농업"\n"64121","국내은행"`);
    assert.equal(table.get('01'), '농업');
    assert.equal(table.get('64121'), '국내은행');
  });

  it('reads unquoted rows, because the mirror has published both', () => {
    const table = parseKsicTable(`Industy_code,Industy_name\n64121,국내은행`);
    assert.equal(table.get('64121'), '국내은행');
  });

  it('keeps a name that contains a comma', () => {
    // '그 외 기타 봉제의복 제조업, 기타' is a real entry. Splitting on every comma
    // truncates it to '그 외 기타 봉제의복 제조업' and nothing reports the loss.
    const table = parseKsicTable(`${header}\n"14199","그 외 기타 봉제의복 제조업, 기타"`);
    assert.equal(table.get('14199'), '그 외 기타 봉제의복 제조업, 기타');
  });

  it('refuses a table whose header changed', () => {
    // The upstream typo is matched exactly. Accepting both spellings would make the
    // day the mirror fixes it invisible, and an unnoticed source shape change is what
    // this repository builds gauges to catch.
    assert.throws(() => parseKsicTable('industry_code,industry_name\n01,농업'), /header changed/);
  });

  it('ignores rows whose code is not a KSIC code', () => {
    const table = parseKsicTable(`${header}\n"A","농업, 임업 및 어업"\n"01","농업"`);
    assert.equal(table.has('A'), false);
    assert.equal(table.size, 1);
  });

  it('defaults to a dry run and refuses an unknown flag', () => {
    assert.equal(parseKsicTableArgs([]).mode, 'dry-run');
    assert.equal(parseKsicTableArgs(['--apply']).mode, 'apply');
    assert.throws(() => parseKsicTableArgs(['--applyy']), /unknown argument/);
  });
});
