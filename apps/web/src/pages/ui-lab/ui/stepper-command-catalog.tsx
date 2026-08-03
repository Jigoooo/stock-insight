import { Search } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import styles from './stepper-command-catalog.module.css';

import { Button } from '@/shared/ui/button';
import {
  CommandPalette,
  type CommandPaletteItem,
  type CommandPaletteVariant,
} from '@/shared/ui/command-palette';
import { Stepper, type StepperItem, type StepperVariant } from '@/shared/ui/stepper';

type ResearchStepId = 'sources' | 'evidence' | 'impact' | 'review';
type CommandId = 'today-research' | 'theme-explorer' | 'filing-review' | 'impact-review';

const researchSteps = [
  { value: 'sources', label: '소스 확인', description: '뉴스와 공시의 출처를 확인합니다.' },
  { value: 'evidence', label: '근거 연결', description: '종목과 연결된 근거를 묶습니다.' },
  { value: 'impact', label: '영향 경로', description: '기업까지 이어지는 변화를 봅니다.' },
  { value: 'review', label: '검토 완료', description: '확인한 내용을 기록합니다.' },
] as const satisfies ReadonlyArray<StepperItem<ResearchStepId>>;

const stepperVariants = [
  {
    id: 'hairline-flow',
    label: 'A · Hairline Flow',
    title: '가벼운 진행선',
    description: '얇은 기준선과 짧은 현재 표시로 리서치 흐름만 남깁니다.',
  },
  {
    id: 'soft-track',
    label: 'B · Soft Track',
    title: '낮은 이동 면',
    description: '하나의 낮은 표면 안에서 현재 선택 면이 단계 사이를 이동합니다.',
  },
  {
    id: 'ledger-steps',
    label: 'C · Ledger Steps',
    title: '압축 검토 목록',
    description: '상태와 보조 설명을 세로로 묶어 좁은 검토 패널에 맞춥니다.',
  },
] as const satisfies ReadonlyArray<{
  id: StepperVariant;
  label: string;
  title: string;
  description: string;
}>;

const commandVariants = [
  {
    id: 'compact-command',
    label: 'A · Compact Command',
    title: '그룹형 단일 목록',
    description: '검색과 그룹 결과를 한 열에 모아 가장 빠르게 명령을 찾습니다.',
  },
  {
    id: 'split-context',
    label: 'B · Split Context',
    title: '목록과 맥락 미리보기',
    description: '선택한 명령의 목적과 사용 맥락을 나란히 확인합니다.',
  },
  {
    id: 'quick-actions',
    label: 'C · Quick Actions',
    title: '최근 항목과 빠른 액션',
    description: '좁은 실행 면에서 자주 쓰는 명령을 높은 밀도로 탐색합니다.',
  },
] as const satisfies ReadonlyArray<{
  id: CommandPaletteVariant;
  label: string;
  title: string;
  description: string;
}>;

const commandItems = [
  {
    value: 'today-research',
    group: '이동',
    label: '오늘의 리서치',
    description: '오늘 확인할 뉴스와 근거 묶음을 엽니다.',
    shortcut: ['G', 'T'],
    keywords: ['오늘', '뉴스', '피드'],
  },
  {
    value: 'theme-explorer',
    group: '이동',
    label: '테마 탐색',
    description: '테마와 연결된 기업 및 근거를 살펴봅니다.',
    shortcut: ['G', 'M'],
    keywords: ['테마', '기업', '연결'],
  },
  {
    value: 'filing-review',
    group: '실행',
    label: '최신 공시 확인',
    description: '최근 도착한 공시 근거를 확인 목록에 표시합니다.',
    shortcut: ['F'],
    keywords: ['공시', '다트', '근거', '확인'],
  },
  {
    value: 'impact-review',
    group: '실행',
    label: '영향 경로 확인',
    description: '선택한 뉴스가 기업까지 이어지는 경로를 검토합니다.',
    shortcut: ['I'],
    keywords: ['영향', '경로', '뉴스', '확인'],
  },
] as const satisfies ReadonlyArray<CommandPaletteItem<CommandId>>;

export function StepperCommandCatalog(): ReactElement {
  const [activeStep, setActiveStep] = useState<ResearchStepId>('evidence');
  const [openVariant, setOpenVariant] = useState<CommandPaletteVariant | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const selectedCommandVariant =
    commandVariants.find((variant) => variant.id === openVariant) ?? commandVariants[0];

  const setPaletteOpen = (open: boolean) => {
    setOpenVariant((current) => (open ? (current ?? 'compact-command') : null));
  };

  return (
    <section className={styles.catalog} aria-labelledby="stepper-command-title">
      <header className={styles.catalogHeader}>
        <div>
          <span>Batch 3D · Stepper</span>
          <h2 id="stepper-command-title">Stepper · CommandPalette</h2>
        </div>
        <p>
          같은 리서치 단계를 세 가지 정보 구조로 비교합니다. 단계를 선택하면 모든 시안이 함께
          갱신됩니다.
        </p>
      </header>

      <section className={styles.comparison} aria-labelledby="stepper-comparison-title">
        <header className={styles.comparisonHeading}>
          <span>01 · Stepper</span>
          <div>
            <h3 id="stepper-comparison-title">리서치 진행 단계</h3>
            <p>완료, 현재, 예정 상태를 같은 기준으로 비교하며 URL은 변경하지 않습니다.</p>
          </div>
        </header>

        <div className={styles.comparisonGrid}>
          {stepperVariants.map((variant) => (
            <article className={styles.variantCard} data-variant={variant.id} key={variant.id}>
              <header>
                <span>{variant.label}</span>
                <h4>{variant.title}</h4>
                <p>{variant.description}</p>
              </header>

              <div className={styles.previewSurface}>
                <Stepper
                  aria-label={`Stepper 비교 · ${variant.title}`}
                  items={researchSteps}
                  statusLabels={{ completed: '완료', current: '현재', upcoming: '예정' }}
                  value={activeStep}
                  variant={variant.id}
                  onValueChange={setActiveStep}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.comparison} aria-labelledby="command-comparison-title">
        <header className={styles.comparisonHeading}>
          <span>02 · CommandPalette</span>
          <div>
            <h3 id="command-comparison-title">리서치 명령 탐색</h3>
            <p>세 시안 모두 같은 명령을 검색하고 UI Lab 내부 실행 결과만 남깁니다.</p>
          </div>
        </header>

        <div className={styles.comparisonGrid}>
          {commandVariants.map((variant) => (
            <article
              className={styles.variantCard}
              data-command-variant={variant.id}
              key={variant.id}
            >
              <header>
                <span>{variant.label}</span>
                <h4>{variant.title}</h4>
                <p>{variant.description}</p>
              </header>
              <div className={`${styles.previewSurface} ${styles.commandTriggerSurface}`}>
                <Button
                  aria-label={`CommandPalette ${variant.label.charAt(0)} 열기`}
                  className={styles.commandTrigger}
                  motion="quiet"
                  variant="outline"
                  onClick={() => setOpenVariant(variant.id)}
                >
                  <Search aria-hidden="true" size={15} />
                  <span>명령 검색</span>
                  <kbd>{variant.id === 'compact-command' ? '⌘ K' : '열기'}</kbd>
                </Button>
              </div>
            </article>
          ))}
        </div>

        <p className={styles.commandResult} data-slot="command-result" aria-live="polite">
          {lastAction ? `${lastAction} 실행됨` : '아직 실행한 명령이 없습니다.'}
        </p>
      </section>

      <CommandPalette
        description="명령을 검색한 뒤 방향키로 선택하고 Enter로 실행합니다."
        groupLabels={{ 이동: '최근 항목', 실행: '빠른 액션' }}
        hotkey
        items={commandItems}
        locale="ko-KR"
        onOpenChange={setPaletteOpen}
        onSelect={(item) => setLastAction(item.label)}
        open={openVariant !== null}
        previewDetails={[{ id: 'execution-scope', label: '실행 범위', value: 'UI Lab 로컬 상태' }]}
        title={selectedCommandVariant.label}
        variant={selectedCommandVariant.id}
      />
    </section>
  );
}
