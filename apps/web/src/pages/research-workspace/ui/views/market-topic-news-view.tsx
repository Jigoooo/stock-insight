import ledgerStyles from '../feed-ledger.module.css';
import { formatDate, formatNumber } from '../research-workspace-page';

import styles from './market-topic-news-view.module.css';

import {
  AvailabilityNotice,
  DataTable,
  PageHeader,
  Panel,
  PanelHeader,
  PropertyList,
  StatusSummary,
  WorkspaceState,
} from '@/shared/ui/workspace';

import type { MarketTopicNewsPage } from '@stock-insight/contracts/research-workspace';

// Market-wide news: events that carry market vocabulary and name no company.
//
// The vocabulary is a definition somebody wrote, not a measurement, so this page
// shows its workings — which terms are in force, which term caught each item, and
// which terms catch nothing. A reader who disagrees with a term can see exactly
// what it did before deciding to delete the row.

export function MarketTopicNewsView({ data }: { data: MarketTopicNewsPage }) {
  // Counted from the rows themselves, not from matchedTotal - items.length: that
  // subtraction would also swallow the action-advice filter and the item cap, and
  // report them as duplicates.
  const collapsedAway = data.items.reduce((sum, item) => sum + item.duplicateCount - 1, 0);
  const deadTerms = data.termCounts.filter((term) => term.events === 0);
  const linkedCount = data.items.filter((item) => item.url !== null).length;

  return (
    <>
      <PageHeader
        title="시장 전반 뉴스"
        description="특정 기업을 지목하지 않는 금리·물가·환율·유가·지수 소식을 모읍니다."
        asOf={data.generatedAt}
      />
      <AvailabilityNotice availability={data.availability} />
      <StatusSummary
        aria-label="시장 전반 뉴스 요약"
        items={[
          { label: '표시한 소식', value: formatNumber(data.items.length) },
          {
            label: '어휘에 걸린 사건',
            value: `${formatNumber(data.matchedTotal)} / ${formatNumber(data.unattributedTotal)}`,
          },
          { label: '쓰이는 용어', value: formatNumber(data.activeTermCount) },
          { label: '원문 있는 소식', value: `${formatNumber(linkedCount)}건` },
        ]}
      />
      <Panel aria-labelledby="market-topic-news-title">
        <PanelHeader>
          <h2 id="market-topic-news-title">소식</h2>
          <p>
            기업 이름이 본문에 없어 어떤 종목 페이지에도 걸리지 않는 소식입니다. 각 줄에 이 목록에
            들어온 <strong>이유가 된 용어</strong>를 함께 표시합니다.
          </p>
        </PanelHeader>
        <PropertyList
          className={ledgerStyles.statusProperties}
          aria-label="시장 전반 뉴스 구성"
          items={[
            {
              label: '어디서 골랐나',
              value: `기업에 붙지 않은 관측 ${formatNumber(data.unattributedTotal)}건 중 ${formatNumber(data.matchedTotal)}건이 용어에 걸렸습니다`,
            },
            {
              label: '같은 소식 묶음',
              value:
                collapsedAway <= 0
                  ? '같은 본문이 겹친 것 없음'
                  : `${formatNumber(collapsedAway)}건은 본문이 같아 한 줄로 묶었습니다`,
            },
          ]}
        />
        {data.items.length === 0 ? (
          <WorkspaceState
            kind="empty"
            title="어휘에 걸린 소식이 없습니다"
            description="기업을 지목하지 않는 소식이 시장 어휘에 걸리면 이곳에 쌓입니다."
          />
        ) : (
          <ul className={styles.newsList} aria-label="시장 전반 뉴스 목록">
            {data.items.map((item) => (
              <li
                key={item.eventKey}
                className={styles.newsRow}
                data-testid="market-topic-news-row"
              >
                <div>
                  <strong>{item.summary}</strong>
                  <ul className={styles.terms} aria-label="이 소식이 걸린 용어">
                    {item.matchedTerms.map((term) => (
                      <li key={`${term.topic}:${term.term}`}>
                        {topicLabels[term.topic] ?? term.topic} · <b>{term.term}</b>
                      </li>
                    ))}
                  </ul>
                  {item.duplicateCount > 1 && (
                    <small>
                      같은 본문이 {formatNumber(item.duplicateCount)}건 추출되어 한 줄로 묶었습니다
                    </small>
                  )}
                </div>
                <div className={styles.rowMeta}>
                  <time dateTime={item.publishedAt ?? item.occurredAt}>
                    {formatDate(item.publishedAt ?? item.occurredAt, true)}
                  </time>
                  <span>{item.sourceName ?? '출처 미상'}</span>
                  {item.url === null ? (
                    <span>원문 링크 없음</span>
                  ) : (
                    <a href={item.url} target="_blank" rel="noreferrer noopener">
                      원문 보기
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel aria-labelledby="market-topic-vocabulary-title">
        <PanelHeader>
          <h2 id="market-topic-vocabulary-title">이 목록을 만든 어휘</h2>
          <p>
            무엇이 시장 뉴스인지는 관측이 아니라 <strong>정한 것</strong>입니다. 어떤 용어가 무엇을
            얼마나 끌어왔는지 그대로 공개하니, 목록이 이상하면 용어를 의심하시면 됩니다.
          </p>
        </PanelHeader>
        <PropertyList
          className={ledgerStyles.statusProperties}
          aria-label="어휘 요약"
          items={[
            {
              label: '아무것도 걸리지 않는 용어',
              value:
                deadTerms.length === 0
                  ? '없음'
                  : `${formatNumber(deadTerms.length)}개 — 틀렸다는 뜻이 아니라 아직 해당 소식이 없다는 뜻입니다`,
            },
          ]}
        />
        <div className={styles.tableWrap}>
          <DataTable caption="용어별 수집 건수" className={styles.vocabularyTable}>
            <thead>
              <tr>
                <th scope="col">주제</th>
                <th scope="col">용어</th>
                <th scope="col">걸린 사건</th>
              </tr>
            </thead>
            <tbody>
              {data.termCounts.map((term) => (
                <tr
                  key={`${term.topic}:${term.term}`}
                  className={term.events === 0 ? styles.deadTerm : undefined}
                >
                  <td>{topicLabels[term.topic] ?? term.topic}</td>
                  <td>
                    <strong>{term.term}</strong>
                  </td>
                  <td>{formatNumber(term.events)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      </Panel>
    </>
  );
}

// Migration 063's topic keys, said in Korean. An unknown key falls through to the
// raw key rather than to a guess — a new topic should look unfamiliar, not wrong.
const topicLabels: Record<string, string> = {
  rates: '금리',
  inflation: '물가',
  fx: '환율',
  trade: '무역',
  growth: '성장',
  market: '증시',
  energy: '에너지',
};
