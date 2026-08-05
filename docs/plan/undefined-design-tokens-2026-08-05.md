# 정의되지 않은 디자인 토큰 아홉 개 — 실제 결함 (2026-08-05)

원격에서 들어온 커밋(`2e7a1e7` 병합 이전 묶음)이 **정의되지 않은 CSS 변수를 쓰는
컴포넌트**를 들여왔다. `apps/web/test/design-profile-contract.test.ts` 가 그것을
잡아 마스터가 빨갛다.

테스트 이름은 *"lets a complete alternative profile resolve every component
token"* 이지만, 실제로는 **기본 프로파일에서도 안 풀린다.** 픽스처 문제가 아니다.

## 잃은 것

`var(--정의없음)` 은 폴백이 없으면 **선언 자체가 무효**다. 색이 기본값으로
떨어지는 게 아니라 그 속성이 적용되지 않는다.

| 토큰 | 쓰는 곳 | 제품 여부 |
| --- | --- | --- |
| `--color-success` | `shared/ui/feedback/feedback.module.css` | **제품 공용** |
| `--color-success-text` | 같음 | **제품 공용** |
| `--color-accent-text` | 같음 | **제품 공용** |
| `--shadow-xs` | `shared/ui/feedback`, `shared/ui/data-grid` | **제품 공용** |
| `--color-focus-ring` | `shared/ui/data-grid` | **제품 공용 · 접근성** |
| `--color-warning` | `shared/ui/identity-content` | **제품 공용** |
| `--color-danger` | `pages/ui-lab/...` | ui-lab |
| `--color-danger-text` | `pages/ui-lab/...` | ui-lab |
| `--color-surface-hover` | `pages/ui-lab/...` | ui-lab |

**여섯 개가 제품 공용 컴포넌트에 있다.** 피드백의 성공 색, identity 의 경고 색,
데이터 그리드의 **포커스 링**이 지금 적용되지 않는다. 포커스 링은 키보드 사용자가
어디에 있는지 보는 수단이라 접근성 문제다.

## 값을 내가 정하지 않는 이유, 그리고 예외 둘

기존 프로파일에 있는 토큰을 전수로 확인했다.

```
market-graphite  --color-focus · --shadow-hover · --shadow-panel · --shadow-raised
의미색(danger/success/warning)  어느 프로파일에도 없다
```

즉 원격은 **의미색 체계를 새로 도입**하면서 정의를 안 넣었다. 위험·성공·경고
색과 그 위의 텍스트 색은 팔레트 결정이고, 내가 여섯 색을 지어내면 오늘
`calm-market` 대비를 표면별로 계산해서 고친 것과 정반대로 간다 — 근거 없이 색을
만드는 것이다.

**기존 결정에서 유도되는 것 둘은 예외다:**

- `--color-focus-ring` — `--color-focus`(#20211f)가 이미 있다. 별칭은 창작이
  아니라 이미 내린 결정을 잇는 것이고, 접근성이라 미룰 값이 아니다
- `--shadow-xs` — `--shadow-hover`/`panel`/`raised` 가 있으므로 가장 얕은 단계의
  연장으로 유도할 수 있다

이 둘도 이 문서에서는 **제안만** 한다. 토큰 이름을 늘리는 것은 디자인 계약을
넓히는 일이라 소유자 확인이 먼저다.

## 결정이 필요한 것

1. **여섯 의미색의 값** — danger / success / warning + danger-text /
   success-text / accent-text. 프로파일마다 표면이 달라서 **프로파일별로 재야
   한다**(오늘 `#696a64` 를 `calm-market` 에 그대로 썼다가 4.28 로 미달한 것이
   그 증거다)
2. **`--color-surface-hover`** — ui-lab 전용이라 급하지 않다
3. **`--color-focus-ring` 과 `--shadow-xs`** 를 별칭/유도로 채울지, 아니면
   독립 값으로 정의할지

## 함께 남기는 것

이 결함은 **테스트가 잡았다.** `design-profile-contract` 가 없었으면 포커스 링이
사라진 채로 배포됐을 것이다. 같은 날 발견한 다른 두 건(크립토 게이트의 낡은 헤딩
단언, `1edcf81` 이 잃은 목록 role)과 달리 이건 게이트가 **살아 있어서** 잡혔다.

나머지 두 실패(`v3 research workspace structure`,
`Task 1 product shared UI adoption`)는 아직 진단하지 않았다.
