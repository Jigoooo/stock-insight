import { useId, useRef, useState } from 'react';

import styles from './input-action-catalog.module.css';

type DirectionId = 'hairline' | 'inset' | 'rail';
type CategoryId = 'radio' | 'slider' | 'calendar' | 'range' | 'upload' | 'otp' | 'buttons';

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
  { id: 'buttons', label: 'ButtonGroup · SplitButton' },
] as const satisfies ReadonlyArray<{ id: CategoryId; label: string }>;

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
          ←
        </button>
        <strong>2026년 8월</strong>
        <button type="button" aria-label="다음 달">
          →
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

function UploadPreview({ direction }: { direction: DirectionId }) {
  const inputId = useId();
  const [fileName, setFileName] = useState('');
  return (
    <div
      className={styles.upload}
      data-direction={direction}
      data-filled={Boolean(fileName) || undefined}
    >
      <input
        id={inputId}
        className={styles.visuallyHidden}
        type="file"
        accept=".csv,.xlsx,.pdf"
        onChange={(event) => setFileName(event.currentTarget.files?.[0]?.name ?? '')}
      />
      <span className={styles.uploadIcon} aria-hidden="true">
        ↑
      </span>
      <strong>{fileName || '리서치 파일 추가'}</strong>
      <small>
        {fileName ? '파일이 로컬 목업에 선택되었습니다.' : 'CSV, XLSX, PDF · 최대 10MB'}
      </small>
      <label htmlFor={inputId}>{fileName ? '다른 파일 선택' : '파일 선택'}</label>
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
  const [menuOpen, setMenuOpen] = useState(false);
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
      <div className={styles.splitButton}>
        <button type="button">리포트 저장</button>
        <button
          type="button"
          aria-label="리포트 저장 옵션"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
        >
          ▾
        </button>
        {menuOpen && (
          <div className={styles.splitMenu} role="menu">
            <button type="button" role="menuitem">
              PDF로 저장
            </button>
            <button type="button" role="menuitem">
              링크 복사
            </button>
          </div>
        )}
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
  return <ButtonGroupPreview direction={direction} />;
}

export function InputActionCatalog() {
  const [activeCategory, setActiveCategory] = useState<CategoryId>('radio');
  const activeLabel = categories.find(({ id }) => id === activeCategory)?.label;

  return (
    <section className={styles.catalog} aria-labelledby="input-action-title">
      <header className={styles.catalogHeader}>
        <div>
          <span>Batch 01</span>
          <h2 id="input-action-title">입력과 액션</h2>
        </div>
        <p>
          같은 기능을 세 가지 시각 문법으로 비교합니다. 아직 제품 공용 컴포넌트에는 반영하지
          않습니다.
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
        {directions.map((direction) => (
          <article
            className={styles.directionCard}
            key={direction.id}
            data-direction={direction.id}
          >
            <header>
              <span>{direction.label}</span>
              <h3>{direction.title}</h3>
              <p>{direction.description}</p>
            </header>
            <div className={styles.previewSurface} key={`${direction.id}-${activeCategory}`}>
              <CategoryPreview category={activeCategory} direction={direction.id} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
