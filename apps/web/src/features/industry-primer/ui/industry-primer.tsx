import styles from './industry-primer.module.css';

import type { IndustryPrimer as IndustryPrimerView } from '@/features/industry-primer/model/primer-from-playbook';
import { DepthGate } from '@/shared/depth';
import { PropertyList } from '@/shared/ui/workspace';

/**
 * "이 산업을 처음 본다면" — `REQ-PROD-003` 의 5분 예산에서 **업계 위치**를 맡는 자리.
 *
 * 오늘 이 자리가 말할 수 있는 것은 배정된 산업 이름과 분류까지다. 판단표 본문은
 * 별도 변경이 필요하다는 사실을 사유와 함께 적는다(`primer-from-playbook.ts` 헤더).
 * 빈 자리를 지워서 화면을 꽉 차 보이게 만들지 않는다 — 무엇이 없는지 아는 것이
 * 처음 보는 종목에서는 특히 정보다.
 *
 * 용어 주석은 여기에 붙이지 않는다. 아래 문구는 데이터가 아니라 제품이 쓴
 * 고정 문장이고, 고정 문장까지 주석하면 "블록당 5개" 예산이 진짜 본문에 닿기
 * 전에 소진된다.
 *
 * 깊이는 `standard` 다. 산업 이름과 분류는 게이트 **밖**이라 초보 모드에서도
 * 즉시 보이고, 게이트가 감싸는 것은 "판단표가 무엇을 담기로 했는가" 라는 해설이다.
 */
export function IndustryPrimer({ primer }: { primer: IndustryPrimerView }) {
  return (
    <div className={styles.primer} data-slot="industry-primer" data-primer-state={primer.state}>
      <PropertyList
        items={[
          {
            label: '배정된 산업',
            value:
              primer.playbookLabel ??
              (primer.state === 'not_assigned'
                ? '배정된 산업이 없습니다.'
                : '배정되어 있으나 이름을 아직 옮기지 못했습니다.'),
          },
          ...(primer.taxonomyLabels.length > 0
            ? [{ label: '분류', value: primer.taxonomyLabels.join(' · ') }]
            : []),
        ]}
      />

      <DepthGate at="standard" label="이 산업을 처음 본다면">
        <div className={styles.primerBody}>
          {primer.state === 'available' ? (
            <>
              {/*
                지표 이름만 나열하면 판단표가 아니다. 정본 04 §5 가 지표마다
                `why` 를 요구하는 이유가 그것이라, 여기서도 **왜 먼저 보는지**를
                이름과 함께 그린다.
              */}
              <p className={styles.primerLead}>
                이 산업에서는 아래 지표를 먼저 봅니다. 각 줄에 왜 그것을 먼저 보는지를 함께
                적었습니다.
              </p>
              <dl className={styles.expectationList} data-slot="industry-primer-indicators">
                {primer.indicators.map((indicator) => (
                  <div key={indicator.name}>
                    <dt>
                      {indicator.name}
                      {indicator.kindLabel ? <small> · {indicator.kindLabel}</small> : null}
                    </dt>
                    <dd>{indicator.why}</dd>
                  </div>
                ))}
              </dl>
              {primer.unnamedIndicatorCount > 0 ? (
                <p className={styles.primerAbsence}>
                  이 산업의 지표 {primer.unnamedIndicatorCount}개는 아직 한국어로 옮기지 못해 싣지
                  않았습니다.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <p className={styles.primerLead}>
                처음 보는 산업이라면 아래 세 가지를 순서대로 확인하게 됩니다. 지금 이 화면이 그 표를
                읽지 못하는 이유도 함께 적었습니다.
              </p>
              <dl className={styles.expectationList}>
                {primer.expectations.map((expectation) => (
                  <div key={expectation.title}>
                    <dt>{expectation.title}</dt>
                    <dd>{expectation.description}</dd>
                  </div>
                ))}
              </dl>
              <p className={styles.primerAbsence} data-slot="industry-primer-absence">
                {primer.absenceReason}
              </p>
            </>
          )}
        </div>
      </DepthGate>
    </div>
  );
}
