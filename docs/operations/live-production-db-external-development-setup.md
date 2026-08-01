# Stock Insight 외부 PC 운영 DB 직접 개발 설정 가이드

> 기준 시각: 2026-08-01 20:29 KST
> 저장소: `https://github.com/Jigoooo/stock-insight.git`
> 최초 도입 커밋: `f0306decc5642465379442bc79eafa3ca881fae8`
> 대상 모드: Cloudflare Access TCP를 통한 운영 `research_app` 직접 읽기·쓰기 개발

## 1. 결론

Stock Insight의 운영 DB 직접 개발 기능, Cloudflare Access 앱, TCP Tunnel route와 공개 경로 canary가 완료됐다. 새 외부 PC에서는 다음 기기별 작업만 수행한다.

1. 외부 PC에서 Age recipient를 만들고 공개 recipient만 bundle 생성자에게 전달한다.
2. recipient-encrypted bundle을 설치한 뒤 `pnpm dev:live:check`와 `pnpm dev` SSO를 한 번 실행한다.

이 모드는 기존 PostgreSQL 역할을 그대로 사용한다.

- 읽기 역할: `stock_insight_app_reader`
- 쓰기 역할: `stock_insight_app_writer`
- 데이터베이스: `research_app`

별도 개발 DB, 신규 역할, 추가 DDL은 만들지 않는다. 화면에는 `운영 DB · 실제 쓰기` 표시가 유지되며, 변경 사항은 실제 운영 데이터에 남는다.

## 2. 현재 상태

### 완료 및 실측

- `feat/prod-db-live-dev`를 `master`에 fast-forward 병합
- `origin/master` push 완료
- 최초 도입 커밋: `f0306decc5642465379442bc79eafa3ca881fae8`
- `edge-gateway-cloudflared-1` 실행 중
- connector가 `research-app-db_default`에 연결됨
- 전체 typecheck, test, build 통과
- dev-live, E2E, DB ACL 독립 보안감사 `HIGH 0 / MEDIUM 0`
- `insight-db.jigooo.com` 공개 DNS 응답 정상
- `Stock Insight DB Live Dev` Access Application 및 로그인 게이트 적용
- Tunnel Published Application `tcp://research-app-postgres:5432` 연결
- Windows host browser SSO → PostgreSQL identity guard → API → Web 실제 canary 통과
- API `/health`: HTTP 200, DB `status=ok` 3/3회, 최종 DB latency 중앙값 1,007ms
- 화면 `운영 DB · 실제 쓰기` 배너 및 로그인 폼 확인, browser JS 오류 0건
- 종료 후 canary 포트·runtime pgpass·임시 로그인 URL 잔류 0건

현재 호스트에는 Cloudflare 관리 API token이 없으며 Dashboard에서 수동 설정했다. 기존 `CLOUDFLARE_TUNNEL_TOKEN`은 connector 실행용이며 Access 앱·정책·hostname을 관리하는 token이 아니다.

## 3. 연결 구조

```text
외부 PC
  └─ cloudflared access tcp
       └─ 브라우저 SSO
            └─ insight-db.jigooo.com
                 └─ 기존 edge-gateway Cloudflare Tunnel
                      └─ tcp://research-app-postgres:5432
                           └─ research_app
                                ├─ stock_insight_app_reader
                                └─ stock_insight_app_writer
```

외부 PC의 기본 로컬 listener는 `127.0.0.1:55432`다. launcher는 이 listener가 방금 시작한 `cloudflared` process tree 소유인지 확인한 뒤에만 DB 자격증명을 사용하는 API를 시작한다.

## 4. Cloudflare Dashboard 설정

노출 창을 만들지 않도록 **Access 앱을 먼저 만들고 Tunnel route를 나중에 추가한다.**

### 4.1 Access 앱 생성

1. Cloudflare Zero Trust에 로그인한다.
2. **Access controls → Applications**로 이동한다.
3. **Add an application → Self-hosted**를 선택한다.
4. 다음 값을 입력한다.

| 항목 | 값 |
|---|---|
| 이름 | `Stock Insight DB Live Dev` |
| Public hostname | `insight-db.jigooo.com` |
| Path | 비움 |
| Policy action | `Allow` |
| Include | 주인님 이메일 또는 좁은 IdP 그룹 |

다음 설정은 사용하지 않는다.

- `Everyone`
- `Bypass`
- `Any Access Service Token`
- 넓은 조직 전체 허용 정책

이 경로는 사람이 브라우저 SSO로 인증하는 arbitrary TCP 경로다. `Service Auth`나 Service Token을 외부 PC에 배포하지 않는다.

### 4.2 Tunnel TCP route 추가

1. Cloudflare Dashboard의 **Networking → Tunnels**로 이동한다.
   - 구 UI에서는 **Zero Trust → Networks → Connectors → Cloudflare Tunnels**에 있을 수 있다.
2. 현재 `edge-gateway-cloudflared-1` connector가 사용하는 기존 Tunnel을 선택한다.
3. **Routes → Add route → Published application**을 선택한다.
4. 다음 값을 입력한다.

| 항목 | 값 |
|---|---|
| Hostname | `insight-db.jigooo.com` |
| Service type | `TCP` |
| Service URL | `research-app-postgres:5432` |

5. 저장한다.
6. DNS에 `insight-db.jigooo.com` CNAME이 생성됐는지 확인한다.

### 4.3 Cloudflare에서 외부 PC로 옮기지 않을 것

- `CLOUDFLARE_TUNNEL_TOKEN`
- Cloudflare API token
- Cloudflare Service Token
- Tunnel credentials JSON

외부 PC는 다음 명령을 통해 브라우저 SSO를 수행한다.

```bash
cloudflared access tcp \
  --hostname insight-db.jigooo.com \
  --url 127.0.0.1:55432
```

일반 사용에서는 `pnpm dev`가 이 명령과 listener 검증을 자동 처리한다.

## 5. 외부 PC로 옮길 시크릿

직접 전달하는 파일은 recipient-encrypted bundle 하나다.

```text
stock-insight-live-dev.age
```

bundle에는 다음 두 운영 시크릿만 포함한다.

1. 기존 reader/writer DB 자격증명
   - 운영 호스트 원본: `$HOME/.hermes/workspace/stock-insight/.env.docker`
2. 내부 컨텍스트 서명키
   - 운영 호스트 원본: `$HOME/.hermes/secrets/stock-insight-internal-context.secret`

외부 PC에서 설치가 끝나면 다음 파일이 생성된다.

```text
~/.hermes/secrets/stock-insight-live-dev/
├── pgpass                                  0600
├── stock-insight-internal-context.secret   0600
└── stock-insight-session.secret            0600, 기기별 신규 생성
```

상위 디렉터리는 `0700`이어야 한다. importer와 launcher가 권한·소유자·symlink 여부를 검증한다.

### 옮기지 않을 것

- `.env.docker` 평문 파일
- 외부 PC의 Age private identity
- session secret
- Cloudflare connector/API/Service Token
- 운영 DB owner 또는 superuser 자격증명
- `insight-api-access.env`
  - 이 파일은 운영 DB 직접 모드가 아니라 읽기 전용 `dev:remote` 롤백 모드에서만 사용한다.

## 6. 설치 절차

### 6.1 외부 PC: 저장소 설치와 Age recipient 생성

필수 도구:

- WSL 또는 Linux
- Node.js
- pnpm
- `age`
- `cloudflared`
- `bubblewrap`

```bash
git clone https://github.com/Jigoooo/stock-insight.git
cd stock-insight
pnpm install --frozen-lockfile
pnpm live:recipient:init
```

출력된 `age1...` 공개 recipient만 운영 호스트로 전달한다. Age private identity는 외부 PC에서 반출하지 않는다.

### 6.2 운영 호스트: 암호화 bundle 생성

```bash
cd "$HOME/.hermes/workspace/stock-insight"

pnpm live:bundle:export \
  --recipient '<외부 PC의 age1... 공개 recipient>' \
  --source-env "$HOME/.hermes/workspace/stock-insight/.env.docker" \
  --internal-context "$HOME/.hermes/secrets/stock-insight-internal-context.secret" \
  --out "$HOME/.hermes/exports/stock-insight-live-dev.age"
```

다음 파일 하나만 외부 PC로 안전하게 전달한다.

```text
$HOME/.hermes/exports/stock-insight-live-dev.age
```

메신저 평문 붙여넣기나 `.env.docker` 직접 복사는 금지한다.

### 6.3 외부 PC: bundle 설치와 실행

```bash
cd stock-insight
pnpm setup:live --bundle ~/stock-insight-live-dev.age
pnpm dev:live:check
pnpm dev
```

`pnpm dev` 실행 중 브라우저에서 Cloudflare Access 로그인이 열린다. 승인된 계정으로 로그인한다. launcher는 cloudflared local listener의 소유권을 확인한 뒤, 비밀번호를 보내지 않는 PostgreSQL protocol probe를 최대 5분 유지한다. 실제 PostgreSQL 응답이 확인되기 전에는 DB 자격증명을 가진 API를 시작하지 않는다.

WSL 또는 격리 sandbox에서 host browser가 자동으로 열리지 않으면 터미널에 표시된 1회성 CLI 로그인 URL을 host browser에서 연다. URL을 파일·메신저·명령 인자에 장기 보관하지 않는다.

## 7. 완료 검증

다음 항목이 모두 충족돼야 완료다.

- [x] `insight-db.jigooo.com` DNS가 정상 응답한다.
- [x] Cloudflare Access 미인증 사용자는 통과하지 못한다.
- [x] 공개 Cloudflare 경로에서 host browser SSO가 정상 완료된다.
- [x] `pnpm dev:live:check`가 통과한다.
- [x] `pnpm dev`가 DB guard를 통과하고 API·Web을 시작한다.
- [x] 화면에 `운영 DB · 실제 쓰기` 표시가 보인다.
- [x] API가 `research_app`과 정확한 reader/writer 역할을 확인한다.
- [x] Web/Vite child에 DB URL과 `PGPASSFILE`이 전달되지 않는다.
- [x] 종료 후 임시 pgpass와 runtime secret directory가 남지 않는다.

실측 한계: 이번 canary는 운영 DB가 있는 WSL host에서 공개 Cloudflare Access 경로를 왕복해 수행했다. 물리적으로 다른 외부 PC에서는 동일한 bundle 설치와 `pnpm dev` 절차를 한 번 반복해 기기별 OS·browser 연동만 확인해야 한다.

운영 DB 직접 모드에서는 다음 작업을 실행하지 않는다.

- seed
- reset
- migration
- 자동 운영 mutation E2E
- DBA 또는 DDL 작업

## 8. 롤백과 유출 대응

### 일반 롤백

1. Cloudflare Access Application을 비활성화한다.
2. Tunnel의 `insight-db.jigooo.com` Published Application route를 삭제한다.
3. 외부 PC의 `pnpm dev`를 종료한다.
4. 필요하면 외부 PC의 `~/.hermes/secrets/stock-insight-live-dev/`를 안전하게 폐기한다.
5. 읽기 전용 원격 모드가 필요하면 `pnpm dev:remote`를 사용한다.

### bundle 또는 외부 PC 유출

1. Access 앱을 즉시 차단한다.
2. 기존 `stock_insight_app_reader`·`stock_insight_app_writer` 비밀번호를 운영 API와 함께 회전한다.
3. 내부 컨텍스트 서명키를 회전한다.
4. 유출 기기의 bundle·pgpass·secret을 폐기한다.
5. 새 Age recipient로 bundle을 다시 생성한다.

기존 운영 API와 외부 개발 모드가 reader/writer 자격증명을 공유하므로 외부 PC 분실 시 해당 자격증명을 함께 회전해야 한다.

## 9. 참고 문서

- 저장소 `README.md`의 `다른 컴퓨터에서 운영 DB를 직접 사용하는 개발 모드`
- Cloudflare Arbitrary TCP: <https://developers.cloudflare.com/cloudflare-one/access-controls/applications/non-http/cloudflared-authentication/arbitrary-tcp/>
- Cloudflare Tunnel setup: <https://developers.cloudflare.com/tunnel/setup/>
- Cloudflare Published application protocols: <https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/protocols/>
