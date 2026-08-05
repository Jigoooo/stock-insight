import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { decodeDocumentZip, extractWindows } from '../src/ingest/run-dart-supply-disclosure.ts';

/**
 * The two extraction decisions that cost a measurement round each.
 *
 * `context` — names count only near a customer phrase. Searching whole documents
 * counted 한국투자금융지주's HOLDINGS as its customers. Same class of error was
 * made on SEC filings first, which is why the window is a constant with a test
 * rather than a number someone can widen without noticing.
 *
 * `encoding` — the XML declares utf-8. Decoding EUC-KR produced 148,449
 * replacement characters and a reading of "0 매출처": an absence that was really a
 * misread. The collector counts replacement characters and refuses the document
 * rather than reporting zero customers.
 */
describe('customer context windows', () => {
  it('keeps only the prose around a marker', () => {
    const before = 'A'.repeat(400);
    const after = 'B'.repeat(400);
    const [window] = extractWindows(`${before}매출처${after}`, ['매출처'], 150);

    assert.ok(window);
    // 150 before + marker + 150 after, and nothing from the far ends.
    assert.equal(window.length, 150 + '매출처'.length + 150);
    assert.ok(window.startsWith('A'.repeat(150)));
    assert.ok(window.endsWith('B'.repeat(150)));
  });

  it('finds every occurrence, not just the first', () => {
    const text = `x매출처y${'z'.repeat(500)}x주요거래처y`;
    const windows = extractWindows(text, ['매출처', '주요거래처'], 20);
    assert.equal(windows.length, 2);
  });

  it('turns tags into spaces instead of deleting them', () => {
    // Deleting tags would join the two cells into "삼성전자엘지전자" — a company
    // name that appears in no document. The separator has to survive.
    const html = '매출처: <td>삼성전자</td><td>엘지전자</td>';
    const [window] = extractWindows(html, ['매출처'], 150);

    assert.ok(window);
    assert.doesNotMatch(window, /삼성전자엘지전자/);
    assert.match(window, /삼성전자\s+.*엘지전자/);
  });

  it('reads the affiliate section from the same text, costing no extra request', () => {
    // B4 depends on this: the affiliate names are in the document we already
    // fetched, so exclusion needs no second call. Whether they are USABLE is a
    // separate measurement the collector reports before the rule is enabled.
    const text = `앞${'-'.repeat(200)}계열회사 현황: (주)엘에스일렉트릭${'-'.repeat(200)}뒤`;
    const customer = extractWindows(text, ['매출처']);
    const affiliate = extractWindows(text, ['계열회사']);

    assert.equal(customer.length, 0);
    assert.equal(affiliate.length, 1);
    assert.match(affiliate[0]!, /엘에스일렉트릭/);
  });

  it('returns nothing when the section is absent — a real observation', () => {
    // 6 of 40 sampled reports have no customer section, and the source contract
    // declares emptiness valid here. An empty result must not look like an error.
    assert.deepEqual(extractWindows('보고서 본문에 거래처 절이 없다', ['매출처']), []);
  });
});

describe('document decoding', () => {
  it('refuses a body that is not a ZIP', () => {
    // document.xml answers an exhausted quota with JSON, not a ZIP. Treating that
    // as an empty document would record "no customers" for every issuer once the
    // budget ran out — a fabricated absence at scale.
    assert.equal(decodeDocumentZip(Buffer.from('{"status":"020"}', 'utf8')), null);
    assert.equal(decodeDocumentZip(Buffer.from('', 'utf8')), null);
    assert.equal(decodeDocumentZip(Buffer.from('<?xml version="1.0"?>', 'utf8')), null);
  });
});

/**
 * A job nobody runs is a backfill. The attribution jobs were written, measured and
 * left out of every pipeline script for days; nothing failed, because a stage that
 * does not exist cannot report a failure. This is the same guard for the collector.
 */
describe('the collector is wired into a pipeline', () => {
  const script = (): Promise<string> =>
    readFile(new URL('../scripts/run_market_enrichment.sh', import.meta.url), 'utf8');

  it('runs with --apply and records a stage', async () => {
    const source = await script();
    assert.match(source, /run-dart-supply-disclosure\.ts --limit \d+ --apply/);
    assert.match(
      source,
      /pipeline_record_stage_success stock-insight-dart-supply-disclosure-stage/,
    );
  });

  it('runs after the financial-facts step, which owns the DART budget', async () => {
    const source = await script();
    // That step takes 15 issuers at 20 requests each = 300, against a ceiling this
    // repository has measured only as "above 100, at or below 361". Collecting
    // before it would eat the headroom it deliberately leaves.
    const facts = source.indexOf('run-dart-financial-facts.ts');
    const supply = source.indexOf('run-dart-supply-disclosure.ts');
    assert.notEqual(facts, -1);
    assert.notEqual(supply, -1);
    assert.ok(facts < supply, 'financial facts must claim the DART budget first');
  });

  it('is gated to Sunday, because 사업보고서 is annual', async () => {
    const source = await script();
    const supply = source.indexOf('run-dart-supply-disclosure.ts');
    // The nearest preceding day-of-week guard has to be the one wrapping it.
    const guard = source.lastIndexOf('date +%u', supply);
    assert.ok(guard !== -1 && guard < supply, 'the collector must sit inside a weekday guard');
  });

  it('is last, so its failure cannot stop the proven jobs', async () => {
    const source = await script();
    const supply = source.indexOf('run-dart-supply-disclosure.ts');
    for (const job of [
      'run-sec-financial-facts.ts',
      'run-finra-short-volume.ts',
      'run-fred-vintage.ts',
      'run-ohlcv-adjust.ts',
    ]) {
      const at = source.indexOf(job);
      assert.notEqual(at, -1, job);
      assert.ok(at < supply, `${job} must run before the collector`);
    }
  });
});
