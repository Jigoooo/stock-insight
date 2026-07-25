# Stock Insight 오프라인 재해복구

## 보관 계약

DR bundle은 OneDrive 장애 도메인에 `age`로 암호화해 저장한다. 각 bundle은 다음을 함께 포함한다.

- 동일 snapshot의 `research_app.dump`, `globals.sql`, strict `RESTORE_METADATA`, checksums
- production API/App OCI image archive와 검증 metadata
- 배포 당시 exact Git commit/tree의 source archive
- 이 runbook과 모든 restore/verification script

복호화 identity는 Windows 사용자 DPAPI로 보호한 별도 recovery blob으로 보관한다. OneDrive 동기화 상태와 외부 bundle SHA-256을 마지막 성공 기준으로 감시한다.

## 새 호스트 복구

1. DPAPI recovery blob 또는 별도 보관 identity에서 age identity를 복구한다.
2. `age -d -i IDENTITY stock-insight-dr-*.tar.zst.age | zstd -d | tar -xf -`로 bundle을 푼다.
3. `sha256sum -c SOURCE_SHA256SUMS`와 logical/image bundle 내부 checksum을 검증한다.
4. source archive를 풀고 `ops/scripts/verify-release-image-bundle.sh IMAGE_DIR ENV_FILE`로 clean-daemon load proof를 수행한다.
5. `ops/scripts/verify-research-app-restore.sh LOGICAL_BACKUP_DIR`로 격리 full restore, strict globals/parity, `pg_amcheck`를 통과시킨다.
6. 검증된 image IDs와 DB volume만 production Compose에 연결한다. 검증 전 DNS·edge 전환은 금지한다.

## 실패 처리

checksum, source tree, role/membership hash, extension version, row/sequence/Timescale parity 중 하나라도 다르면 해당 bundle은 사용하지 않는다. 이전 GREEN bundle로 후퇴하고 원인 기록 후 새 bundle을 생성한다.
