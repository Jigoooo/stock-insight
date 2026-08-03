import { Check, Search } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';

import styles from './stepper-command-catalog.module.css';

import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';

type StepperVariant = 'hairline-flow' | 'soft-track' | 'ledger-steps';
type CommandVariant = 'compact-command' | 'split-context' | 'quick-actions';
type ResearchStepId = 'sources' | 'evidence' | 'impact' | 'review';
type ResearchStepState = 'completed' | 'current' | 'upcoming';
type CommandGroup = '이동' | '실행';

type CommandItem = {
  id: string;
  group: CommandGroup;
  label: string;
  description: string;
  shortcut?: string[];
  keywords: string[];
};

const researchSteps = [
  { id: 'sources', label: '소스 확인', description: '뉴스와 공시의 출처를 확인합니다.' },
  { id: 'evidence', label: '근거 연결', description: '종목과 연결된 근거를 묶습니다.' },
  { id: 'impact', label: '영향 경로', description: '기업까지 이어지는 변화를 봅니다.' },
  { id: 'review', label: '검토 완료', description: '확인한 내용을 기록합니다.' },
] as const;

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
  id: CommandVariant;
  label: string;
  title: string;
  description: string;
}>;

const commandItems: CommandItem[] = [
  {
    id: 'today-research',
    group: '이동',
    label: '오늘의 리서치',
    description: '오늘 확인할 뉴스와 근거 묶음을 엽니다.',
    shortcut: ['G', 'T'],
    keywords: ['오늘', '뉴스', '피드'],
  },
  {
    id: 'theme-explorer',
    group: '이동',
    label: '테마 탐색',
    description: '테마와 연결된 기업 및 근거를 살펴봅니다.',
    shortcut: ['G', 'M'],
    keywords: ['테마', '기업', '연결'],
  },
  {
    id: 'filing-review',
    group: '실행',
    label: '최신 공시 확인',
    description: '최근 도착한 공시 근거를 확인 목록에 표시합니다.',
    shortcut: ['F'],
    keywords: ['공시', '다트', '근거', '확인'],
  },
  {
    id: 'impact-review',
    group: '실행',
    label: '영향 경로 확인',
    description: '선택한 뉴스가 기업까지 이어지는 경로를 검토합니다.',
    shortcut: ['I'],
    keywords: ['영향', '경로', '뉴스', '확인'],
  },
];

const commandGroups: CommandGroup[] = ['이동', '실행'];

function resolveStepState(stepIndex: number, activeIndex: number): ResearchStepState {
  if (stepIndex < activeIndex) return 'completed';
  if (stepIndex === activeIndex) return 'current';
  return 'upcoming';
}

function StepIndicator({ index, state }: { index: number; state: ResearchStepState }) {
  if (state === 'completed') {
    return <Check aria-hidden="true" size={14} strokeWidth={2} />;
  }

  return <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>;
}

function CommandOption({
  active,
  index,
  item,
  onActivate,
  onExecute,
  optionId,
}: {
  active: boolean;
  index: number;
  item: CommandItem;
  onActivate: (index: number) => void;
  onExecute: (item: CommandItem) => void;
  optionId: string;
}) {
  return (
    <button
      aria-selected={active}
      className={styles.commandOption}
      data-active={active || undefined}
      id={optionId}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- command options must remain buttons inside the ARIA listbox.
      role="option"
      type="button"
      onClick={() => onExecute(item)}
      onFocus={() => onActivate(index)}
      onMouseEnter={() => onActivate(index)}
    >
      <span className={styles.commandOptionCopy}>
        <strong>{item.label}</strong>
        <span>{item.description}</span>
      </span>
      {item.shortcut ? (
        <span className={styles.commandShortcut} aria-label={`단축키 ${item.shortcut.join(' ')}`}>
          {item.shortcut.map((key) => (
            <kbd key={key}>{key}</kbd>
          ))}
        </span>
      ) : null}
    </button>
  );
}

export function StepperCommandCatalog(): ReactElement {
  const [activeStep, setActiveStep] = useState<ResearchStepId>('evidence');
  const [openVariant, setOpenVariant] = useState<CommandVariant | null>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const reducedMotion = useReducedMotion();
  const activeStepIndex = researchSteps.findIndex((step) => step.id === activeStep);
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR');
    if (!normalizedQuery) return commandItems;

    return commandItems.filter((item) =>
      [item.label, item.description, ...item.keywords]
        .join(' ')
        .toLocaleLowerCase('ko-KR')
        .includes(normalizedQuery),
    );
  }, [query]);
  const activeItem = filteredItems[activeIndex];

  const openPalette = (variant: CommandVariant) => {
    setQuery('');
    setActiveIndex(0);
    setOpenVariant(variant);
  };

  const executeCommand = (item: CommandItem) => {
    setLastAction(item.label);
    setOpenVariant(null);
  };

  useEffect(() => {
    const handleGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setQuery('');
        setActiveIndex(0);
        setOpenVariant('compact-command');
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, Math.max(filteredItems.length - 1, 0)));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
        break;
      case 'Enter': {
        event.preventDefault();
        if (activeItem) executeCommand(activeItem);
        break;
      }
      case 'Escape':
        event.preventDefault();
        setOpenVariant(null);
        break;
    }
  };

  const optionId = (item: CommandItem) => `command-option-${openVariant ?? 'closed'}-${item.id}`;

  const renderOptions = (items: CommandItem[]) =>
    items.map((item) => {
      const index = filteredItems.indexOf(item);

      return (
        <CommandOption
          active={index === activeIndex}
          index={index}
          item={item}
          key={item.id}
          optionId={optionId(item)}
          onActivate={setActiveIndex}
          onExecute={executeCommand}
        />
      );
    });

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
                <ol
                  className={`${styles.stepList} ${styles[variant.id]}`}
                  aria-label={`Stepper 비교 · ${variant.title}`}
                >
                  {researchSteps.map((step, index) => {
                    const state = resolveStepState(index, activeStepIndex);

                    return (
                      <li data-state={state} key={step.id}>
                        <button
                          type="button"
                          aria-current={state === 'current' ? 'step' : undefined}
                          onClick={() => setActiveStep(step.id)}
                        >
                          {variant.id === 'soft-track' && state === 'current' ? (
                            <motion.span
                              aria-hidden="true"
                              className={styles.softTrackIndicator}
                              layoutId={reducedMotion ? undefined : 'stepper-soft-track-active'}
                              transition={
                                reducedMotion
                                  ? { duration: 0 }
                                  : { type: 'spring', stiffness: 320, damping: 32 }
                              }
                            />
                          ) : null}

                          <span className={styles.stepContent}>
                            <span className={styles.stepIndicator}>
                              <StepIndicator index={index} state={state} />
                            </span>
                            <span className={styles.stepCopy}>
                              <strong>{step.label}</strong>
                              {variant.id === 'ledger-steps' ? (
                                <span>{step.description}</span>
                              ) : null}
                            </span>
                            {variant.id === 'ledger-steps' ? (
                              <small>
                                {state === 'completed'
                                  ? '완료'
                                  : state === 'current'
                                    ? '현재'
                                    : '예정'}
                              </small>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
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
                  onClick={() => openPalette(variant.id)}
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

      <Dialog open={openVariant !== null} onOpenChange={(open) => !open && setOpenVariant(null)}>
        <DialogContent
          className={`${styles.commandDialog} ${
            openVariant === 'quick-actions' ? styles.commandDialogCompact : ''
          }`}
          data-command-variant={openVariant ?? undefined}
          size={
            openVariant === 'split-context' ? 'lg' : openVariant === 'quick-actions' ? 'sm' : 'md'
          }
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            searchInputRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {commandVariants.find((variant) => variant.id === openVariant)?.label ??
                'CommandPalette'}
            </DialogTitle>
            <DialogDescription>
              명령을 검색한 뒤 방향키로 선택하고 Enter로 실행합니다.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className={styles.commandBody}>
            <div className={styles.commandSearch}>
              <Search aria-hidden="true" size={16} />
              <Input
                ref={searchInputRef}
                aria-activedescendant={activeItem ? optionId(activeItem) : undefined}
                aria-autocomplete="list"
                aria-controls="command-palette-results"
                aria-expanded="true"
                aria-label="명령 검색"
                density="search"
                placeholder="명령 검색"
                // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the palette input owns the required combobox contract.
                role="combobox"
                tabIndex={0}
                value={query}
                variant="bare"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleSearchKeyDown}
              />
              <kbd>ESC</kbd>
            </div>

            {filteredItems.length === 0 ? (
              <div className={styles.commandEmpty}>검색 결과가 없습니다.</div>
            ) : (
              <div
                className={`${styles.commandLayout} ${
                  openVariant === 'split-context' ? styles.commandLayoutSplit : ''
                }`}
              >
                <div
                  className={styles.commandResults}
                  data-density={openVariant === 'quick-actions' ? 'compact' : 'default'}
                  data-slot="command-results"
                  id="command-palette-results"
                  // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- this custom command collection is not a native select.
                  role="listbox"
                >
                  {openVariant === 'split-context'
                    ? renderOptions(filteredItems)
                    : commandGroups.map((group) => {
                        const items = filteredItems.filter((item) => item.group === group);
                        if (items.length === 0) return null;
                        const groupId = `command-group-${openVariant}-${group}`;
                        const groupLabel =
                          openVariant === 'quick-actions'
                            ? group === '이동'
                              ? '최근 항목'
                              : '빠른 액션'
                            : group;

                        return (
                          <div
                            aria-labelledby={groupId}
                            className={styles.commandGroup}
                            key={group}
                            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- visual command groups label listbox options.
                            role="group"
                          >
                            <span id={groupId}>{groupLabel}</span>
                            {renderOptions(items)}
                          </div>
                        );
                      })}
                </div>

                {openVariant === 'split-context' && activeItem ? (
                  <aside className={styles.commandPreview} data-slot="command-preview">
                    <span>선택한 명령</span>
                    <h3>{activeItem.label}</h3>
                    <p>{activeItem.description}</p>
                    <dl>
                      <div>
                        <dt>분류</dt>
                        <dd>{activeItem.group}</dd>
                      </div>
                      <div>
                        <dt>실행 범위</dt>
                        <dd>UI Lab 로컬 상태</dd>
                      </div>
                    </dl>
                  </aside>
                ) : null}
              </div>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </section>
  );
}
