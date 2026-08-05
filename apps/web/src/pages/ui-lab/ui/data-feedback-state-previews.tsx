/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Mockups use explicit ARIA state semantics across visual variants. */
import { Check, CircleAlert, Database, Inbox, SearchX } from 'lucide-react';
import type { ReactElement } from 'react';

import styles from './data-feedback-catalog.module.css';
import type { DataFeedbackTabId } from './data-feedback-model';

import { Button } from '@/shared/ui/button';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Progress,
  Skeleton,
  Spinner,
  type LoadingStateVariant,
  type ProgressVariant,
  type SkeletonVariant,
  type SpinnerVariant,
} from '@/shared/ui/feedback';

type StateComponent = Exclude<DataFeedbackTabId, 'table' | 'data-grid'>;

export type LoadingPreviewState = 'idle' | 'pending' | 'complete';
export type RecoveryState = 'idle' | 'retrying' | 'recovered';

type StatePreviewProps = {
  component: StateComponent;
  loadingState: LoadingPreviewState;
  onAdvanceProgress: () => void;
  onClearEmpty: () => void;
  onRetryError: () => void;
  onStartLoading: () => void;
  progress: number;
  recoveryState: RecoveryState;
  statusMessage: string;
  variantId: string;
};

export function DataFeedbackStatePreview(props: StatePreviewProps): ReactElement {
  switch (props.component) {
    case 'progress':
      return <ProgressPreview {...props} />;
    case 'spinner':
      return <SpinnerPreview variantId={props.variantId} />;
    case 'skeleton':
      return <SkeletonPreview variantId={props.variantId} />;
    case 'empty':
      return <EmptyPreview {...props} />;
    case 'error':
      return <ErrorPreview {...props} />;
    case 'loading':
      return <LoadingPreview {...props} />;
  }
}

function ProgressPreview({
  onAdvanceProgress,
  progress,
  variantId,
}: StatePreviewProps): ReactElement {
  return (
    <div className={styles.statePreview}>
      <div className={styles.progressCopy}>
        <span>리서치 동기화</span>
        <strong>{progress}%</strong>
      </div>
      <Progress label="리서치 동기화" value={progress} variant={variantId as ProgressVariant} />
      <p>현재 근거와 기업 요약을 한 번에 갱신합니다.</p>
      <Button size="sm" variant="outline" onClick={onAdvanceProgress}>
        진행 상태 변경
      </Button>
    </div>
  );
}

function SpinnerPreview({ variantId }: { variantId: string }): ReactElement {
  return (
    <div className={styles.spinnerPreview}>
      <Spinner label="새 근거 확인 중" variant={variantId as SpinnerVariant} />
      <strong>새 근거 확인 중</strong>
      <p>공시와 뉴스 출처를 조용히 대조합니다.</p>
    </div>
  );
}

function SkeletonPreview({ variantId }: { variantId: string }): ReactElement {
  return (
    <div aria-label="리서치 카드 구성 중" className={styles.skeletonPreview} role="status">
      <Skeleton height={220} variant={variantId as SkeletonVariant} />
      <span className={styles.visuallyHidden}>리서치 카드 구성 중</span>
    </div>
  );
}

function EmptyPreview({ onClearEmpty, statusMessage, variantId }: StatePreviewProps): ReactElement {
  const Icon =
    variantId === 'guided-empty' ? SearchX : variantId === 'inline-empty' ? Database : Inbox;

  return (
    <EmptyState
      announcement="inherit"
      className={styles.emptyPreview}
      data-state-family="empty"
      variant={variantId as 'quiet-empty' | 'guided-empty' | 'inline-empty'}
    >
      <Icon aria-hidden="true" />
      <div>
        <strong>표시할 근거가 없습니다</strong>
        <p>선택한 기간과 필터를 다시 확인해 보세요.</p>
      </div>
      <Button size="sm" variant="outline" onClick={onClearEmpty}>
        필터 초기화
      </Button>
      {statusMessage === '필터 초기화됨' ? <small>{statusMessage}</small> : null}
    </EmptyState>
  );
}

function ErrorPreview({ onRetryError, recoveryState, variantId }: StatePreviewProps): ReactElement {
  const recovered = recoveryState === 'recovered';
  const retrying = recoveryState === 'retrying';

  return (
    <ErrorState
      announcement="inherit"
      className={styles.errorPreview}
      data-recovered={recovered || undefined}
      data-state-family="error"
      variant={variantId as 'quiet-alert' | 'recovery-panel' | 'inline-critical'}
    >
      <div className={styles.errorIcon}>
        {recovered ? <Check aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
      </div>
      <div>
        <strong>
          {recovered
            ? '복구됨'
            : retrying
              ? '다시 시도 중'
              : variantId === 'inline-critical'
                ? '근거 연결 실패'
                : '데이터를 가져오지 못했습니다'}
        </strong>
        <p>
          {recovered
            ? '최신 근거를 다시 연결했습니다.'
            : '잠시 후 다시 시도하거나 출처를 확인하세요.'}
        </p>
      </div>
      <Button
        pending={retrying}
        pendingLabel="다시 시도 중"
        size="sm"
        variant="outline"
        onClick={onRetryError}
      >
        다시 시도
      </Button>
    </ErrorState>
  );
}

function LoadingPreview({
  loadingState,
  onStartLoading,
  variantId,
}: StatePreviewProps): ReactElement {
  const copy =
    loadingState === 'pending'
      ? '불러오는 중'
      : loadingState === 'complete'
        ? '불러오기 완료'
        : '불러오기 준비';

  return (
    <LoadingState
      action={
        <Button
          pending={loadingState === 'pending'}
          pendingLabel="처리 중"
          size="sm"
          variant="outline"
          onClick={onStartLoading}
        >
          다시 불러오기
        </Button>
      }
      className={styles.loadingPreview}
      description="출처 수집과 영향 경로 연결 상태를 유지합니다."
      data-state-family="loading"
      state={loadingState}
      title={copy}
      variant={variantId as LoadingStateVariant}
    />
  );
}
