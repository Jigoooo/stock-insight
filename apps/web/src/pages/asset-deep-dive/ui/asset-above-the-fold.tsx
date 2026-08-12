import { AssetCoverageSummary } from './asset-coverage-summary';
import styles from './asset-deep-dive.module.css';
import { AssetLearningCards } from './asset-learning-cards';
import { AssetSection } from './asset-section';
import { ComparabilityNotice } from './comparability-notice';

import {
  annotateSection,
  buildGlossaryIndex,
  excludedByAssetName,
  GlossarySegments,
  type GlossaryIndex,
} from '@/features/glossary';
import { buildIndustryPrimer, IndustryPrimer } from '@/features/industry-primer';
import {
  indexBlocks,
  readCatalystRisks,
  readExpectation,
  readIdentity,
  readPeerComparison,
  readRecentEvents,
  readSectorContext,
  readThesis,
  readValuation,
  type AssetBlockIndex,
} from '@/pages/asset-deep-dive/model/asset-packet';
import { describeEventCoverage } from '@/pages/asset-deep-dive/model/event-coverage';
import { describeThesis } from '@/pages/asset-deep-dive/model/thesis-copy';
import { describeValuationBands } from '@/pages/asset-deep-dive/model/valuation-copy';
import { formatDate } from '@/pages/research-workspace/ui/workspace-presenters';
import { PropertyList, StructuredList } from '@/shared/ui/workspace';
import type { ResponseMeta, StockDetail } from '@stock-insight/contracts';
import type { CommonAssetViewPacket } from '@stock-insight/contracts/common-asset-view';

/**
 * 정본 01 §3 above-the-fold 10항목.
 *
 * 열 항목이 **전부 자리를 갖는다.** 4번(peer-relative)과 9번(catalyst)은
 * 구조적 갭이고 8번(thesis)은 297종목 전부 비어 있다. 그래도 지우지 않는다 —
 * 정직한 부재를 이유와 함께 그리는 것이 이 화면이 하는 일이고, 빈 자리를 없애
 * 화면을 꽉 차 보이게 만들면 "없다" 가 "묻지 않았다" 로 바뀐다.
 *
 * **7번(valuation)은 더 이상 이 목록에 없다.** 한때 여기에 "7번과 8번은 297종목
 * 전부 비어 있다" 고 적혀 있었는데, 이 페이지가 착지한 뒤 밴드 생산자가 같은 날
 * 따라 들어와 52종목이 `available` 이 됐다. 낡은 문장은 그 자체로 해롭지 않지만
 * 이 문장은 해로웠다 — 감사가 "어차피 비어 있다"는 근거로 빈 몸통을 사소한
 * 문제로 내리게 만들었다. 생산자가 착지하면 화면 쪽 전제 문장도 같이 늙는다.
 */

/**
 * 항목 1·2. 여기가 이 화면에서 **산문이 가장 먼저 나오는 자리**라 용어 주석도
 * 여기서 시작한다.
 *
 * 두 문장은 `annotateSection()` 한 번으로 함께 계획한다 — 같은 5개 예산을
 * 나눠 쓰고, 같은 용어가 두 문장에 다 나오면 첫 문장에서만 밑줄이 붙는다.
 * "없습니다" 류의 대체 문구는 데이터가 아니라 제품이 쓴 문장이라 주석 대상이
 * 아니고, 그래서 원문이 있을 때만 계획에 넣는다.
 */
function OneLineDescription({
  blocks,
  glossary,
  glossaryExclude,
  stockDetail,
}: {
  blocks: AssetBlockIndex;
  glossary: GlossaryIndex;
  glossaryExclude: ReadonlySet<string>;
  stockDetail: StockDetail | null;
}) {
  const identity = readIdentity(blocks.identity_economic_claim);
  const summary = stockDetail?.companyProfile?.summaryText?.trim() ?? '';
  const claim = identity.claimStatement ?? '';
  const [summarySegments = [], claimSegments = []] = annotateSection(glossary, [summary, claim], {
    exclude: glossaryExclude,
  });

  return (
    <PropertyList
      items={[
        {
          label: '무엇을 하는 회사인가',
          value:
            summary.length > 0 ? (
              <GlossarySegments segments={summarySegments} />
            ) : (
              '한 줄 설명이 아직 연결되지 않았습니다. 아래 산업 분류와 사건으로 대신 읽어 주세요.'
            ),
        },
        {
          label: '경제 주장',
          value:
            claim.length > 0 ? (
              <GlossarySegments segments={claimSegments} />
            ) : identity.hasClaim ? (
              '경제 주장이 등록되어 있으나 문장이 비어 있습니다.'
            ) : (
              '등록된 경제 주장이 없습니다.'
            ),
        },
      ]}
    />
  );
}

function IdentitySection({ blocks }: { blocks: AssetBlockIndex }) {
  const identity = readIdentity(blocks.identity_economic_claim);
  return (
    <AssetSection
      block={blocks.identity_economic_claim}
      blockKey="identity_economic_claim"
      description="정본 01 §3 항목 1·2 — 한 줄 설명과 investable claim, 그리고 종목 코드."
      title="정체성과 경제 주장"
    >
      <PropertyList
        items={[
          { label: '표시 이름', value: identity.displayName ?? '이름이 확인되지 않았습니다' },
        ]}
      />
      {identity.tickers.length > 0 ? (
        <StructuredList className={styles.tickerList} aria-label="종목 코드">
          {identity.tickers.map((ticker) => (
            <li key={ticker}>{ticker}</li>
          ))}
        </StructuredList>
      ) : null}
    </AssetSection>
  );
}

function SectorSection({ blocks }: { blocks: AssetBlockIndex }) {
  const sector = readSectorContext(blocks.business_sector_context);
  const primer = buildIndustryPrimer({
    playbookKey: sector.playbookKey,
    taxonomyLabels: sector.taxonomyLabels,
  });
  return (
    <AssetSection
      block={blocks.business_sector_context}
      blockKey="business_sector_context"
      description="정본 01 §3 항목 3 — 산업·테마·가치사슬 위치."
      title="산업과 테마 위치"
    >
      {/* 산업 이름·분류와 "이 산업을 처음 본다면" 해설은 한 자리에서 나온다. */}
      <IndustryPrimer primer={primer} />
      <PropertyList
        items={[
          {
            label: '테마·가치사슬',
            value:
              '테마 소속과 가치사슬 위치는 이 패킷에 실리지 않습니다. 산업 분류까지만 확인됐습니다.',
          },
          ...(sector.assignedAt
            ? [{ label: '배정 시각', value: formatDate(sector.assignedAt, true) }]
            : []),
        ]}
      />
    </AssetSection>
  );
}

function PeerSection({ blocks }: { blocks: AssetBlockIndex }) {
  return (
    <AssetSection
      block={blocks.comparable_financial_facts}
      blockKey="comparable_financial_facts"
      description="정본 01 §3 항목 4 — 동종 대비 위치. 오늘은 순위가 아니라 순위를 매길 수 있는지까지 확인됩니다."
      title="동종 대비 위치"
    >
      <ComparabilityNotice view={readPeerComparison(blocks.comparable_financial_facts)} />
    </AssetSection>
  );
}

function EventSection({ blocks }: { blocks: AssetBlockIndex }) {
  const events = readRecentEvents(blocks.recent_events_surprise);
  const expectation = readExpectation(blocks.expectation_priced_in);
  return (
    <AssetSection
      block={blocks.recent_events_surprise}
      blockKey="recent_events_surprise"
      description="정본 01 §3 항목 5 — 최근 핵심 사건과 기대 대비 차이."
      title="최근 사건과 기대 차이"
    >
      <PropertyList
        items={[
          // above-the-fold 도 같은 문장을 쓴다. 여기만 잘림을 보고 제외를 보지
          // 않으면, 사건 탭에서 "제외 7건" 을 읽은 사용자가 위로 올라와
          // "1건" 이라는 다른 총계를 보게 된다.
          //
          // 라벨이 "확인된 사건" 이었는데 값도 "확인된 8건이…" 로 시작해
          // "확인된 사건: 확인된 8건이…" 로 겹쳐 읽혔다. 라벨을 범위로 바꾼다.
          { label: '사건 범위', value: describeEventCoverage(events) },
          {
            label: '기대 대비 차이',
            value:
              events.surpriseCount > 0
                ? `${events.surpriseCount}건 기록됨`
                : '기대 대비 차이가 기록되지 않았습니다.',
          },
          {
            label: '기대 개정',
            value:
              blocks.expectation_priced_in.blockState === 'available'
                ? `${expectation.revisionCount}건`
                : '기대 개정이 기록되지 않았습니다.',
          },
        ]}
      />
      {/*
        제품 경계(CLAUDE.md): 이 화면은 매수/매도·목표가를 말하지 않는다. 그런데
        사건 제목은 `knowledge.event` 의 원문이라 외부 증권사의 목표가나 투자의견이
        낱말 그대로 섞여 들어온다(라이브 실측: "삼성전자 iM증권 목표가 480000 Buy").
        제목을 고쳐 쓰면 기록을 위조하는 것이고, 그냥 두면 남의 의견이 우리 판단처럼
        읽힌다. 그래서 **누구의 말인지 먼저 적고** 원문은 그대로 옮긴다.
      */}
      {events.events.length > 0 ? (
        <p className={styles.sourceCaveat}>
          아래는 수집된 사건 기록을 제목 그대로 옮긴 것입니다. 외부 기관의 의견이나 목표 수치가
          제목에 섞여 있을 수 있으며, 그것은 이 화면의 판단이 아닙니다.
        </p>
      ) : null}
      {events.events.length > 0 ? (
        <StructuredList className={styles.eventList}>
          {events.events.slice(0, 5).map((event) => (
            <li key={event.id}>
              <strong>{event.title}</strong>
              {event.knownAt ? (
                <time dateTime={event.knownAt}>{formatDate(event.knownAt, true)}</time>
              ) : null}
            </li>
          ))}
        </StructuredList>
      ) : null}
    </AssetSection>
  );
}

function DriverSection({
  blocks,
  stockDetail,
}: {
  blocks: AssetBlockIndex;
  stockDetail: StockDetail | null;
}) {
  const peers = readPeerComparison(blocks.comparable_financial_facts);
  const metricGroups = stockDetail?.companyMetrics ?? [];
  const sourceBacked = metricGroups.filter((group) => group.availability === 'available');
  return (
    <AssetSection
      block={blocks.comparable_financial_facts}
      blockKey="comparable_financial_facts"
      description="정본 01 §3 항목 6 — 핵심 사업 동인과 지표."
      title="핵심 지표"
    >
      <PropertyList
        items={[
          {
            label: '관측된 지표',
            value: `${peers.totalMetricCount}개`,
          },
          {
            label: '지표 묶음',
            value:
              sourceBacked.length > 0
                ? `출처가 확인된 묶음 ${sourceBacked.length}개`
                : '출처가 확인된 지표 묶음이 없습니다.',
          },
          {
            label: '핵심 동인 정의',
            value:
              '어떤 지표가 이 산업의 핵심 동인인지 정의하는 표가 이 화면에 아직 연결되지 않았습니다. 지표를 임의로 골라 핵심이라 부르지 않습니다.',
          },
        ]}
      />
    </AssetSection>
  );
}

function ValuationSection({ blocks }: { blocks: AssetBlockIndex }) {
  const block = blocks.valuation_market_implied;
  const valuation = readValuation(block);
  return (
    <AssetSection
      block={block}
      blockKey="valuation_market_implied"
      description="정본 01 §3 항목 7 — 밸류에이션과 시장이 반영한 기대."
      title="밸류에이션과 반영된 기대"
    >
      <PropertyList items={describeValuationBands(valuation)} />
    </AssetSection>
  );
}

function ThesisSection({ blocks }: { blocks: AssetBlockIndex }) {
  const thesis = readThesis(blocks.multi_horizon_thesis);
  return (
    <AssetSection
      block={blocks.multi_horizon_thesis}
      blockKey="multi_horizon_thesis"
      description="정본 01 §3 항목 8 — 현재 논지와 반대 논지."
      title="논지와 반대 논지"
    >
      <PropertyList items={describeThesis(thesis)} />
    </AssetSection>
  );
}

/**
 * 갭 2 — 정본 01 §3 항목 9.
 *
 * 블록 10 이 `unverified_only` 인 이유는 생산자 부재가 아니라
 * `knowledge.assertion` 이 전부 `verification_state = 'extracted'` 에 머물러서다.
 * 검증 경로가 답이고 소유자가 다르다.
 *
 * 그래서 두 가지를 한다. (1) 블록 상태와 사유를 그대로 표시한다. (2) 기존
 * `stockDetail.risks` / `checkpoints` 는 **미검증으로 명확히 라벨해 분리한다** —
 * 점선 테두리 안, 별도 제목 아래. 검증된 자리에 섞으면 화면이 파이프라인보다
 * 강한 주장을 하게 된다.
 */
function CatalystRiskSection({
  blocks,
  stockDetail,
}: {
  blocks: AssetBlockIndex;
  stockDetail: StockDetail | null;
}) {
  const catalysts = readCatalystRisks(blocks.catalysts_risks_counter_evidence);
  const risks = stockDetail?.risks ?? [];
  const checkpoints = stockDetail?.checkpoints ?? [];
  return (
    <AssetSection
      block={blocks.catalysts_risks_counter_evidence}
      blockKey="catalysts_risks_counter_evidence"
      description="정본 01 §3 항목 9 — 촉매·리스크·무효화 조건."
      title="촉매와 리스크"
    >
      <PropertyList
        items={[
          { label: '모인 주장', value: `${catalysts.totalCount}건` },
          {
            label: '검증 통과',
            value:
              catalysts.verifiedCount > 0
                ? `${catalysts.verifiedCount}건`
                : '검증을 통과한 주장이 아직 없습니다.',
          },
          ...catalysts.byModality.map((bucket) => ({
            label: bucket.label,
            value: `${bucket.count}건`,
          })),
          // 이름을 아직 옮기지 못한 종류. 세지 않고 넘어가면 위의 "모인 주장" 합계와
          // 아래 항목들이 조용히 어긋나고, 파이프라인이 낸 새 값이 화면에서 사라진다.
          ...(catalysts.otherCount > 0
            ? [
                {
                  label: '분류하지 못한 종류',
                  value: `${catalysts.otherCount}건 — 아직 이름을 옮기지 못한 종류입니다.`,
                },
              ]
            : []),
          {
            label: '무효화 조건',
            value: '무효화 조건은 검증된 주장 위에서만 세울 수 있어 아직 표시하지 않습니다.',
          },
        ]}
      />
      {risks.length > 0 || checkpoints.length > 0 ? (
        <div className={styles.unverifiedRegion}>
          <strong>아래는 검증되지 않은 정리입니다</strong>
          <p>
            이전 화면이 쓰던 리스크·체크포인트 목록입니다. 검증 경로를 통과하지 않았으므로 위 항목과
            같은 자리에 두지 않았습니다.
          </p>
          {/*
            두 목록은 서로 다른 것이다 — 리스크는 "무엇이 잘못될 수 있는가",
            체크포인트는 "무엇을 확인해야 하는가". 라벨 없이 이어 붙이면 한
            덩어리로 읽히고, 읽는 사람은 어느 줄이 어느 쪽인지 알 수 없다.
            문구는 새로 만들지 않고 `stock-briefing-inspector` 가 이미 쓰는
            것을 그대로 쓴다 — 같은 데이터가 두 화면에서 다른 이름으로 불리면
            그것도 사용자가 풀어야 할 문제가 된다.
          */}
          {risks.length > 0 ? (
            <div>
              <strong>확인할 리스크</strong>
              <StructuredList>
                {risks.map((risk) => (
                  <li key={risk}>{risk}</li>
                ))}
              </StructuredList>
            </div>
          ) : null}
          {checkpoints.length > 0 ? (
            <div>
              <strong>체크포인트</strong>
              <StructuredList>
                {checkpoints.map((checkpoint) => (
                  <li key={checkpoint}>{checkpoint}</li>
                ))}
              </StructuredList>
            </div>
          ) : null}
        </div>
      ) : null}
    </AssetSection>
  );
}

function CoverageSection({
  blocks,
  packet,
}: {
  blocks: AssetBlockIndex;
  packet: CommonAssetViewPacket;
}) {
  return (
    <AssetSection
      block={blocks.coverage_freshness_uncertainty}
      blockKey="coverage_freshness_uncertainty"
      description="정본 01 §3 항목 10 — 자료 범위·기준 시각·남은 불확실성."
      title="자료 범위와 기준"
    >
      <AssetCoverageSummary packet={packet} />
    </AssetSection>
  );
}

export function AssetAboveTheFold({
  packet,
  source,
  stockDetail,
}: {
  packet: CommonAssetViewPacket;
  source: ResponseMeta['source'];
  stockDetail: StockDetail | null;
}) {
  const blocks = indexBlocks(packet);
  const glossary = buildGlossaryIndex(stockDetail?.glossaryTerms);
  // 용어가 종목 이름과 같으면 주석하지 않는다(과제 규칙). 이름은 두 곳에서
  // 올 수 있으므로 둘 다 막는다 — 패킷의 표시 이름과 목록의 표시 이름.
  const glossaryExclude = new Set([
    ...excludedByAssetName(readIdentity(blocks.identity_economic_claim).displayName),
    ...excludedByAssetName(stockDetail?.stock.displayName),
  ]);

  return (
    <div data-slot="asset-above-the-fold">
      <OneLineDescription
        blocks={blocks}
        glossary={glossary}
        glossaryExclude={glossaryExclude}
        stockDetail={stockDetail}
      />
      <IdentitySection blocks={blocks} />
      <SectorSection blocks={blocks} />
      {/*
        정본 01 §3 의 열 항목은 서로의 순서를 지킨다. 학습 구역은 그 열 항목을
        재배치한 것이 아니라 **사이에 끼워 넣은 추가 자리**다. `REQ-PROD-003` 의
        읽기 순서(무엇을 하는 회사 → 업계 위치 → 핵심 지표 → 사건 → 리스크)에서
        업계 위치 바로 다음이 처음 보는 사람이 용어를 만나는 지점이라 여기 둔다.
      */}
      <AssetLearningCards
        cards={stockDetail?.learningCards}
        exclude={glossaryExclude}
        glossary={glossary}
        source={source}
      />
      <PeerSection blocks={blocks} />
      <EventSection blocks={blocks} />
      <DriverSection blocks={blocks} stockDetail={stockDetail} />
      <ValuationSection blocks={blocks} />
      <ThesisSection blocks={blocks} />
      <CatalystRiskSection blocks={blocks} stockDetail={stockDetail} />
      <CoverageSection blocks={blocks} packet={packet} />
    </div>
  );
}
