# @stock-insight/api-server

NestJS 11 + Fastify 기반 독립 API 서버 (P1 골격).
기존 `apps/api`(read-model 함수 라이브러리)를 P2에서 이곳 provider로 이식한다.
기존 web(Nitro `/api/*`)과 완전 무중단 공존 — 새 포트에서만 리슨.

## 실행

```bash
pnpm --filter @stock-insight/api-server build
DATABASE_URL='postgresql://research_app@127.0.0.1:55432/research_app' \
  pnpm --filter @stock-insight/api-server start   # http://127.0.0.1:6200
```

- `GET /health` — 프로세스 + DB 프로브 (`BEGIN READ ONLY; SELECT 1`)
- `GET /v1/meta` — 서비스 메타 (모든 비즈니스 라우트는 `/v1` 프리픽스)

## 환경변수

| 변수                    | 기본값             | 설명                                    |
| ----------------------- | ------------------ | --------------------------------------- |
| `HOST`                  | `127.0.0.1`        | bind host                               |
| `PORT`                  | `6200`             | bind port                               |
| `DATABASE_URL`          | (없음=db disabled) | read 폴백                               |
| `DATABASE_READ_URL`     | `DATABASE_URL`     | read-only pool                          |
| `STOCK_INSIGHT_USER_ID` | (없음)             | RLS 세션 스코프 (P3 write 이식 시 사용) |

## 설계 규율

1. **명시적 DI만 사용**: `emitDecoratorMetadata` 미사용. 모든 주입은 `@Inject(TOKEN)`.
   tsup(esbuild) 번들과 호환되며, 타입 기반 암묵 주입 금지.
2. **번들 정책**: `@stock-insight/*` 워크스페이스 패키지(raw TS export)만 번들에 흡수(`noExternal`),
   나머지는 external → node_modules 런타임 해석.
3. **계약 단일 진실**: DTO/응답 스키마는 `packages/contracts`(zod) 재사용. 입력 검증은 `ZodValidationPipe`.
4. **DB 접근**: 읽기는 `BEGIN READ ONLY` 스냅샷, RLS는 `stock_insight.user_id` set_config —
   기존 `apps/api` db-client 규약 그대로 계승 (P2에서 read-model과 함께 이식).
5. **graceful shutdown**: `enableShutdownHooks` + pool `end()`.

## 검증

```bash
pnpm --filter @stock-insight/api-server test        # build + node --test (dist 기준)
TEST_DATABASE_URL='postgresql://research_app@127.0.0.1:55432/research_app' \
  pnpm --filter @stock-insight/api-server test      # 실DB 프로브 포함
```
