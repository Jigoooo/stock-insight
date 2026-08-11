import { truthClassSchema, type TruthClass } from '@stock-insight/contracts/truth-visual-language';

/**
 * 진술 종류(truth class)의 **화면 진입점** — `REQ-SEM-010`.
 *
 * 화면이 먼저 만나는 것은 `truth_class` 가 아니라 `truth_binding_state` 다.
 * 마이그레이션 085 가 만든 `serving.content_pack_item_truth_v1` 은 세 가지 상태를
 * 돌려준다: `bound`(14종 중 하나), `not_a_truth_object`(세계에 대한 주장이 아님),
 * `undecided`(아직 분류되지 않음). `renderSpecForTruthClass()` 는
 * `truthClassSchema.parse()` 라 null 에서 **던지므로**, 뒤의 둘을 클래스로
 * 뭉개면 화면이 죽는다. 그래서 상태가 타입의 최상위에 있다.
 *
 * ⚠️ 1주짜리 부채 — 이 표는 `governance.truth_class_binding` 의 **복제본**이다.
 * 085 가 DB 에 넣은 5행을 손으로 옮겨 적었고, 바인딩이 개정되면 **조용히**
 * 어긋난다(테스트도 이 파일을 읽으므로 표류를 잡아주지 못한다).
 * 브레인 엔드포인트(`GET /v1/truth/bindings`)로 교체하는 것이 정상 경로이고,
 * 그 전까지는 아래 다섯 행이 085 의 INSERT 와 글자 단위로 같아야 한다.
 * 설계가 아니라 배선을 앞당기려고 진 빚이다.
 *
 * ⚠️ 그리고 지금 화면의 DTO 들은 `item_kind` 를 **싣지 않는다**. 아래 함수는
 * 뷰가 이미 아는 종류를 이름으로 부를 때 쓰는 사전이고, 실제 적용 지점에서는
 * "이 화면이 그리는 항목은 impact_path 다" 를 코드가 단언한다 — 행마다 조회한
 * 결과가 아니다. 두 말은 다르고, 후자로 읽히면 안 된다.
 */

/** 종류가 정해진 항목. */
export type BoundTruth = { readonly state: 'bound'; readonly truthClass: TruthClass };

export type TruthBinding =
  | BoundTruth
  | { readonly state: 'not_a_truth_object' }
  | { readonly state: 'undecided' };

export type TruthBindingState = TruthBinding['state'];

export const TRUTH_BINDING_STATES = ['bound', 'not_a_truth_object', 'undecided'] as const;

/** 세계에 대한 주장이 아닌 것(모델 설정·식별자 연결). 085 가 문단을 들여 구분했다. */
export const NOT_A_TRUTH_OBJECT: TruthBinding = Object.freeze({
  state: 'not_a_truth_object',
} as const);

/** 아직 분류되지 않은 것. 위와 **다른 말**이고 합치면 거짓말이 된다. */
export const UNDECIDED: TruthBinding = Object.freeze({ state: 'undecided' } as const);

/** fail-closed: 알 수 없는 클래스는 기본값으로 새지 않고 여기서 던진다. */
export function boundTruth(truthClass: TruthClass): BoundTruth {
  return Object.freeze({ state: 'bound', truthClass: truthClassSchema.parse(truthClass) } as const);
}

function assertNever(value: never, message: string): never {
  throw new Error(`${message}: ${JSON.stringify(value)}`);
}

/**
 * 085 가 분류하는 투영 어휘. 테이블 이름이 아니라 **독자가 만나는 종류**다
 * (`serving.content_pack_item` 의 `item_kind`).
 */
export const CONTENT_PACK_ITEM_KINDS = ['relation', 'impact_path', 'evidence'] as const;
export type ContentPackItemKind = (typeof CONTENT_PACK_ITEM_KINDS)[number];

/** `knowledge.relation_evidence_ledger.evidence_kind`. */
export const CONTENT_PACK_EVIDENCE_SUBKINDS = [
  'source_revision',
  'model_config',
  'identity_mapping',
] as const;
export type ContentPackEvidenceSubkind = (typeof CONTENT_PACK_EVIDENCE_SUBKINDS)[number];

export function isContentPackItemKind(value: unknown): value is ContentPackItemKind {
  return (
    typeof value === 'string' && (CONTENT_PACK_ITEM_KINDS as readonly string[]).includes(value)
  );
}

export function isContentPackEvidenceSubkind(value: unknown): value is ContentPackEvidenceSubkind {
  return (
    typeof value === 'string' &&
    (CONTENT_PACK_EVIDENCE_SUBKINDS as readonly string[]).includes(value)
  );
}

function bindingForEvidenceSubkind(subkind: ContentPackEvidenceSubkind | null): TruthBinding {
  switch (subkind) {
    // 085: 보관된 원문(source_revision) 자체가 대상이다.
    case 'source_revision':
      return boundTruth('SOURCE');
    // 085: 모델 설정은 추론의 출처이지 세계에 대한 주장이 아니고,
    // 식별자 연결은 어느 레코드가 어느 것인가에 대한 말이다.
    case 'model_config':
    case 'identity_mapping':
      return NOT_A_TRUTH_OBJECT;
    // 하위 종류를 모르면 SOURCE 로 낙관하지 않는다. 지금 화면의 DTO 가
    // 정확히 이 경우다 — 모른다고 말하는 편이 틀린 배지보다 낫다.
    case null:
      return UNDECIDED;
    default:
      return assertNever(subkind, '분류되지 않은 근거 하위 종류');
  }
}

function bindingForKnownKind(
  itemKind: ContentPackItemKind,
  subkind: ContentPackEvidenceSubkind | null,
): TruthBinding {
  switch (itemKind) {
    // 085: 실체가 있는, 수용 리비전을 가진 관계 진술.
    case 'relation':
      return boundTruth('RELATION');
    // 085: 규칙으로 도출된 경로 248,236행이 전부 direction=unknown 이라
    // EXPOSURE 가 아니라 HYPOTHESIS 다. 부호 없는 노출은 노출이 아니다.
    case 'impact_path':
      return boundTruth('HYPOTHESIS');
    case 'evidence':
      return bindingForEvidenceSubkind(subkind);
    default:
      return assertNever(itemKind, '분류되지 않은 항목 종류');
  }
}

/**
 * 바인딩이 없는 종류는 **기본값이 아니라 미분류**로 떨어진다. 085 주석 그대로:
 * "지어낸 클래스는 인정된 공백보다 나쁘다 — 독자는 정직한 '미분류'는 읽을 수
 * 있지만 잘못 붙은 배지는 되돌려 볼 수 없다."
 */
export function truthBindingForContentPackItem(
  itemKind: string,
  itemSubkind: string | null = null,
): TruthBinding {
  if (!isContentPackItemKind(itemKind)) return UNDECIDED;
  const subkind = isContentPackEvidenceSubkind(itemSubkind) ? itemSubkind : null;
  return bindingForKnownKind(itemKind, subkind);
}
