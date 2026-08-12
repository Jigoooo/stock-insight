import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

describe('Today personal briefing structure', () => {
  it('renders the approved five sections in order', async () => {
    const source = await read('pages/research-workspace/ui/views/today-view.tsx');
    const ids = [
      'today-market-summary',
      'today-headline-news',
      'today-curated-news',
      'today-news-list',
      'today-connection-summary',
    ];
    const offsets = ids.map((id) => source.indexOf(`data-testid="${id}"`));

    assert.ok(offsets.every((offset) => offset >= 0));
    assert.deepEqual(
      offsets,
      [...offsets].sort((a, b) => a - b),
    );
    // "샘플 데이터" 배지가 있던 자리다. 그 배지는 KOSPI·NASDAQ·금 세 줄의 예시를
    // 정직하게 표시하던 장치였고, 실데이터가 없던 동안에는 옳았다. 이제 정본 01 §2
    // 네 축(금리·FX·원자재·정책)이 `market.macro_vintage` 에서 실제로 온다.
    //
    // 정직성 기계는 사라지지 않았다 — 행마다 상태(`data-availability`)와 근거
    // (`basisLabel`)를 여전히 함께 적는다. 바뀐 것은 "이 화면은 예시입니다" 가
    // "이 값은 언제 관측된 무엇입니다" 로 바뀐 것뿐이다. 그래서 단언도 배지가
    // 아니라 **행마다 상태와 근거가 붙는지**를 본다.
    // 문구가 아니라 **구조**로 단언한다. 제거를 설명하는 주석에는 그 낱말이 그대로
    // 들어가므로 문구로 단언하면 주석이 자기 단언을 깬다 — 이 저장소에서 오늘만
    // 세 번 나온 모양이다.
    assert.doesNotMatch(source, /sampleMarketIndicators|styles\.sampleBadge/);
    assert.match(source, /data-availability=\{item\.availability\}/);
    assert.match(source, /\{item\.basisLabel\}/);
    assert.match(source, /deriveTodayBriefing/);
  });

  it('keeps every news surface connected to evidence selection and truthful empty states', async () => {
    const source = await read('pages/research-workspace/ui/views/today-view.tsx');

    assert.match(source, /headlineItems\.map/);
    assert.match(source, /curatedItems\.map/);
    assert.match(source, /listItems\.map/);
    assert.match(source, /onSelectRecord\(item, event\.currentTarget\)/);
    assert.equal((source.match(/event\.currentTarget/g) ?? []).length, 3);
    assert.match(source, /onSelect\(item, event\.currentTarget\)/);
    assert.match(source, /원문을 확인할 수 있는 관심종목 뉴스가 아직 없습니다/);
    assert.match(source, /원문 링크가 확인된 뉴스만 이 영역에 표시합니다/);
    assert.doesNotMatch(source, /confidenceLabel\(item\.confidence\)\} 근거/);
    assert.match(source, /연결 경로가 아직 계산되지 않았습니다/);
    assert.match(source, /nextCursor \|\| cursorLoading \|\| cursorError/);
  });
});
