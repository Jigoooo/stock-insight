import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Link2,
  Upload,
  X,
} from 'lucide-react';
import { useId, useRef, useState } from 'react';

import styles from './input-action-catalog.module.css';

type DirectionId = 'hairline' | 'inset' | 'rail';
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
  const name = useId();
  const [value, setValue] = useState('watch');
  return (
    <fieldset className={styles.radioGroup} data-direction={direction}>
      <legend>리서치 범위</legend>
      {(
        [
          ['holding', '보유 종목', '포트폴리오와 직접 연결'],
          ['watch', '관심 종목', '추적 중인 종목만 표시'],
          ['market', '시장 전체', '발견 후보까지 확장'],
        ] as const
      ).map(([id, label, description]) => (
        <label
          key={id}
          className={styles.radioOption}
          data-selected={value === id || undefined}
          aria-label={`${label}: ${description}`}
        >
          <input
            type="radio"
            name={name}
            value={id}
            checked={value === id}
            onChange={() => setValue(id)}
          />
          <span className={styles.radioMark} aria-hidden="true" />
          <span>
            <strong>{label}</strong>
            <small>{description}</small>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function SliderPreview({ direction }: { direction: DirectionId }) {
  const [value, setValue] = useState(64);
  return (
    <div className={styles.sliderPreview} data-direction={direction}>
      <div className={styles.controlHeading}>
        <label htmlFor={`slider-${direction}`}>신뢰도 기준</label>
        <output htmlFor={`slider-${direction}`}>{value}%</output>
      </div>
      <input
        id={`slider-${direction}`}
        type="range"
        min="0"
        max="100"
        value={value}
        style={{ '--slider-value': `${value}%` } as React.CSSProperties}
        onChange={(event) => setValue(Number(event.currentTarget.value))}
      />
      <div className={styles.sliderScale} aria-hidden="true">
        <span>넓게</span>
        <span>엄격하게</span>
      </div>
    </div>
  );
}

const calendarDays = Array.from({ length: 28 }, (_, index) => index + 1);

function CalendarPreview({ direction }: { direction: DirectionId }) {
  const [selected, setSelected] = useState(12);
  return (
    <div className={styles.calendar} data-direction={direction}>
      <header>
        <button type="button" aria-label="이전 달">
          <ChevronLeft aria-hidden="true" size={15} strokeWidth={1.8} />
        </button>
        <strong>2026년 8월</strong>
        <button type="button" aria-label="다음 달">
          <ChevronRight aria-hidden="true" size={15} strokeWidth={1.8} />
        </button>
      </header>
      <div className={styles.weekdays} aria-hidden="true">
        {['월', '화', '수', '목', '금', '토', '일'].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className={styles.calendarGrid} aria-label="2026년 8월 날짜">
        {calendarDays.map((day) => (
          <button
            key={day}
            type="button"
            aria-pressed={selected === day}
            data-today={day === 2 || undefined}
            onClick={() => setSelected(day)}
          >
            {day}
          </button>
        ))}
      </div>
    </div>
  );
}

function DateRangePreview({ direction }: { direction: DirectionId }) {
  const [mode, setMode] = useState<'single' | 'range'>('range');
  return (
    <div className={styles.dateRange} data-direction={direction}>
      <div className={styles.miniToggle} aria-label="날짜 선택 방식">
        <button type="button" aria-pressed={mode === 'single'} onClick={() => setMode('single')}>
          하루
        </button>
        <button type="button" aria-pressed={mode === 'range'} onClick={() => setMode('range')}>
          기간
        </button>
      </div>
      <div className={styles.dateFields}>
        <button type="button">
          <small>{mode === 'single' ? '기준일' : '시작일'}</small>
          <strong>2026.08.02</strong>
        </button>
        {mode === 'range' && (
          <>
            <span aria-hidden="true">—</span>
            <button type="button">
              <small>종료일</small>
              <strong>2026.08.16</strong>
            </button>
          </>
        )}
      </div>
      <p>{mode === 'single' ? '해당 거래일의 근거만 표시' : '15일간의 변화와 근거를 함께 표시'}</p>
    </div>
  );
}

type UploadMode = 'single' | 'multiple';
type UploadDemoState = 'idle' | 'dragging' | 'selected';
type UploadPreviewFile = { id: string; name: string; size: string };

const singleUploadSample: UploadPreviewFile[] = [
  { id: 'portfolio', name: 'portfolio-2026-08.csv', size: '284 KB' },
];

const multipleUploadSamples: UploadPreviewFile[] = [
  ...singleUploadSample,
  { id: 'earnings', name: 'earnings-notes.pdf', size: '1.8 MB' },
  { id: 'watchlist', name: 'watchlist.xlsx', size: '632 KB' },
];

const uploadEnterEase = [0.22, 1, 0.36, 1] as const;
const uploadExitEase = [0.4, 0, 1, 1] as const;

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadPreview({ direction }: { direction: DirectionId }) {
  const inputId = useId();
  const reducedMotion = useReducedMotion();
  const [mode, setMode] = useState<UploadMode>('single');
  const [files, setFiles] = useState<UploadPreviewFile[]>([]);
  const [dragActive, setDragActive] = useState(false);

  const updateMode = (nextMode: UploadMode) => {
    setMode(nextMode);
    if (files.length > 0) {
      setFiles(nextMode === 'single' ? singleUploadSample : multipleUploadSamples);
    }
  };

  const updateDemoState = (state: UploadDemoState) => {
    setDragActive(state === 'dragging');
    if (state === 'idle' || state === 'dragging') {
      setFiles([]);
      return;
    }
    setFiles(mode === 'single' ? singleUploadSample : multipleUploadSamples);
  };

  const updateFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const nextFiles = Array.from(fileList).map((file, index) => ({
      id: `${file.name}-${file.lastModified}-${index}`,
      name: file.name,
      size: formatFileSize(file.size),
    }));
    setFiles(mode === 'single' ? nextFiles.slice(0, 1) : nextFiles);
    setDragActive(false);
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

      <div
        className={styles.upload}
        data-direction={direction}
        data-filled={files.length > 0 || undefined}
        data-drag-active={dragActive || undefined}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setDragActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          updateFiles(event.dataTransfer.files);
        }}
      >
        <input
          id={inputId}
          className={styles.visuallyHidden}
          type="file"
          accept=".csv,.xlsx,.pdf"
          multiple={mode === 'multiple'}
          onChange={(event) => updateFiles(event.currentTarget.files)}
        />

        {dragActive ? (
          <div className={styles.uploadDropFeedback} aria-live="polite">
            <Upload aria-hidden="true" size={20} strokeWidth={1.7} />
            <strong>{files.length > 0 && mode === 'single' ? '놓아서 교체' : '놓아서 추가'}</strong>
            <small>CSV, XLSX, PDF 파일을 여기에 놓으세요.</small>
          </div>
        ) : (
          <>
            <span className={styles.uploadIcon} aria-hidden="true">
              <Upload size={17} strokeWidth={1.8} />
            </span>
            <strong>
              {files.length > 0 ? `${files.length}개 파일 선택됨` : '리서치 파일 추가'}
            </strong>
            <small>
              {files.length > 0
                ? mode === 'single'
                  ? '새 파일을 놓으면 현재 파일을 교체합니다.'
                  : '파일을 더 놓거나 목록에서 개별 삭제할 수 있습니다.'
                : '끌어다 놓거나 직접 선택 · CSV, XLSX, PDF · 최대 10MB'}
            </small>
            <label htmlFor={inputId}>{files.length > 0 ? '파일 다시 선택' : '파일 선택'}</label>
          </>
        )}
      </div>

      <ul
        className={styles.uploadFileList}
        aria-label="선택된 파일"
        aria-hidden={files.length === 0 || undefined}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {files.map((file, index) => {
            const exitX = index % 2 === 0 ? -18 : 18;

            return (
              <motion.li
                key={file.id}
                layout={reducedMotion ? false : 'position'}
                initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                animate={
                  reducedMotion
                    ? { opacity: 1, transition: { duration: 0.1 } }
                    : {
                        opacity: 1,
                        x: 0,
                        y: 0,
                        scale: 1,
                        transition: {
                          duration: 0.16,
                          delay: index * 0.028,
                          ease: uploadEnterEase,
                        },
                      }
                }
                exit={
                  reducedMotion
                    ? { opacity: 0, transition: { duration: 0.1 } }
                    : {
                        opacity: 0,
                        x: exitX,
                        scale: 0.985,
                        transition: { duration: 0.14, ease: uploadExitEase },
                      }
                }
                transition={
                  reducedMotion
                    ? undefined
                    : {
                        layout: {
                          type: 'spring',
                          duration: 0.24,
                          bounce: 0,
                          delay: index * 0.018,
                        },
                      }
                }
              >
                <span className={styles.uploadFileIcon} aria-hidden="true">
                  <FileText size={15} strokeWidth={1.7} />
                </span>
                <span className={styles.uploadFileMeta}>
                  <strong>{file.name}</strong>
                  <small>{file.size} · 준비됨</small>
                </span>
                <button
                  type="button"
                  aria-label={`${file.name} 삭제`}
                  onClick={() =>
                    setFiles((current) => current.filter((item) => item.id !== file.id))
                  }
                >
                  <X aria-hidden="true" size={14} strokeWidth={1.8} />
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}

function OtpPreview({ direction }: { direction: DirectionId }) {
  const otpPositions = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'] as const;
  const [digits, setDigits] = useState(['4', '7', '', '', '', '']);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  return (
    <div className={styles.otp} data-direction={direction}>
      <div className={styles.controlHeading}>
        <strong>확인 코드</strong>
        <small>02:41</small>
      </div>
      <div className={styles.otpCells}>
        {digits.map((digit, index) => (
          <input
            key={otpPositions[index]}
            ref={(node) => {
              inputsRef.current[index] = node;
            }}
            aria-label={`OTP ${index + 1}번째 자리`}
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(event) => {
              const nextDigit = event.currentTarget.value.replace(/\D/g, '').slice(-1);
              setDigits((current) =>
                current.map((item, itemIndex) => (itemIndex === index ? nextDigit : item)),
              );
              if (nextDigit) inputsRef.current[index + 1]?.focus();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Backspace' && !digit) inputsRef.current[index - 1]?.focus();
            }}
          />
        ))}
      </div>
      <p aria-live="polite">
        {digits.every(Boolean) ? '코드 입력 완료' : '나머지 숫자를 입력하세요.'}
      </p>
    </div>
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
