import { useId } from 'react';

import styles from './asset-deep-dive.module.css';

import { annotateSection, GlossarySegments, type GlossaryIndex } from '@/features/glossary';
import { DepthGate } from '@/shared/depth';
import { DataQualityPopover, StatusBadge } from '@/shared/ui/feedback';
import { AvailabilityNotice, StructuredList, WorkspaceState } from '@/shared/ui/workspace';
import type { ResponseMeta, StockLearningCard } from '@stock-insight/contracts';

/**
 * 학습 카드 — `REQ-PROD-003` 의 5분 예산을 실제로 맡는 자리.
 *
 * ## 죽은 화면에서 들어올린 것
 *
 * `entities/stock/ui/stock-detail.tsx` 는 어떤 라우트도 렌더하지 않는 파일이었지만
 * 카드별 `StatusBadge` + `DataQualityPopover` 를 `testId` 와 함께 붙이는 유일한
 * 기존 구현이었다. 그 배치를 그대로 옮기고(이름만 이 화면에 맞췄다) 원본은 지웠다.
 *
 * ## `undefined` 와 `[]` 는 다른 사실이다
 *
 * `apps/api` 의 `mapStockDetailDatabaseRow` 는 카드가 하나도 없으면 필드를 아예
 * 싣지 않고, `sanitizeStockDetail` 은 `undefined` 는 지우고 `[]` 는 남긴다. 즉
 * 빈 배열은 "카드가 있었는데 읽기 모델의 게이트를 지나며 전부 떨어졌다" 를
 * 뜻한다. 둘을 한 문구로 뭉개면 UX 헌법 6번이 막는 상태 위장이다.
 *
 * 게이트는 넷이다. 제품 경계(매수·매도·목표주가 문구 금지), 파이프라인 오류
 * 문자열(`API call failed after 3 retries`), 1인칭 어시스턴트 발화
 * (`주인님, … 보고서를 작성했습니다`), 그리고 투자 스탠스(`조건부 보유 논리`,
 * `…로 보는 게 맞습니다`)다. 마지막 것 때문에 **오늘 라이브 8장이 전부
 * 떨어진다** — 그래서 이 화면이 실제로 그리는 것은 카드가 아니라 아래의 이름
 * 붙은 부재다.
 *
 * 어느 쪽으로 떨어졌는지는 이 화면이 구분하지 않는다. 계약에 사유 필드를
 * 늘리는 것은 이 화면의 일이 아니고 — `StockLearningCard` 는 네 개 읽기 경로가
 * 공유한다 — 아래 문구는 네 경우 모두에 대해 참이다. 게이트 자체는
 * `apps/api/src/stocks/read-model.ts` 한 곳에만 있고 여기에 사본을 두지 않는다.
 *
 * ## 출처 없는 카드를 검증된 것처럼 보이게 하지 않는다
 *
 * `availability` 는 서버가 이미 `text_only` 로 실어 온다(라이브 8장 중 7장).
 * 그 값을 그대로 배지와 popover 에 넘기고, 출처 줄은 **없을 때도 그린다** —
 * 조건부로 지우면 근거 없는 카드가 근거 있는 카드와 똑같이 보인다.
 */

/**
 * 마크다운 본문을 한 문단으로 접는다. `stock-detail.tsx` 에서 그대로 들어올렸다.
 * 카드 본문은 짧은 요약이라 렌더러를 붙일 이유가 없고, 기호를 남기면 산문
 * 주석(용어 밑줄)이 기호 한가운데를 자른다.
 */
export function summarizeCardMarkdown(markdown: string): string {
  const text = markdown
    .replaceAll(/```[\s\S]*?```/g, ' ')
    .replaceAll(/[#>*_`\-[\]]+/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();
  return text.length > 260 ? `${text.slice(0, 260)}…` : text;
}

function CardSources({ card }: { card: StockLearningCard }) {
  const names = card.sources.map((source) => source.label.trim()).filter((name) => name.length > 0);
  return (
    <p className={styles.learningCardSource} data-slot="learning-card-source">
      {names.length > 0
        ? `출처 ${names.join(' · ')}`
        : '출처가 연결되지 않았습니다. 정리된 설명이며 원문 확인이 필요합니다.'}
    </p>
  );
}

function LearningCard({
  card,
  exclude,
  glossary,
  source,
}: {
  card: StockLearningCard;
  exclude: ReadonlySet<string>;
  glossary: GlossaryIndex;
  source: ResponseMeta['source'];
}) {
  const body = card.bodyMarkdown ? summarizeCardMarkdown(card.bodyMarkdown) : '';
  // 카드 하나가 곧 한 블록이다. 본문과 불릿이 **하나의 5개 예산**을 나눠 쓰고,
  // 계획은 렌더 전에 확정되므로 팝오버를 열어 다시 렌더해도 주석이 그대로다.
  const [bodySegments = [], ...bulletSegments] = annotateSection(
    glossary,
    [body, ...card.bullets],
    { exclude },
  );

  return (
    <article
      className={styles.learningCard}
      data-availability={card.availability}
      data-testid={`learning-card-${card.cardKey}`}
    >
      <div className={styles.learningCardHead}>
        <span>{card.section}</span>
        <div className={styles.learningCardQuality}>
          <StatusBadge
            availability={card.availability}
            label="학습 카드"
            source={source}
            testId={`learning-card-status-${card.cardKey}`}
          />
          <DataQualityPopover
            availability={card.availability}
            label="학습 카드"
            placement="above"
            source={source}
            testId={`learning-card-quality-popover-${card.cardKey}`}
            {...(card.updatedAt ? { updatedAt: card.updatedAt } : {})}
          />
        </div>
      </div>
      <strong>{card.title}</strong>
      {body.length > 0 ? (
        <p>
          <GlossarySegments segments={bodySegments} />
        </p>
      ) : null}
      {card.bullets.length > 0 ? (
        <DepthGate at="standard" label={`${card.title} 세부 항목`}>
          <StructuredList>
            {card.bullets.map((bullet, index) => (
              <li key={bullet}>
                <GlossarySegments
                  segments={bulletSegments[index] ?? [{ kind: 'text', text: bullet, start: 0 }]}
                />
              </li>
            ))}
          </StructuredList>
        </DepthGate>
      ) : null}
      <CardSources card={card} />
    </article>
  );
}

export function AssetLearningCards({
  cards,
  exclude,
  glossary,
  source,
}: {
  cards: readonly StockLearningCard[] | undefined;
  exclude: ReadonlySet<string>;
  glossary: GlossaryIndex;
  source: ResponseMeta['source'];
}) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className={styles.section}
      data-slot="asset-learning"
      data-learning-state={
        cards === undefined ? 'unsupported' : cards.length === 0 ? 'empty' : 'ready'
      }
    >
      <header className={styles.sectionHeader}>
        <h2 id={headingId}>처음 보는 종목이라면</h2>
        <p>
          이 종목을 처음 보는 사람이 먼저 읽을 수 있게 정리한 카드입니다. 판단이 아니라 설명이며,
          출처가 연결되지 않은 카드는 그렇게 적었습니다.
        </p>
        {/*
          카드 본문과 세부 항목은 수집 당시 기록을 문장 그대로 옮긴 것이다.
          거기에는 외부 시세 도구가 남긴 코드(예: 장 구분 코드)나 수집 시점의
          숫자가 섞여 들어올 수 있고, 그것을 고쳐 쓰면 기록을 위조하는 것이 된다.
          그래서 고치지 않고 **무엇이 섞여 있을 수 있는지 먼저 적는다** — 사건
          제목에 쓴 것과 같은 처리다(`asset-above-the-fold.tsx` 의 단서 문구).
        */}
        <p className={styles.sourceCaveat}>
          본문은 수집 당시 기록을 그대로 옮긴 것이라 외부 도구가 남긴 코드나 그때의 숫자가 섞여 있을
          수 있으며, 그것은 이 화면의 어휘도 판단도 아닙니다.
        </p>
      </header>

      {cards === undefined ? (
        <AvailabilityNotice availability="missing" />
      ) : cards.length === 0 ? (
        // 공용 `empty` 문구는 "아직 수집되지 않았다" 로 읽힌다. 여기서 빈 배열은
        // 그 반대 — 카드가 있었고 제품 경계 필터를 지나며 전부 떨어졌다는 뜻이다.
        <WorkspaceState
          kind="empty"
          title="표시할 수 있는 카드가 없습니다"
          description="정리된 카드가 있었지만 이 화면에 실을 수 있는 것이 남지 않았습니다. 아직 만들어지지 않은 것과는 다른 상태입니다."
        />
      ) : (
        <div className={styles.learningCards} data-testid="learning-cards">
          {cards.map((card) => (
            <LearningCard
              card={card}
              exclude={exclude}
              glossary={glossary}
              key={card.cardKey}
              source={source}
            />
          ))}
        </div>
      )}
    </section>
  );
}
