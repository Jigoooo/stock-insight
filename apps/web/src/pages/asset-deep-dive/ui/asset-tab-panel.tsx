import { useId } from 'react';

import styles from './asset-deep-dive.module.css';
import { AssetSection } from './asset-section';
import { ComparabilityNotice } from './comparability-notice';

import { buildGlossaryIndex, GlossaryPanel, type GlossaryIndex } from '@/features/glossary';
import {
  indexBlocks,
  readCoverage,
  readDerivation,
  readExpectation,
  readExposure,
  readIdentity,
  readMarketReaction,
  readPeerComparison,
  readRecentEvents,
  readSectorContext,
  readThesis,
  readValuation,
  type AssetBlockIndex,
} from '@/pages/asset-deep-dive/model/asset-packet';
import type { AssetTabDefinition, AssetTabId } from '@/pages/asset-deep-dive/model/asset-tabs';
import { describeEventCoverage } from '@/pages/asset-deep-dive/model/event-coverage';
import { describeThesis } from '@/pages/asset-deep-dive/model/thesis-copy';
import { describeValuationBands } from '@/pages/asset-deep-dive/model/valuation-copy';
import { formatDate } from '@/pages/research-workspace/ui/workspace-presenters';
import { TextLink } from '@/shared/ui/link';
import { TruthClaimRow, truthBindingForContentPackItem } from '@/shared/ui/truth';
import { PropertyList, StructuredList } from '@/shared/ui/workspace';
import type { StockDetail } from '@stock-insight/contracts';
import type { CommonAssetViewPacket } from '@stock-insight/contracts/common-asset-view';

/**
 * 정본 01 §3 하위 탭 11개의 본문.
 *
 * 데이터가 없는 탭도 **만든다.** 화면이 꽉 차 보이게 하려고 지우는 것이 아니라,
 * 각 탭이 무엇을 담기로 했고 왜 지금 비어 있는지를 `blockState` 와 사유로
 * 이름 붙여 그린다. 그것이 이 제품의 차별점이고 정본 01 §3 이 요구하는 것이다.
 *
 * ## 상대 자산의 이름을 지어내지 않는다
 *
 * 블록 6 payload 는 `objectEntityId` 만 싣고 상대의 표시 이름을 싣지 않는다.
 * `PRODUCT_SIMILARITY`(통계 추정)를 "관련 기업" 으로 돌려 쓰는 것은
 * `REQ-PROD-030` 이 금지하므로, 이 탭들은 이름 목록 대신 **승인 등급별 개수**를
 * 그린다. 개수는 거짓말을 하지 않는다.
 */

type TabProps = {
  blocks: AssetBlockIndex;
  stockDetail: StockDetail | null;
  packet: CommonAssetViewPacket;
};

/**
 * 영향 경로의 진술 종류. drawer(`stock-briefing-inspector.tsx`)와 **같은 바인딩**을
 * 쓴다 — 마이그레이션 085 가 `impact_path` 를 EXPOSURE 가 아니라 HYPOTHESIS 로
 * 묶었고, 두 화면이 같은 사실에 다른 이름을 붙이면 그중 하나는 거짓이다.
 */
const IMPACT_PATH_TRUTH = truthBindingForContentPackItem('impact_path');
const IMPACT_PATH_BASIS =
  '규칙으로 이어 붙인 연결이며 방향과 크기가 확인되지 않아 가설로 분류됩니다.';

function IdentityTab({ blocks, stockDetail }: TabProps) {
  const identity = readIdentity(blocks.identity_economic_claim);
  const profile = stockDetail?.companyProfile;
  return (
    <AssetSection
      block={blocks.identity_economic_claim}
      blockKey="identity_economic_claim"
      headingLevel="h3"
      title="회사·법인·증권 정체성"
    >
      <PropertyList
        items={[
          { label: '표시 이름', value: identity.displayName ?? '확인되지 않았습니다' },
          {
            label: '종목 코드',
            value: identity.tickers.length > 0 ? identity.tickers.join(' · ') : '없습니다',
          },
          { label: '산업', value: profile?.industry ?? '확인되지 않았습니다' },
          { label: '섹터', value: profile?.sector ?? '확인되지 않았습니다' },
          {
            label: '법인·토큰 식별',
            value: '법인 등록번호나 토큰 컨트랙트 같은 추가 식별자는 이 패킷에 실리지 않습니다.',
          },
        ]}
      />
    </AssetSection>
  );
}

function BusinessTab({ blocks }: TabProps) {
  const sector = readSectorContext(blocks.business_sector_context);
  const exposure = readExposure(blocks.exposure_impact);
  return (
    <>
      <AssetSection
        block={blocks.business_sector_context}
        blockKey="business_sector_context"
        headingLevel="h3"
        title="산업 분류"
      >
        <PropertyList
          items={[
            {
              label: '분류',
              value:
                sector.taxonomyLabels.length > 0
                  ? sector.taxonomyLabels.join(' · ')
                  : '분류가 확인되지 않았습니다.',
            },
          ]}
        />
      </AssetSection>
      <AssetSection
        block={blocks.exposure_impact}
        blockKey="exposure_impact"
        description="제품·부문·지역·고객·공급자는 관계 그래프에서 나옵니다."
        headingLevel="h3"
        title="제품·부문·지역·고객·공급자"
      >
        <PropertyList
          items={[
            {
              label: '고객·공급자 관계',
              value:
                exposure.acceptedEconomicCount > 0
                  ? `승인된 경제 관계 ${exposure.acceptedEconomicCount}건`
                  : '승인된 고객·공급자 관계가 없습니다.',
            },
            {
              label: '부문·지역 분해',
              value:
                '부문별·지역별 매출 분해는 이 패킷에 실리지 않습니다. 관계 개수로만 확인됩니다.',
            },
          ]}
        />
      </AssetSection>
    </>
  );
}

function FinancialsTab({ blocks, stockDetail }: TabProps) {
  const peers = readPeerComparison(blocks.comparable_financial_facts);
  const groups = (stockDetail?.companyMetrics ?? []).filter(
    (group) => group.availability === 'available',
  );
  return (
    <AssetSection
      block={blocks.comparable_financial_facts}
      blockKey="comparable_financial_facts"
      headingLevel="h3"
      title="재무 bridge 와 단위 경제"
    >
      <PropertyList
        items={[
          { label: '관측된 지표', value: `${peers.totalMetricCount}개` },
          {
            label: '출처 확인된 묶음',
            value: groups.length > 0 ? `${groups.length}개` : '없습니다.',
          },
          {
            label: '재무 bridge',
            value:
              '기간 사이 변화를 항목별로 잇는 bridge 는 아직 만들어지지 않았습니다. 관측값만 있습니다.',
          },
          {
            label: '단위 경제',
            value: '단위당 수익·비용 구조를 정의하는 표가 이 화면에 연결되지 않았습니다.',
          },
        ]}
      />
    </AssetSection>
  );
}

function PeersTab({ blocks }: TabProps) {
  return (
    <AssetSection
      block={blocks.comparable_financial_facts}
      blockKey="comparable_financial_facts"
      description="정본 REQ-PROD-021 — 비교 불가능한 지표를 감추지 않고 이유와 함께 표시합니다."
      headingLevel="h3"
      title="동종 비교와 순위 가능 여부"
    >
      <ComparabilityNotice view={readPeerComparison(blocks.comparable_financial_facts)} />
    </AssetSection>
  );
}

function EventsTab({ blocks }: TabProps) {
  const events = readRecentEvents(blocks.recent_events_surprise);
  return (
    <AssetSection
      block={blocks.recent_events_surprise}
      blockKey="recent_events_surprise"
      headingLevel="h3"
      title="사건 타임라인"
    >
      {/* 제품 경계 — 사유는 `asset-above-the-fold.tsx` 의 같은 자리에 적었다. */}
      {events.events.length > 0 ? (
        <p className={styles.sourceCaveat}>
          아래는 수집된 사건 기록을 제목 그대로 옮긴 것입니다. 외부 기관의 의견이나 목표 수치가
          제목에 섞여 있을 수 있으며, 그것은 이 화면의 판단이 아닙니다.
        </p>
      ) : null}
      {events.events.length > 0 ? (
        <StructuredList className={styles.eventList}>
          {events.events.map((event) => (
            <li key={event.id}>
              <strong>{event.title}</strong>
              {event.knownAt ? (
                <time dateTime={event.knownAt}>{formatDate(event.knownAt, true)}</time>
              ) : null}
            </li>
          ))}
        </StructuredList>
      ) : null}
      <PropertyList
        items={[
          { label: '실린 범위', value: describeEventCoverage(events) },
          {
            label: '기대 대비 차이',
            value:
              events.largestSurpriseMagnitude === null
                ? '기록되지 않았습니다.'
                : `${events.surpriseCount}건 기록됨 (가장 큰 차이 ${events.largestSurpriseMagnitude.toFixed(2)})`,
          },
        ]}
      />
    </AssetSection>
  );
}

function ThemesTab({ blocks }: TabProps) {
  const sector = readSectorContext(blocks.business_sector_context);
  return (
    <AssetSection
      block={blocks.business_sector_context}
      blockKey="business_sector_context"
      headingLevel="h3"
      title="테마·내러티브·국면"
    >
      <PropertyList
        items={[
          {
            label: '산업 분류',
            value:
              sector.taxonomyLabels.length > 0
                ? sector.taxonomyLabels.join(' · ')
                : '확인되지 않았습니다.',
          },
          {
            label: '플레이북',
            value: sector.playbookLabel
              ? sector.playbookLabel
              : sector.hasPlaybook
                ? '배정되어 있으나 이름을 아직 옮기지 못했습니다.'
                : '배정되지 않았습니다.',
          },
          {
            label: '테마 소속',
            value: '이 종목이 어떤 테마의 대표·핵심·간접 구성원인지는 이 패킷에 실리지 않습니다.',
          },
          {
            label: '국면',
            value: '테마 국면(형성·가속·과열·약화)은 테마 화면이 소유하며 여기로 오지 않습니다.',
          },
        ]}
      />
    </AssetSection>
  );
}

function ExposureTab({ blocks }: TabProps) {
  const exposure = readExposure(blocks.exposure_impact);
  return (
    <AssetSection
      block={blocks.exposure_impact}
      blockKey="exposure_impact"
      description="관계는 승인 등급별 개수로 표시합니다. 상대 기업의 이름은 이 패킷에 실리지 않습니다."
      headingLevel="h3"
      title="노출과 영향 경로"
    >
      <PropertyList
        items={[
          { label: '승인된 경제 관계', value: `${exposure.acceptedEconomicCount}건` },
          {
            label: '승인된 구조 관계 (상대가 종목)',
            value: `${exposure.acceptedStructuralCount}건`,
          },
          {
            label: '승인된 구조 관계 (상대가 분류 노드)',
            value: `${exposure.acceptedStructuralNonAssetCount}건 — 지목하는 종목이 없어 노출로 세지 않습니다.`,
          },
          {
            label: '승인된 약한 연관',
            value: `${exposure.acceptedWeakCount}건 — 함께 편입·공동 보유·문서 유사도이며 노출이 아닙니다.`,
          },
          {
            label: '정책 없는 승인 관계',
            value: `${exposure.acceptedUnpolicedCount}건 — 승인됐지만 노출을 지탱할 정책 근거가 없습니다.`,
          },
          {
            label: '검증 대기',
            value: `${exposure.quarantinedCount}건 — 강한 근거 자리에 그리지 않았습니다.`,
          },
          {
            label: '상대 기업 이름',
            value:
              '패킷에 실리지 않습니다. 문서 유사도로 대신 채우면 근접을 경제적 노출로 바꿔 말하는 것이라 채우지 않았습니다.',
          },
        ]}
      />
      {exposure.impactTargets.length > 0 ? (
        <TruthClaimRow
          basis={IMPACT_PATH_BASIS}
          binding={IMPACT_PATH_TRUTH}
          itemCount={exposure.impactPathCount}
        >
          <StructuredList className={styles.tickerList} aria-label="영향 경로가 지목한 종목 코드">
            {exposure.impactTargets.map((target) => (
              <li key={`${target.market}:${target.ticker}`}>{target.ticker}</li>
            ))}
          </StructuredList>
        </TruthClaimRow>
      ) : null}
    </AssetSection>
  );
}

function MarketTab({ blocks }: TabProps) {
  const reaction = readMarketReaction(blocks.market_reaction_tradability);
  return (
    <AssetSection
      block={blocks.market_reaction_tradability}
      blockKey="market_reaction_tradability"
      headingLevel="h3"
      title="시장 반응과 포지셔닝"
    >
      <PropertyList
        items={[
          {
            label: '사건 대비 가격 반응',
            value:
              reaction.directionLabel ??
              (reaction.hasDirection
                ? '기록된 반응 판정을 아직 문구로 옮기지 못했습니다.'
                : '반응 판정이 기록되지 않았습니다.'),
          },
          {
            label: '반응 크기',
            value:
              reaction.strength === null ? '기록되지 않았습니다.' : reaction.strength.toFixed(3),
          },
          {
            label: '관측 시각',
            value: reaction.asOf ? formatDate(reaction.asOf, true) : '기록되지 않았습니다.',
          },
          {
            label: '수급·포지셔닝',
            value: '보유 주체별 수급과 포지셔닝은 이 패킷에 실리지 않습니다.',
          },
        ]}
      />
    </AssetSection>
  );
}

function ValuationTab({ blocks }: TabProps) {
  const expectation = readExpectation(blocks.expectation_priced_in);
  const valuation = readValuation(blocks.valuation_market_implied);
  const thesis = readThesis(blocks.multi_horizon_thesis);
  return (
    <>
      <AssetSection
        block={blocks.valuation_market_implied}
        blockKey="valuation_market_implied"
        headingLevel="h3"
        title="밸류에이션"
      >
        <PropertyList items={describeValuationBands(valuation)} />
      </AssetSection>
      <AssetSection
        block={blocks.expectation_priced_in}
        blockKey="expectation_priced_in"
        headingLevel="h3"
        title="시장이 반영한 기대"
      >
        <PropertyList
          items={[{ label: '기록된 기대 개정', value: `${expectation.revisionCount}건` }]}
        />
      </AssetSection>
      <AssetSection
        block={blocks.multi_horizon_thesis}
        blockKey="multi_horizon_thesis"
        headingLevel="h3"
        title="기간별 시나리오"
      >
        <PropertyList items={describeThesis(thesis)} />
      </AssetSection>
    </>
  );
}

function SourcesTab({ blocks, stockDetail }: TabProps) {
  const coverage = readCoverage(blocks.coverage_freshness_uncertainty);
  const sources = stockDetail?.deepReport.sources ?? [];
  const news = stockDetail?.relatedNews ?? [];
  const glossary = buildGlossaryIndex(stockDetail?.glossaryTerms);
  return (
    <>
      <AssetSection
        block={blocks.coverage_freshness_uncertainty}
        blockKey="coverage_freshness_uncertainty"
        description="이 종목을 덮는 자료 묶음의 상태와, 화면이 연결할 수 있는 원문 링크."
        headingLevel="h3"
        title="출처와 자료 연결"
      >
        <PropertyList
          items={[
            {
              label: '덮는 자료 묶음',
              value: `${coverage.observationCount}개 (정상 ${coverage.healthyCount}개)`,
            },
            ...coverage.byState.map((bucket) => ({
              label: bucket.label,
              value: `${bucket.count}개`,
            })),
            // 위 "덮는 자료 묶음" 총계와 아래 상태별 개수가 항상 맞아떨어지게 한다.
            // 이름을 못 옮긴 상태를 세지 않으면 새 상태값이 화면에서 소리 없이 사라진다.
            ...(coverage.otherCount > 0
              ? [
                  {
                    label: '분류하지 못한 상태',
                    value: `${coverage.otherCount}개 — 아직 이름을 옮기지 못한 상태입니다.`,
                  },
                ]
              : []),
            {
              label: '최근 관측',
              value: coverage.latestObservedAt
                ? formatDate(coverage.latestObservedAt, true)
                : '기록되지 않았습니다.',
            },
            {
              label: '공식 홈페이지·IR·공시 링크',
              value:
                '자료 묶음의 원본 위치를 사람이 읽을 수 있는 링크로 옮기는 표가 아직 없습니다. 내부 식별자를 그대로 적지 않았습니다.',
            },
          ]}
        />
        {sources.length > 0 ? (
          <StructuredList>
            {sources.map((source) => (
              <li key={source.url}>
                <TextLink href={source.url} target="_blank" rel="noreferrer" motion="quiet">
                  {source.label}
                </TextLink>
              </li>
            ))}
          </StructuredList>
        ) : null}
        {/*
        연결된 뉴스는 제목과 맥락만 싣는다. 이 목록(`dashboardInsightSchema`)에는
        원문 URL 필드가 없어서, 있는 것처럼 링크를 만들면 없는 연결을 지어내는
        것이 된다.
      */}
        {news.length > 0 ? (
          <StructuredList className={styles.eventList}>
            {news.slice(0, 8).map((item) => (
              <li key={item.id}>
                <strong>{item.title}</strong>
                <span>{item.context}</span>
              </li>
            ))}
          </StructuredList>
        ) : null}
      </AssetSection>
      {/*
      용어 목록은 CAV 블록이 아니라 `stockDetail.glossaryTerms` 에서 온다.
      `AssetSection` 은 블록 상태를 요구하므로 감싸지 않고, 대신 같은 섹션
      골격만 쓴다 — 없는 블록 상태를 지어내는 것보다 형제 섹션이 정직하다.
    */}
      <GlossarySection glossary={glossary} />
    </>
  );
}

/** 출처 탭의 용어 목록. 블록이 없으므로 섹션 골격만 빌려 쓴다. */
function GlossarySection({ glossary }: { glossary: GlossaryIndex }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={styles.section} data-slot="asset-glossary">
      <header className={styles.sectionHeader}>
        <h3 id={headingId}>이 종목의 용어</h3>
        <p>이 종목을 읽는 데 필요한 낱말의 뜻을 한자리에 모았습니다.</p>
      </header>
      <GlossaryPanel index={glossary} />
    </section>
  );
}

function ProvenanceTab({ blocks, packet }: TabProps) {
  const derivation = readDerivation(blocks.derivation_release_manifest);
  return (
    <AssetSection
      block={blocks.derivation_release_manifest}
      blockKey="derivation_release_manifest"
      description="이 패킷이 어떤 릴리스와 의미 스냅샷 위에서 만들어졌는지."
      headingLevel="h3"
      title="도출 과정과 릴리스 대장"
    >
      <PropertyList
        items={[
          {
            label: '기록된 도출 과정',
            value:
              derivation.derivationCount > 0
                ? `${derivation.derivationCount}건`
                : '이 종목에 대해 기록된 도출 과정이 없습니다. 감사 사슬이 아직 닫히지 않았습니다.',
          },
          {
            label: '의미 스냅샷',
            value: derivation.hasSemanticSnapshot ? '고정되어 있습니다.' : '고정되지 않았습니다.',
          },
          // 릴리스는 블록 payload 가 아니라 **패킷 행**에 있다. payload 에서
          // 찾던 동안 이 줄은 297패킷 전부에 "없습니다" 를 그렸다.
          { label: '릴리스', value: packet.releaseId },
          { label: '패킷 개정', value: `${packet.revisionNo}차` },
        ]}
      />
    </AssetSection>
  );
}

const tabRenderers: Record<AssetTabId, (props: TabProps) => React.JSX.Element> = {
  identity: IdentityTab,
  business: BusinessTab,
  financials: FinancialsTab,
  peers: PeersTab,
  events: EventsTab,
  themes: ThemesTab,
  exposure: ExposureTab,
  market: MarketTab,
  valuation: ValuationTab,
  sources: SourcesTab,
  provenance: ProvenanceTab,
};

export function AssetTabPanel({
  packet,
  stockDetail,
  tab,
}: {
  packet: CommonAssetViewPacket;
  stockDetail: StockDetail | null;
  tab: AssetTabDefinition;
}) {
  const Renderer = tabRenderers[tab.id];
  const blocks = indexBlocks(packet);
  return (
    <div data-slot="asset-tab-panel" data-tab={tab.id}>
      <Renderer blocks={blocks} packet={packet} stockDetail={stockDetail} />
    </div>
  );
}
