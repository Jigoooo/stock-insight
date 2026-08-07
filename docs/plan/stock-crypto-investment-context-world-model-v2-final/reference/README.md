# Reference — Non-Canonical

이 디렉터리는 감사·연구·변경 이유 확인용이다.

- `master-design-monolith.md`: 5차까지 누적된 전체 Master 원본.
- `historical-rationale.md`: 과거 판단 및 설계 변화 이유.
- `research-and-source-anchors.md`: 조사 근거와 source anchor.
- `section-map.md`: 이전 Master section mapping.

**이 디렉터리의 내용은 구현 정본이 아니다. 충돌 시 `canonical/`과 `contracts/`만 따른다.**

## 제거된 항목 — `pre-freeze-split-package.zip` (2026-08-08)

Final Canonicalization 이전 분할 패키지의 보존본이었다. 이 패키지를 git 에 커밋할 때
제거했고 `SHA256SUMS.txt`·`MANIFEST.json` 에서도 뺐다.

이유: 저장소의 `.gitignore` 가 `docs/**/*.zip` 을 막는다. 그 규칙은 커밋 `e8938d4`
(*"저장소에 섞인 docs zip 제거 및 재발 방지"*)가 의식적으로 세운 것이다. zip 을 남겨두면
체크섬 목록에는 있는데 파일은 커밋되지 않아, **fresh clone 에서 `sha256sum -c` 가 실패하는
패키지**가 된다.

zip 은 비정본 보존본이었으므로 정본성에 영향이 없다 — 그 안의 내용은 이 디렉터리의
`master-design-monolith.md` 와 `section-map.md` 가 이미 담고 있다.
