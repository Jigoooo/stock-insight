import { ChevronDown, Download, FileText, Link2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';

import styles from './input-action-catalog.module.css';

import { Calendar, type CalendarVariant } from '@/shared/ui/calendar';
import { DatePicker, RangePicker } from '@/shared/ui/date-picker';
import { FileUpload, type FileUploadFile, type FileUploadMode } from '@/shared/ui/file-upload';
import { OTP } from '@/shared/ui/otp';
import { RadioGroup, type RadioGroupVariant } from '@/shared/ui/radio-group';
import { Slider, type SliderVariant } from '@/shared/ui/slider';

type DirectionId = RadioGroupVariant & SliderVariant;
type CategoryId =
  | 'radio'
  | 'slider'
  | 'calendar'
  | 'range'
  | 'upload'
  | 'otp'
  | 'button-group'
  | 'split-button';

const directions = [
  {
    id: 'hairline',
    label: 'A · Hairline',
    title: '선과 여백 중심',
    description: '가장 가볍고 전문적인 밀도. 데이터 화면과 자연스럽게 연결됩니다.',
  },
  {
    id: 'inset',
    label: 'B · Inset',
    title: '낮은 음영의 면',
    description: '입력 가능 영역을 빠르게 찾을 수 있고 긴 폼에서도 안정적입니다.',
  },
  {
    id: 'rail',
    label: 'C · Rail',
    title: '선택 레일과 높은 밀도',
    description: '좁은 사이드 패널과 리서치 도구에 맞는 압축형 방향입니다.',
  },
] as const satisfies ReadonlyArray<{
  id: DirectionId;
  label: string;
  title: string;
  description: string;
}>;

const categories = [
  { id: 'radio', label: 'RadioGroup' },
  { id: 'slider', label: 'Slider' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'range', label: 'DatePicker · RangePicker' },
  { id: 'upload', label: 'FileUpload · Dropzone' },
  { id: 'otp', label: 'OTP' },
  { id: 'button-group', label: 'ButtonGroup' },
  { id: 'split-button', label: 'SplitButton' },
] as const satisfies ReadonlyArray<{ id: CategoryId; label: string }>;

const selectedDirections = {
  radio: ['hairline', 'inset', 'rail'],
  slider: ['hairline', 'inset', 'rail'],
  calendar: ['hairline', 'inset', 'rail'],
  range: ['hairline', 'inset', 'rail'],
  upload: ['hairline', 'inset'],
  otp: ['hairline', 'inset', 'rail'],
  'button-group': ['hairline', 'inset'],
  'split-button': ['hairline', 'inset', 'rail'],
} as const satisfies Record<CategoryId, readonly DirectionId[]>;

const calendarDirections = {
  hairline: {
    label: 'A · Compact',
    title: '컴팩트 솔리드',
    description: '30px 셀과 1px 간격. 선택일만 작은 둥근 사각형으로 또렷하게 채웁니다.',
  },
  inset: {
    label: 'B · Soft Inset',
    title: '소프트 인셋',
    description: '32px 셀에 낮은 배경과 얇은 inset border를 사용해 부드럽게 구분합니다.',
  },
  rail: {
    label: 'C · Ledger',
    title: '레저 아웃라인',
    description: '금융 데이터 표처럼 밀도를 높이고 선택일은 작은 outline tile로 표시합니다.',
  },
} as const satisfies Record<DirectionId, { label: string; title: string; description: string }>;

const calendarVariantByDirection = {
  hairline: 'compact',
  inset: 'soft-inset',
  rail: 'ledger',
} as const satisfies Record<DirectionId, CalendarVariant>;

const splitButtonDirections = {
  hairline: {
    label: 'A · Soft Join',
    title: '매트 솔리드',
    description: '하나의 부드러운 덩어리 안에서 기본 액션과 옵션을 얇은 선으로만 나눕니다.',
  },
  inset: {
    label: 'B · Tonal',
    title: '톤 분리',
    description: '밝은 본체와 낮은 음영의 옵션 영역으로 기능 차이를 차분하게 구분합니다.',
  },
  rail: {
    label: 'C · Twin',
    title: '트윈 캡슐',
    description: '같은 그룹 안에서 두 버튼을 살짝 분리해 둥근 형태와 클릭 영역을 강조합니다.',
  },
} as const satisfies Record<DirectionId, { label: string; title: string; description: string }>;

function RadioPreview({ direction }: { direction: DirectionId }) {
  return (
    <RadioGroup
      defaultValue="watch"
      items={[
        { value: 'holding', label: '보유 종목', description: '포트폴리오와 직접 연결' },
        { value: 'watch', label: '관심 종목', description: '추적 중인 종목만 표시' },
        { value: 'market', label: '시장 전체', description: '발견 후보까지 확장' },
      ]}
      label="리서치 범위"
      variant={direction}
    />
  );
}

function SliderPreview({ direction }: { direction: DirectionId }) {
  return (
    <Slider
      defaultValue={[64]}
      endLabel="엄격하게"
      formatValue={(values) => `${values[0] ?? 0}%`}
      label="신뢰도 기준"
      max={100}
      min={0}
      startLabel="넓게"
      thumbLabels={['신뢰도 기준']}
      variant={direction}
    />
  );
}

function CalendarPreview({ direction }: { direction: DirectionId }) {
  return (
    <Calendar
      defaultMonth={new Date(2026, 7, 1)}
      defaultValue={new Date(2026, 7, 12)}
      variant={calendarVariantByDirection[direction]}
    />
  );
}

function DateRangePreview({ direction }: { direction: DirectionId }) {
  return (
    <div className={styles.dateRange} data-direction={direction}>
      <DatePicker
        calendarVariant={calendarVariantByDirection[direction]}
        defaultValue={new Date(2026, 7, 2)}
        label="기준일"
        variant={direction}
      />
      <RangePicker
        calendarVariant={calendarVariantByDirection[direction]}
        defaultValue={{ from: new Date(2026, 7, 2), to: new Date(2026, 7, 16) }}
        endLabel="종료일"
        startLabel="시작일"
        variant={direction}
      />
      <p>기준일 또는 기간을 선택해 변화와 근거를 함께 확인합니다.</p>
    </div>
  );
}

type UploadDemoState = 'idle' | 'dragging' | 'selected';

const singleUploadSample: FileUploadFile[] = [
  { id: 'portfolio', name: 'portfolio-2026-08.csv', size: 284 * 1024 },
];

const multipleUploadSamples: FileUploadFile[] = [
  ...singleUploadSample,
  { id: 'earnings', name: 'earnings-notes.pdf', size: 1.8 * 1024 * 1024 },
  { id: 'watchlist', name: 'watchlist.xlsx', size: 632 * 1024 },
];

function UploadPreview({ direction }: { direction: DirectionId }) {
  const [mode, setMode] = useState<FileUploadMode>('single');
  const [files, setFiles] = useState<readonly FileUploadFile[]>([]);
  const [dragActive, setDragActive] = useState(false);

  const updateMode = (nextMode: FileUploadMode) => {
    setMode(nextMode);
    setFiles((current) => (nextMode === 'single' ? current.slice(0, 1) : current));
  };

  const updateDemoState = (state: UploadDemoState) => {
    setDragActive(state === 'dragging');
    if (state === 'idle' || state === 'dragging') {
      setFiles([]);
      return;
    }
    setFiles(mode === 'single' ? singleUploadSample : multipleUploadSamples);
  };

  const demoState: UploadDemoState = dragActive
    ? 'dragging'
    : files.length > 0
      ? 'selected'
      : 'idle';

  return (
    <div className={styles.uploadPreview} data-direction={direction}>
      <div className={styles.uploadControls}>
        <div className={styles.miniToggle} aria-label="파일 선택 방식">
          <button
            type="button"
            aria-pressed={mode === 'single'}
            onClick={() => updateMode('single')}
          >
            단일
          </button>
          <button
            type="button"
            aria-pressed={mode === 'multiple'}
            onClick={() => updateMode('multiple')}
          >
            다중
          </button>
        </div>
        <div className={styles.uploadStateToggle} aria-label="파일 업로드 목업 상태">
          {(
            [
              ['idle', '대기'],
              ['dragging', '드래그'],
              ['selected', '선택'],
            ] as const
          ).map(([state, label]) => (
            <button
              key={state}
              type="button"
              aria-pressed={demoState === state}
              onClick={() => updateDemoState(state)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <FileUpload
        dragActive={dragActive}
        files={files}
        mode={mode}
        onDragActiveChange={setDragActive}
        onFilesChange={setFiles}
        variant={direction === 'inset' ? 'inset' : 'hairline'}
      />
    </div>
  );
}

function OtpPreview({ direction }: { direction: DirectionId }) {
  return (
    <OTP
      completeText="코드 입력 완료"
      defaultValue="47"
      description="나머지 숫자를 입력하세요."
      label="확인 코드"
      meta="02:41"
      variant={direction}
    />
  );
}

function ButtonGroupPreview({ direction }: { direction: DirectionId }) {
  const [period, setPeriod] = useState('1M');
  return (
    <div className={styles.buttonPreview} data-direction={direction}>
      <div className={styles.buttonGroup} aria-label="차트 기간">
        {['1D', '1W', '1M', '1Y'].map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={period === value}
            onClick={() => setPeriod(value)}
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}

function SplitButtonPreview({ direction }: { direction: DirectionId }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className={styles.splitPreview} data-direction={direction}>
      <p>화살표 영역을 눌러 보조 액션을 확인하세요.</p>
      <div className={styles.splitButton} data-direction={direction}>
        <button className={styles.splitPrimary} type="button">
          <FileText aria-hidden="true" size={15} strokeWidth={1.8} />
          <span>리포트 저장</span>
        </button>
        <button
          className={styles.splitTrigger}
          type="button"
          aria-label="리포트 저장 옵션"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
        >
          <ChevronDown aria-hidden="true" size={15} strokeWidth={1.8} />
        </button>
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              className={styles.splitMenu}
              role="menu"
              initial={{ opacity: 0, y: -4, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -3, scale: 0.99 }}
              transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            >
              <button type="button" role="menuitem" onClick={() => setMenuOpen(false)}>
                <Download aria-hidden="true" size={15} strokeWidth={1.8} />
                <span>PDF로 저장</span>
              </button>
              <button type="button" role="menuitem" onClick={() => setMenuOpen(false)}>
                <Link2 aria-hidden="true" size={15} strokeWidth={1.8} />
                <span>링크 복사</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function CategoryPreview({
  category,
  direction,
}: {
  category: CategoryId;
  direction: DirectionId;
}) {
  if (category === 'radio') return <RadioPreview direction={direction} />;
  if (category === 'slider') return <SliderPreview direction={direction} />;
  if (category === 'calendar') return <CalendarPreview direction={direction} />;
  if (category === 'range') return <DateRangePreview direction={direction} />;
  if (category === 'upload') return <UploadPreview direction={direction} />;
  if (category === 'otp') return <OtpPreview direction={direction} />;
  if (category === 'button-group') return <ButtonGroupPreview direction={direction} />;
  return <SplitButtonPreview direction={direction} />;
}

export function InputActionCatalog() {
  const [activeCategory, setActiveCategory] = useState<CategoryId>('radio');
  const activeLabel = categories.find(({ id }) => id === activeCategory)?.label;
  const visibleDirections =
    activeCategory === 'upload' ? directions.filter(({ id }) => id !== 'rail') : directions;

  return (
    <section className={styles.catalog} aria-labelledby="input-action-title">
      <header className={styles.catalogHeader}>
        <div>
          <span>Batch 01</span>
          <h2 id="input-action-title">입력과 액션</h2>
        </div>
        <p>
          확정된 시안은 상황별 variant 후보로 함께 보존합니다. SplitButton은 별도 비교 후 공용
          컴포넌트 설계에 반영합니다.
        </p>
      </header>

      <nav className={styles.categoryNav} aria-label="입력과 액션 목업 종류">
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            aria-pressed={activeCategory === category.id}
            onClick={() => setActiveCategory(category.id)}
          >
            {category.label}
          </button>
        ))}
      </nav>

      <div className={styles.comparisonHeading}>
        <span>현재 비교</span>
        <strong>{activeLabel}</strong>
      </div>

      <div className={styles.comparisonGrid}>
        {visibleDirections.map((defaultDirection) => {
          const direction =
            activeCategory === 'split-button'
              ? splitButtonDirections[defaultDirection.id]
              : activeCategory === 'calendar'
                ? calendarDirections[defaultDirection.id]
                : defaultDirection;
          const selected = (selectedDirections[activeCategory] as readonly DirectionId[]).includes(
            defaultDirection.id,
          );
          return (
            <article
              className={styles.directionCard}
              key={defaultDirection.id}
              data-direction={defaultDirection.id}
              data-approved={selected || undefined}
            >
              <header>
                <div className={styles.directionMeta}>
                  <span>{direction.label}</span>
                  <small>{selected ? '선택됨' : '제외'}</small>
                </div>
                <h3>{direction.title}</h3>
                <p>{direction.description}</p>
              </header>
              <div
                className={styles.previewSurface}
                key={`${defaultDirection.id}-${activeCategory}`}
              >
                <CategoryPreview category={activeCategory} direction={defaultDirection.id} />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
