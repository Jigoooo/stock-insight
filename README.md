# Futur Insight

한국·미국 관심종목과 보유 포지션을 뉴스, 기업 맥락, 테마 흐름, 데이터 품질 상태와 함께 살펴보는 **반응형 투자 리서치 워크스페이스 프로토타입**입니다.

> 종목 주문·증권사 연동·개인화 매수/매도 지시를 제공하지 않습니다. 기본 실행은 저장소에 포함된 presentation data를 사용합니다.

## 무엇을 보여주나

- **포트폴리오 브리핑** — 관심종목 주변 이슈, 테마 노출, freshness와 주의 신호를 한 화면에 구성합니다.
- **종목 리서치 화면** — 가격 맥락, 기업 요약, 지표, 리스크, 체크포인트와 출처 영역을 제공합니다.
- **후보 탐색** — 관심종목·시장 신호·테마와 연결된 후보를 이유와 함께 설명합니다.
- **명시적인 데이터 상태** — `available`, `collecting`, `stale`, `text_only`, `missing`, `unsupported`, `error`를 UI까지 전달합니다.
- **반응형 인터랙션** — 데스크톱 navigation, 모바일 bottom tab, 독립 detail scroll, reduced-motion을 지원합니다.

## 설계 포인트

```mermaid
flowchart LR
    A[Bundled presentation data] --> B[Zod contracts]
    C[Optional API adapters] --> B
    B --> D[Typed resolvers]
    D --> E[Portfolio briefing]
    D --> F[Stock detail]
    D --> G[Candidate discovery]
    E --> H[Responsive React UI]
    F --> H
    G --> H
```

- **Runtime contract** — TypeScript 타입만 신뢰하지 않고 Zod schema로 화면 경계를 검증합니다.
- **Failure-aware UI** — 데이터가 없거나 오래됐을 때 그럴듯한 값으로 덮지 않고 상태를 그대로 노출합니다.
- **FSD composition** — `pages`, `widgets`, `features`, `entities`, `shared` 계층으로 화면 책임을 나눕니다.
- **Accessibility** — Playwright와 Axe 기반 smoke scenario, reduced-motion 경로를 포함합니다.
- **Adapter boundary** — API·DB package scaffold와 기본 presentation mode를 구분합니다. 저장소만 실행했다고 live data가 연결되지는 않습니다.

## 기술 스택

| 영역 | 기술 |
|---|---|
| Web | React 19, TanStack Start/Router, Vite, Nitro |
| Visualization | ECharts, Recharts, Motion |
| Contract | TypeScript, Zod, typed API client |
| Workspace | pnpm workspaces, Turborepo |
| Quality | Node test runner, Playwright, Axe, Oxlint, Oxfmt |

## 로컬 실행

준비물: Node.js 24, Corepack

```bash
git clone https://github.com/Jigoooo/stock-insight.git
cd stock-insight
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

기본 주소는 <http://localhost:6100>이며 `VITE_PORT`로 바꿀 수 있습니다. 기본 presentation mode는 외부 API 키가 필요하지 않습니다.

`pnpm dev`는 turbo로 **두뇌(`apps/api-server`, 기본 6200)와 BFF(`apps/web`, 기본 6100)를 함께** 띄웁니다. 한쪽만 필요하면 `pnpm dev:web` / `pnpm dev:api`를 쓰세요.

두뇌 포트는 `STOCK_INSIGHT_API_PORT`로 바꿉니다. **`PORT`는 쓰지 마세요** — 두 앱이 같은 변수를 읽어 서로 포트를 다투고, 늦게 뜬 쪽이 `EADDRINUSE`로 죽습니다.

BFF가 두뇌를 바라보게 하려면 `STOCK_INSIGHT_BRAIN_URL=http://127.0.0.1:6200`을 지정합니다. 두뇌는 DB DSN(`DATABASE_READ_URL`)과 내부 컨텍스트 시크릿(`STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET_FILE`)이 필요하고, BFF는 DB 자격증명을 갖지 않습니다.

### 다른 컴퓨터에서 운영 두뇌를 사용하는 개발 모드

이 실행기는 **WSL/Linux**를 지원합니다. `pnpm dev`는 로컬 DB와 로컬 두뇌를 전제로 합니다. 운영 두뇌에 안전하게 연결해 동일한 계정으로 로그인하려면 아래 시크릿을 **신뢰할 수 있는 개발 컴퓨터에만** 별도로 전달한 뒤 `pnpm dev:remote`를 사용하세요. 시크릿 값은 Git에 커밋하지 않습니다.

- `~/.hermes/secrets/insight-api-access.env` (`0600`)
  - `API_DEV_CLIENT_ID=...`
  - `API_DEV_CLIENT_SECRET=...`
- `~/.hermes/secrets/stock-insight-internal-context.secret` (`0600`)
  - 운영 두뇌와 동일한 내부 HMAC 시크릿입니다.
- `~/.hermes/secrets/stock-insight-dev-session.secret` (`0600`)
  - 기기별 세션 서명 키이며 처음 실행할 때 자동 생성됩니다. 다른 컴퓨터에서 복사할 필요가 없습니다.

```bash
mkdir -p ~/.hermes/secrets
chmod 700 ~/.hermes/secrets
chmod 600 \
  ~/.hermes/secrets/insight-api-access.env \
  ~/.hermes/secrets/stock-insight-internal-context.secret

pnpm dev:remote:check
pnpm dev:remote
```

원격 개발 모드는 BFF만 `127.0.0.1:6100`에 열고 `https://insight-api.jigooo.com`을 사용합니다. DB 자격증명은 자식 프로세스에서 제거하며 회원가입과 데이터 변경을 비활성화합니다. 포트를 바꾸려면 `VITE_PORT`를 지정하세요. 내부 시크릿과 Access 토큰을 함께 보유한 기기는 운영 두뇌의 신뢰 경계 안에 있으므로 분실·공유 시 즉시 폐기 또는 교체해야 합니다.

주요 검증 명령:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

## 현재 범위

- 이력서·포트폴리오용 단일 사용자 연구 UI prototype입니다.
- API·DB package는 확장 경계와 adapter를 보여주는 scaffold이며 운영 데이터 연결을 보장하지 않습니다.
- production authentication, multi-tenancy, broker connectivity, deployment는 범위 밖입니다.
- 투자 판단 전에는 원문 출처와 데이터 생성 시점을 별도로 확인해야 합니다.
