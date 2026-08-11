import { useId, type ReactNode } from 'react';

import styles from './asset-deep-dive.module.css';
import { BlockStateBadge, BlockStateNotice } from './block-state-notice';

import type { AssetBlockKey } from '@/pages/asset-deep-dive/model/asset-packet';
import { DepthGate, assignmentFor } from '@/shared/depth';
import type { CommonAssetViewBlock } from '@stock-insight/contracts/common-asset-view';

/**
 * 화면 섹션 하나 = CAV 블록 하나.
 *
 * 깊이는 **조회한다, 판단하지 않는다.** `assignmentFor(blockKey)` 가
 * `depth-assignment.ts` 의 표에서 값을 꺼내고 `DepthGate` 가 그 값 하나만
 * 받는다. 이 컴포넌트도, 이 폴더의 어떤 컴포넌트도 현재 모드를 읽지 않는다 —
 * `depth-mode-contract.test.ts` 의 "뷰 레이어가 깊이 모드 API 를 전혀 읽지
 * 않는다" 가 그것을 강제한다.
 *
 * 배정 키를 새로 만들지 않는 이유는 `asset-tabs.ts` 헤더에 적었다: 이 화면의
 * 모든 섹션은 이미 표에 있는 12개 블록 키 위에 선다.
 */
export function AssetSection({
  block,
  blockKey,
  children,
  description,
  headingLevel = 'h2',
  title,
}: {
  block: CommonAssetViewBlock;
  blockKey: AssetBlockKey;
  children?: ReactNode;
  description?: string;
  headingLevel?: 'h2' | 'h3';
  title: string;
}) {
  const headingId = useId();
  const Heading = headingLevel;
  const assignment = assignmentFor(blockKey);

  return (
    <section aria-labelledby={headingId} className={styles.section} data-block-key={blockKey}>
      <header className={styles.sectionHeader}>
        <Heading id={headingId}>{title}</Heading>
        <BlockStateBadge state={block.blockState} />
        {description ? <p>{description}</p> : null}
      </header>
      {/*
        상태 고지는 게이트 **밖**이다. 부재의 이유는 정본이 요구하는 내용
        자체이고(항목 10 coverage/uncertainty), 접힌 자리에 넣으면 "없다" 는
        사실이 한 번 더 눌린다. 게이트가 감싸는 것은 내용 쪽이다.
      */}
      <BlockStateNotice block={block} />
      {/*
        게이트 적용 여부는 **children 유무**로 가른다. 원래는
        `block.blockState === 'available'` 로 갈랐는데, 그것은 IA §4 배정표를
        blockState 로 뒤집는 것이었다: `derivation_release_manifest` 는 배정이
        research 인데 라이브 297/297 이 `partial` 이라 초보 모드에서도 항상
        펼쳐졌다. 블록 12에 대해 배정이 100% 무력화된 셈이다.
        비어 있는 게이트를 피하려던 원래 의도는 `children` 검사가 이미 채운다.
      */}
      {children ? (
        <DepthGate at={assignment.depth} className={styles.sectionBody} label={`${title} 자세히`}>
          {children}
        </DepthGate>
      ) : null}
    </section>
  );
}
