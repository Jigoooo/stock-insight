# 정본 번들 errata

정본 [`stock-crypto-investment-context-world-model-v2-final/`](./stock-crypto-investment-context-world-model-v2-final/)
는 2026-08-07 에 동결됐고 `SHA256SUMS.txt` 31개 파일이 전부 일치한다(2026-08-10 재확인).

동결된 파일은 **고치지 않는다.** 번들 README §34 는 "코드·migration·contract 에서 표현
불가능한 반례"가 있을 때만 canonical 문서를 수정한다고 규정하고, 아래 항목은 그런 반례가
아니라 문서 표의 누락이다. 봉인을 깨는 비용이 이득보다 크므로 여기에 기록만 남긴다.

## E-001 — truth class 표가 14종 중 13종만 싣고 있다

| 위치 | 내용 |
| --- | --- |
| `canonical/00-architecture-constitution.md` §4 표 | **13종** |
| `contracts/truth-classes.json` | **14종** (`OUTCOME` 포함) |
| 같은 문서 §3 semantic type flow | `… → OUTCOME/EVALUATION` 로 끝난다 |

§3 의 흐름과 `contracts/truth-classes.json` 이 이미 `OUTCOME` 을 규정하므로 **정본의 의미는
14종이 맞고, §4 표만 한 행이 빠져 있다.**

구현은 이미 14종을 따랐다 — 마이그레이션 085 가 truth class 바인딩 근거에
"none of the fourteen classes describes it" 라고 적고 있다
(`governance.truth_class_binding` 4·5번 행에서 확인 가능).

**따라야 할 것:** `contracts/truth-classes.json`. §4 표를 세어 클래스 수를 판단하지 마라.

**해소 조건:** 다음 Architecture RFC 로 번들을 재동결할 때 §4 표에 `OUTCOME` 행을 넣고
`MANIFEST.json` · `SHA256SUMS.txt` 를 함께 재생성한다. 그 전까지 이 파일이 정정본이다.
