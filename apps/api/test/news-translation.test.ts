import assert from 'node:assert/strict';
import test from 'node:test';

import {
  identityTranslation,
  isKoreanText,
  parseTranslationResponse,
} from '../src/ingest/news-translation.ts';

const inputs = [
  { id: '1', title: 'Markets rally after inflation data' },
  { id: '2', title: 'Fed keeps rates steady', summary: 'Officials cited persistent inflation.' },
];

test('detects Korean-majority text without treating ticker-only text as Korean', () => {
  assert.equal(isKoreanText('미국 증시가 상승했다'), true);
  assert.equal(isKoreanText('NVDA reports earnings'), false);
});

test('Korean source text uses identity projection and preserves original', () => {
  assert.deepEqual(identityTranslation({ id: '7', title: '한국은행 기준금리 동결' }), {
    id: '7',
    titleKo: '한국은행 기준금리 동결',
  });
  assert.equal(identityTranslation(inputs[0]), undefined);
});

test('structured response parser rejects unknown/duplicate/missing ids', () => {
  const parsed = parseTranslationResponse(
    {
      translations: [
        { id: '1', titleKo: '물가 지표 이후 시장 상승' },
        { id: '1', titleKo: '중복' },
        { id: 'unknown', titleKo: '무시' },
        { id: '2', titleKo: '연준, 금리 동결', summaryKo: '당국자들은 지속되는 물가를 언급했다.' },
      ],
    },
    inputs,
  );
  assert.deepEqual(parsed, [
    { id: '1', titleKo: '물가 지표 이후 시장 상승' },
    { id: '2', titleKo: '연준, 금리 동결', summaryKo: '당국자들은 지속되는 물가를 언급했다.' },
  ]);
});
