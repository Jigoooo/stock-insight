import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import { authFunctionMiddleware } from '@/server/auth/auth-middleware';
import type {
  CommonAssetViewBlock,
  CommonAssetViewPacket,
} from '@stock-insight/contracts/common-asset-view';
import type { EntityBriefingV2 } from '@stock-insight/contracts/workspace-read-v2';

/**
 * Asset Deep Dive 라우트 로더의 서버 함수.
 *
 * `load-research-workspace.ts` 와 같은 모양이다: `authFunctionMiddleware` 로
 * 세션을 세우고, 서버 전용 모듈은 **핸들러 안에서 동적으로** import 한다.
 * 정적으로 import 하면 브라우저 번들이 `@/server/*` 를 끌고 간다.
 *
 * `entityKey` 검증은 BFF 라우트(`routes/api/entities/$entityKey/briefing.ts`)와
 * 같은 패턴을 쓴다. 여기서 막지 않으면 임의 문자열이 brain 경로로 들어가고,
 * 404 를 화면이 "데이터 없음" 으로 오해한다.
 */
const entityKeyPattern = /^(?:KR:\d{6}|US:[A-Z][A-Z0-9]{0,7}(?:[.-][A-Z0-9]{1,2})?)$/;

const assetBriefingInputSchema = z
  .object({ entityKey: z.string().min(1).max(64).regex(entityKeyPattern) })
  .strict();

export type AssetBriefingInput = z.infer<typeof assetBriefingInputSchema>;

/**
 * 직렬화 가능한 JSON 값.
 *
 * 계약은 블록 payload 를 `z.record(z.string(), z.unknown())` 으로 둔다 — 블록마다
 * 내부 모양이 달라 계약이 강제할 수 있는 것이 "객체" 까지이기 때문이다(계약
 * 헤더). 그런데 `createServerFn` 의 반환 타입 검사는 `unknown` 을 "직렬화할 수
 * 없을지도 모르는 것" 으로 거부한다.
 *
 * 그래서 여기서 좁힌다. **거짓말이 아니다** — 이 값은 방금 brain 의 JSON 응답을
 * zod 로 파싱해서 나온 것이라 정의상 JSON 이다. `unknown` 이었던 이유는 모양을
 * 모른다는 뜻이지 JSON 이 아니라는 뜻이 아니었다.
 *
 * 좁혀도 소비자는 영향받지 않는다: `Record<string, JsonValue>` 는
 * `Record<string, unknown>` 에 그대로 대입되므로, 화면 컴포넌트는 계약 타입
 * (`CommonAssetViewPacket`)을 계속 그대로 받는다. 값을 해석하는 자리는 여전히
 * `asset-packet.ts` 하나뿐이다.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

type SerializableBlock = Omit<CommonAssetViewBlock, 'payload'> & {
  payload: Record<string, JsonValue>;
};

type SerializablePacket = Omit<CommonAssetViewPacket, 'blocks'> & { blocks: SerializableBlock[] };

export type AssetBriefing = Omit<EntityBriefingV2, 'commonAssetView'> & {
  commonAssetView: SerializablePacket | null;
};

/**
 * 로더의 결과. 실패를 **던지지 않고 값으로** 돌려준다.
 *
 * 던지면 TanStack 이 `errorComponent` 를 그리는데, 그것은 라우트 밖의 자체
 * `<main>` 이라 `WorkspaceShell` 이 없다. 셸이 없으면 이 화면에서 방금 고친 세
 * 가지가 실패 상태에서 그대로 되돌아간다 — 깊이 토글(REQ-PROD-002 의 유일한
 * 조작부)이 사라지고, 워크스페이스로 돌아갈 탐색 경로가 없어지고,
 * `workspace-visual.spec.ts` 의 첫 단언이 찾는 `research-workspace-v3` 도 없다.
 *
 * 브레인은 `stockDetail` 이 비면 404 를 던진다(research-workspace.controller.ts).
 * 297 패킷 밖의 종목은 그 경로로 흔하게 들어오므로, 그것을 사고가 아니라
 * **정직한 부재**로 셸 안에서 그린다. 진짜 연결 실패(`failed`)와는 갈라서
 * 둔다 — UX 헌법 6번이 오류를 empty 로 위장하는 것을 금지한다.
 */
export type AssetBriefingResult =
  | { status: 'ready'; briefing: AssetBriefing }
  | { status: 'not_found'; entityKey: string }
  | { status: 'failed'; entityKey: string };

export const loadAssetBriefing = createServerFn({ method: 'GET' })
  .middleware([authFunctionMiddleware])
  .validator(assetBriefingInputSchema)
  .handler(async ({ data, context }): Promise<AssetBriefingResult> => {
    const { loadEntityBriefing } = await import('@/server/research-workspace');
    const { BrainRequestError } = await import('@/server/brain-client');
    // `surface` 는 계약이 `stocks | market_connections` 로 좁혀 둔 값이고,
    // 이 화면이 필요로 하는 stockDetail·relation·impact·CAV 를 다 싣는 쪽은
    // `stocks` 다.
    try {
      const briefing = await loadEntityBriefing(context.session.sub, data.entityKey, 'stocks');
      return { status: 'ready', briefing: briefing as AssetBriefing };
    } catch (error) {
      // 404 만 부재로 읽는다. 그 외(5xx·네트워크·계약 파싱 실패)는 연결 실패이고,
      // 그것을 부재로 접으면 UX 헌법 6번이 금지하는 "API 오류를 empty 로 위장" 이 된다.
      if (error instanceof BrainRequestError && error.status === 404) {
        return { status: 'not_found', entityKey: data.entityKey };
      }
      return { status: 'failed', entityKey: data.entityKey };
    }
  });
