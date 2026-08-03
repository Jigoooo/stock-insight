import { Check } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useState, type ReactElement } from 'react';

import styles from './stepper-command-catalog.module.css';

type StepperVariant = 'hairline-flow' | 'soft-track' | 'ledger-steps';
type ResearchStepId = 'sources' | 'evidence' | 'impact' | 'review';
type ResearchStepState = 'completed' | 'current' | 'upcoming';

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

export function StepperCommandCatalog(): ReactElement {
  const [activeStep, setActiveStep] = useState<ResearchStepId>('evidence');
  const reducedMotion = useReducedMotion();
  const activeIndex = researchSteps.findIndex((step) => step.id === activeStep);

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
                    const state = resolveStepState(index, activeIndex);

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
    </section>
  );
}
