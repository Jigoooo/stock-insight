/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Provider-free APG combobox uses an explicit popup listbox. */
import { Check, X } from 'lucide-react';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import {
  filterSelectOptions,
  getNextEnabledOptionIndex,
  resolveSelectableValue,
  type NavigationKey,
  type SelectOption,
  type SelectOptionFilter,
} from './select-controls-controller';
import styles from './select-controls.module.css';

import { PresenceRegion } from '@/shared/ui/motion';

export type ComboboxProps = {
  'aria-label'?: string;
  'aria-labelledby'?: string;
  className?: string;
  clearLabel?: string;
  defaultQuery?: string;
  defaultValue?: string;
  disabled?: boolean;
  emptyMessage?: string;
  filter?: SelectOptionFilter;
  id?: string;
  name?: string;
  onQueryChange?: (query: string) => void;
  onValueChange?: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  query?: string;
  value?: string;
};

function classNames(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(' ');
}

export function Combobox({
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  className,
  clearLabel = '선택 지우기',
  defaultQuery,
  defaultValue = '',
  disabled = false,
  emptyMessage = '일치하는 항목이 없습니다.',
  filter,
  id,
  name,
  onQueryChange,
  onValueChange,
  options,
  placeholder = '검색하거나 선택하세요',
  query,
  value,
}: ComboboxProps) {
  const generatedId = useId();
  const inputId = id ?? `${generatedId}-input`;
  const listboxId = `${generatedId}-listbox`;
  const defaultSelectedLabel = options.find((option) => option.value === defaultValue)?.label ?? '';
  const initialQuery = defaultQuery ?? defaultSelectedLabel;
  const rootRef = useRef<HTMLDivElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [internalQuery, setInternalQuery] = useState(initialQuery);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const selectedValue = value ?? internalValue;
  const queryValue = query ?? internalQuery;
  const filteredOptions = useMemo(
    () => filterSelectOptions(options, queryValue, filter),
    [filter, options, queryValue],
  );
  const activeDescendant =
    open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  const setSelectedValue = (nextValue: string) => {
    if (value === undefined) setInternalValue(nextValue);
    onValueChange?.(nextValue);
  };

  const setQueryValue = (nextQuery: string) => {
    if (query === undefined) setInternalQuery(nextQuery);
    onQueryChange?.(nextQuery);
  };

  const selectIndex = (index: number) => {
    const option = filteredOptions[index];
    if (!option) return;
    const nextValue = resolveSelectableValue(option, selectedValue);
    if (nextValue === selectedValue && option.disabled) return;
    setSelectedValue(nextValue);
    setQueryValue(option.label);
    setActiveIndex(index);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
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
      if (query === undefined) setInternalQuery(initialQuery);
      setOpen(false);
      onValueChange?.(defaultValue);
      onQueryChange?.(initialQuery);
    };
    form.addEventListener('reset', reset);
    return () => form.removeEventListener('reset', reset);
  }, [defaultValue, initialQuery, onQueryChange, onValueChange, query, value]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextQuery = event.currentTarget.value;
    setQueryValue(nextQuery);
    const selectedLabel = options.find((option) => option.value === selectedValue)?.label;
    if (nextQuery !== selectedLabel) setSelectedValue('');
    setActiveIndex(-1);
    setOpen(true);
  };

  const handleFocus = (_event: FocusEvent<HTMLInputElement>) => {
    if (!disabled) setOpen(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Home':
      case 'End':
        event.preventDefault();
        setOpen(true);
        {
          const key = event.key as NavigationKey;
          setActiveIndex((currentIndex) =>
            getNextEnabledOptionIndex({
              currentIndex,
              key,
              options: filteredOptions,
            }),
          );
        }
        return;
      case 'Enter':
        if (!open || activeIndex < 0) return;
        event.preventDefault();
        selectIndex(activeIndex);
        return;
      case 'Escape':
        if (open) event.preventDefault();
        setOpen(false);
        return;
      case 'Tab':
        setOpen(false);
        return;
      default:
        return;
    }
  };

  const keepInputFocus = (event: ReactPointerEvent) => {
    event.preventDefault();
  };

  const clear = () => {
    setQueryValue('');
    setSelectedValue('');
    setActiveIndex(-1);
    setOpen(true);
    inputRef.current?.focus();
  };

  return (
    <div ref={rootRef} className={classNames(styles.control, className)}>
      {name ? <input ref={hiddenInputRef} type="hidden" name={name} value={selectedValue} /> : null}
      <div className={styles.inputShell} data-disabled={disabled}>
        <input
          ref={inputRef}
          id={inputId}
          aria-activedescendant={activeDescendant}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledby}
          autoComplete="off"
          className={styles.input}
          disabled={disabled}
          placeholder={placeholder}
          role="combobox"
          value={queryValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
        />
        {queryValue || selectedValue ? (
          <button
            aria-label={clearLabel}
            className={styles.clearButton}
            disabled={disabled}
            type="button"
            onClick={clear}
          >
            <X aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <PresenceRegion
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        className={styles.listbox}
        exit={{ opacity: 0, scale: 0.98, y: -4 }}
        id={listboxId}
        initial={{ opacity: 0, scale: 0.98, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        presenceKey={listboxId}
        present={open}
        role="listbox"
      >
        {filteredOptions.length === 0 ? (
          <div
            aria-disabled="true"
            aria-selected="false"
            className={styles.empty}
            role="option"
            tabIndex={-1}
          >
            {emptyMessage}
          </div>
        ) : (
          filteredOptions.map((option, index) => {
            const selected = option.value === selectedValue;
            return (
              <button
                key={option.value}
                id={`${listboxId}-option-${index}`}
                aria-disabled={option.disabled || undefined}
                aria-selected={selected}
                className={styles.option}
                data-active={index === activeIndex}
                role="option"
                tabIndex={-1}
                type="button"
                onClick={() => selectIndex(index)}
                onMouseEnter={() => {
                  if (!option.disabled) setActiveIndex(index);
                }}
                onPointerDown={keepInputFocus}
              >
                <span className={styles.optionCopy}>
                  <span className={styles.optionLabel}>{option.label}</span>
                  {option.description ? (
                    <span className={styles.optionDescription}>{option.description}</span>
                  ) : null}
                </span>
                {selected ? <Check className={styles.optionCheck} aria-hidden="true" /> : null}
              </button>
            );
          })
        )}
      </PresenceRegion>
    </div>
  );
}
