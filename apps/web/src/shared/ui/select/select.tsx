/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Provider-free APG select uses explicit combobox/listbox semantics. */
import { Check, ChevronDown } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react';

import {
  getNextEnabledOptionIndex,
  getTypeaheadOptionIndex,
  resolveSelectableValue,
  type NavigationKey,
  type SelectOption,
} from './select-controller';
import styles from './select.module.css';

import { MotionButton, PresenceRegion, useMotionPreferences } from '@/shared/ui/motion';

export const optionCloseDurationMs = 155;

export type SelectDensity = 'compact' | 'descriptive';

export type SelectProps = {
  'aria-label'?: string;
  'aria-labelledby'?: string;
  className?: string;
  defaultValue?: string;
  density?: SelectDensity;
  disabled?: boolean;
  id?: string;
  name?: string;
  onValueChange?: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  value?: string;
};

type SelectOptionItemProps = {
  highlighted: boolean;
  id: string;
  onHighlight: () => void;
  onPointerDown: (event: ReactPointerEvent) => void;
  onSelect: () => void;
  option: SelectOption;
  ref?: Ref<HTMLButtonElement>;
  selected: boolean;
};

function classNames(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(' ');
}

export function SelectOptionItem({
  highlighted,
  id,
  onHighlight,
  onPointerDown,
  onSelect,
  option,
  ref,
  selected,
}: SelectOptionItemProps) {
  return (
    <MotionButton
      ref={ref}
      id={id}
      aria-disabled={option.disabled || undefined}
      aria-selected={selected}
      className={styles.option}
      data-disabled={option.disabled || undefined}
      data-highlighted={highlighted}
      data-motion-owner="motion"
      data-selected={selected}
      data-slot="select-option"
      hoverScale={1}
      role="option"
      tabIndex={-1}
      tapScale={1}
      type="button"
      onClick={onSelect}
      onMouseEnter={onHighlight}
      onPointerDown={onPointerDown}
    >
      <span className={styles.optionCopy}>
        <span className={styles.optionLabel} data-slot="select-label">
          {option.label}
        </span>
        {option.description ? (
          <span className={styles.optionDescription} data-slot="select-description">
            {option.description}
          </span>
        ) : null}
      </span>
      <PresenceRegion
        aria-hidden="true"
        className={styles.optionCheck}
        initial={{ opacity: 0, scale: 0.76 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.82 }}
        presenceKey={`${id}-check`}
        present={selected}
      >
        <Check aria-hidden="true" />
      </PresenceRegion>
    </MotionButton>
  );
}

export function Select({
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  className,
  defaultValue = '',
  density = 'compact',
  disabled = false,
  id,
  name,
  onValueChange,
  options,
  placeholder = '선택하세요',
  value,
}: SelectProps) {
  const generatedId = useId();
  const triggerId = id ?? `${generatedId}-trigger`;
  const listboxId = `${generatedId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const typeaheadRef = useRef('');
  const typeaheadTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const { reducedMotion } = useMotionPreferences();
  const selectedValue = value ?? internalValue;
  const selectedOption = options.find((option) => option.value === selectedValue);
  const activeDescendant =
    open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  const closeListbox = () => setOpen(false);

  const setSelectedValue = (nextValue: string) => {
    if (value === undefined) setInternalValue(nextValue);
    onValueChange?.(nextValue);
  };

  const openListbox = (placement: 'selected' | 'first' | 'last' = 'selected') => {
    const selectedIndex = options.findIndex(
      (option) => option.value === selectedValue && !option.disabled,
    );
    const boundaryIndex = getNextEnabledOptionIndex({
      currentIndex: -1,
      key: placement === 'last' ? 'End' : 'Home',
      options,
    });
    setActiveIndex(placement === 'selected' && selectedIndex >= 0 ? selectedIndex : boundaryIndex);
    setOpen(true);
  };

  const selectIndex = (index: number) => {
    const option = options[index];
    if (!option) return;
    const nextValue = resolveSelectableValue(option, selectedValue);
    if (nextValue === selectedValue && option.disabled) return;
    setSelectedValue(nextValue);
    setActiveIndex(index);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        closeListbox();
      }
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  useEffect(() => {
    const form = hiddenInputRef.current?.form;
    if (!form) return;
    const reset = () => {
      if (value === undefined) setInternalValue(defaultValue);
      closeListbox();
      onValueChange?.(defaultValue);
    };
    form.addEventListener('reset', reset);
    return () => form.removeEventListener('reset', reset);
  }, [defaultValue, onValueChange, value]);

  useEffect(
    () => () => {
      if (typeaheadTimerRef.current) clearTimeout(typeaheadTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Home':
      case 'End': {
        event.preventDefault();
        const key = event.key as NavigationKey;
        if (!open) {
          openListbox(key === 'Home' ? 'first' : key === 'End' ? 'last' : 'selected');
          return;
        }
        setActiveIndex((currentIndex) => getNextEnabledOptionIndex({ currentIndex, key, options }));
        return;
      }
      case 'Enter':
      case ' ': {
        event.preventDefault();
        if (!open) {
          openListbox();
          return;
        }
        selectIndex(activeIndex);
        return;
      }
      case 'Escape':
        if (open) event.preventDefault();
        closeListbox();
        return;
      case 'Tab':
        if (open && activeIndex >= 0) selectIndex(activeIndex);
        else closeListbox();
        return;
      default:
        break;
    }

    if (event.key.length !== 1 || event.altKey || event.ctrlKey || event.metaKey) return;
    typeaheadRef.current += event.key;
    if (typeaheadTimerRef.current) clearTimeout(typeaheadTimerRef.current);
    typeaheadTimerRef.current = setTimeout(() => {
      typeaheadRef.current = '';
    }, 500);
    const nextIndex = getTypeaheadOptionIndex({
      currentIndex: activeIndex,
      options,
      query: typeaheadRef.current,
    });
    if (nextIndex >= 0) {
      setActiveIndex(nextIndex);
      setOpen(true);
    }
  };

  const keepTriggerFocus = (event: ReactPointerEvent) => {
    event.preventDefault();
  };

  return (
    <div
      ref={rootRef}
      className={classNames(styles.root, className)}
      data-density={density}
      data-slot="select-root"
    >
      {name ? (
        <input
          ref={hiddenInputRef}
          disabled={disabled}
          type="hidden"
          name={name}
          value={selectedValue}
        />
      ) : null}
      <MotionButton
        id={triggerId}
        aria-activedescendant={activeDescendant}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        className={styles.trigger}
        data-motion-owner="motion"
        data-slot="select-control"
        disabled={disabled}
        hoverScale={1}
        role="combobox"
        tapScale={1}
        type="button"
        onClick={() => (open ? closeListbox() : openListbox())}
        onKeyDown={handleKeyDown}
      >
        <span
          className={classNames(styles.triggerText, !selectedOption && styles.placeholder)}
          data-slot="select-label"
        >
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDown className={styles.indicator} data-slot="select-indicator" aria-hidden="true" />
      </MotionButton>
      <PresenceRegion
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        className={styles.listbox}
        data-slot="select-listbox"
        exit={{ opacity: 0, scale: 0.985, y: -3 }}
        id={listboxId}
        initial={{ opacity: 0, scale: 0.985, y: -3 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        presenceKey={listboxId}
        present={open}
        role="listbox"
        transition={{
          duration: reducedMotion ? 0 : optionCloseDurationMs / 1_000,
          ease: 'easeOut',
        }}
      >
        {options.map((option, index) => (
          <SelectOptionItem
            ref={(element) => {
              optionRefs.current[index] = element;
            }}
            key={option.value}
            highlighted={index === activeIndex}
            id={`${listboxId}-option-${index}`}
            onHighlight={() => {
              if (!option.disabled) setActiveIndex(index);
            }}
            onPointerDown={keepTriggerFocus}
            onSelect={() => selectIndex(index)}
            option={option}
            selected={option.value === selectedValue}
          />
        ))}
      </PresenceRegion>
    </div>
  );
}

export const SelectBox = Select;
export type SelectBoxProps = SelectProps;
