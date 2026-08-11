'use client';

import { useId, useState } from 'react';

import styles from './glossary.module.css';

import type { GlossaryEntry } from '@/features/glossary/model/glossary-index';

/*
 * 산문 한가운데 놓이는 용어 하나.
 *
 * ## 왜 `<button>` 인가
 *
 * `<details>` 는 flow content 라 `<p>` 안에 넣으면 브라우저 파서가 문단을
 * 쪼개고 SSR 마크업과 하이드레이션 결과가 어긋난다. `<button>` 은 phrasing
 * content 라 어디에 놓아도 안전하고, 키보드 포커스·Enter/Space·`aria-expanded`
 * 가 전부 기본 동작으로 따라온다.
 *
 * ## 닫혀 있을 때 정의가 DOM 에 없어도 되는 이유
 *
 * 이 트리거는 도달 경로가 **둘 중 하나**가 아니다. 같은 정의가
 * `GlossaryPanel` 에 항상 펼쳐진 채로 있다(출처 탭). 그래서 여기서 접는 것은
 * 삭제가 아니라 중복 제거이고, 검색·인쇄·보조기술이 닿는 자리가 사라지지 않는다.
 *
 * ## 출처를 침묵으로 남기지 않는다
 *
 * 라이브 용어 16개는 **전부** 출처가 0건이다. 출처 줄을 조건부로 지우면 근거
 * 없는 정의가 근거 있는 정의와 똑같이 보인다. 그래서 없을 때도 없다고 적는다.
 */

/** 팝오버 폭 상한과 뷰포트 양쪽에 남기는 여백. CSS 의 값과 같아야 한다. */
const POPOVER_MAX_WIDTH = 320;
const VIEWPORT_GUTTER = 12;

/**
 * 팝오버가 뷰포트 밖으로 나가지 않도록 가로 위치를 **계산해서** 정한다.
 *
 * 2026-08-11, 390px 에서 실제 브라우저로 재어 보고 넣었다. 트리거가 줄 오른쪽에
 * 있으면 `left: 0` 짜리 320px 팝오버의 오른쪽 끝이 421px 로 나가고
 * `documentElement.scrollWidth` 가 421 이 된다 — UX 헌법 4번(390px 가로 오버플로
 * 금지)은 릴리스를 막는 하드 불변식이다. CSS 만으로는 "트리거가 뷰포트의 어디에
 * 있는가" 를 알 수 없어서, 그 한 가지만 열 때 재고 나머지는 CSS 에 맡긴다.
 *
 * 폭을 명시하는 이유: 위치를 정하는 시점에는 아직 팝오버가 없어 실측 폭을 쓸 수
 * 없다. 상한을 그대로 폭으로 고정하면 계산과 렌더가 어긋날 자리가 없어진다.
 */
function clampPopover(trigger: DOMRect): { left: number; width: number } {
  const viewport = document.documentElement.clientWidth;
  const width = Math.min(POPOVER_MAX_WIDTH, Math.max(viewport - VIEWPORT_GUTTER * 2, 0));
  const maxLeft = Math.max(viewport - VIEWPORT_GUTTER - width, VIEWPORT_GUTTER);
  const desired = Math.min(Math.max(trigger.left, VIEWPORT_GUTTER), maxLeft);
  // 팝오버는 트리거를 감싸는 span 기준이므로 화면 좌표가 아니라 **차이**를 준다.
  return { left: desired - trigger.left, width };
}

export function GlossaryTerm({ entry, text }: { entry: GlossaryEntry; text: string }) {
  const [placement, setPlacement] = useState<{ left: number; width: number } | null>(null);
  const popoverId = useId();
  const open = placement !== null;

  const close = () => setPlacement(null);
  const openAt = (element: HTMLElement) =>
    setPlacement(clampPopover(element.getBoundingClientRect()));

  return (
    <span className={styles.annotated}>
      <button
        aria-controls={popoverId}
        aria-expanded={open}
        className={styles.term}
        data-availability={entry.availability}
        data-slot="glossary-term-trigger"
        data-testid={`glossary-term-${entry.normalized}`}
        onBlur={close}
        /*
          클릭은 **토글이 아니라 항상 열기**다. 토글로 두면 hover 로 열린 상태에서
          클릭이 닫아 버리는데, 포인터는 여전히 낱말 위에 있고 팝오버는 낱말 아래에
          있어 `mouseenter` 도 `mouseleave` 도 다시 오지 않는다. 낱말을 벗어났다가
          돌아오기 전까지 영영 안 열린다. 닫기는 포인터가 벗어날 때 · 포커스를 잃을
          때 · Escape 세 경로가 맡는다. 다시 열면 위치도 다시 계산되므로 창 크기가
          바뀐 뒤 클릭이 곧 재정렬이 된다.
        */
        onClick={(event) => openAt(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.stopPropagation();
            close();
          }
        }}
        onMouseEnter={(event) => openAt(event.currentTarget)}
        onMouseLeave={close}
        type="button"
      >
        {text}
      </button>
      {placement === null ? null : (
        <span
          className={styles.termPopover}
          data-slot="glossary-term-popover"
          id={popoverId}
          role="note"
          style={{ left: `${placement.left}px`, width: `${placement.width}px` }}
        >
          <b>{entry.term}</b>
          <span>{entry.definition}</span>
          <span className={styles.termSource} data-slot="glossary-term-source">
            {entry.sourceNames.length > 0
              ? `출처 ${entry.sourceNames.join(' · ')}`
              : '출처가 연결되지 않았습니다. 정리된 설명이며 원문 확인이 필요합니다.'}
          </span>
        </span>
      )}
    </span>
  );
}
