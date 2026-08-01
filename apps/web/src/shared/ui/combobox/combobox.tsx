/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Provider-free APG combobox uses an explicit popup listbox. */
import { X } from 'lucide-react';
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

import comboStyles from './combobox.module.css';

import { MotionButton, PresenceRegion } from '@/shared/ui/motion';
import { useMotionPreferences } from '@/shared/ui/motion/use-motion-preferences';
import {
  optionCloseDurationMs,
  SelectOptionItem,
  type SelectDensity,
} from '@/shared/ui/select/select';
import {
  filterSelectOptions,
  getNextEnabledOptionIndex,
  getOptionText,
  resolveSelectableValue,
  type NavigationKey,
  type SelectOption,
  type SelectOptionFilter,
} from '@/shared/ui/select/select-controller';
import selectStyles from '@/shared/ui/select/select.module.css';

export type ComboboxProps = {
  'aria-label'?: string;
  'aria-labelledby'?: string;
  className?: string;
  clearLabel?: string;
  defaultQuery?: string;
  defaultValue?: string;
  density?: SelectDensity;
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
  density = 'descriptive',
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
  const defaultSelectedLabel = options.find((option) => option.value === defaultValue);
  const initialQuery =
    defaultQuery ?? (defaultSelectedLabel ? getOptionText(defaultSelectedLabel) : '');
  const rootRef = useRef<HTMLDivElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [internalQuery, setInternalQuery] = useState(initialQuery);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const { reducedMotion } = useMotionPreferences();
  const selectedValue = value ?? internalValue;
  const queryValue = query ?? internalQuery;
  const filteredOptions = useMemo(
    () => filterSelectOptions(options, queryValue, filter),
    [filter, options, queryValue],
  );
  const activeDescendant =
    open && activeIndex >= 0 && filteredOptions[activeIndex]
      ? `${listboxId}-option-${activeIndex}`
      : undefined;

  const closeListbox = () => setOpen(false);

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
    setQueryValue(getOptionText(option));
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
      if (query === undefined) setInternalQuery(initialQuery);
      closeListbox();
      onValueChange?.(defaultValue);
      onQueryChange?.(initialQuery);
    };
    form.addEventListener('reset', reset);
    return () => form.removeEventListener('reset', reset);
  }, [defaultValue, initialQuery, onQueryChange, onValueChange, query, value]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextQuery = event.currentTarget.value;
    setQueryValue(nextQuery);
    const selectedOption = options.find((option) => option.value === selectedValue);
    if (nextQuery !== (selectedOption ? getOptionText(selectedOption) : '')) setSelectedValue('');
    setActiveIndex(-1);
    setOpen(true);
  };

  const handleFocus = (_event: FocusEvent<HTMLInputElement>) => {
    if (!disabled) {
      setOpen(true);
    }
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
        closeListbox();
        return;
      case 'Tab':
        if (open && activeIndex >= 0) selectIndex(activeIndex);
        else closeListbox();
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
    <div
      ref={rootRef}
      className={classNames(selectStyles.root, comboStyles.root, className)}
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
      <div
        className={selectStyles.inputShell}
        data-disabled={disabled}
        data-slot="select-input-shell"
      >
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
          className={selectStyles.input}
          data-slot="select-control"
          disabled={disabled}
          placeholder={placeholder}
          role="combobox"
          value={queryValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
        />
        {queryValue || selectedValue ? (
          <MotionButton
            aria-label={clearLabel}
            className={selectStyles.clearButton}
            data-motion-owner="motion"
            data-slot="select-clear-control"
            disabled={disabled}
            hoverScale={1}
            tapScale={1}
            type="button"
            onClick={clear}
          >
            <X className={comboStyles.clearIcon} aria-hidden="true" />
          </MotionButton>
        ) : null}
      </div>
      <PresenceRegion
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        className={selectStyles.listbox}
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
        {filteredOptions.length === 0 ? (
          <div
            aria-disabled="true"
            aria-selected="false"
            className={selectStyles.empty}
            data-slot="select-option"
            role="option"
            tabIndex={-1}
          >
            {emptyMessage}
          </div>
        ) : (
          filteredOptions.map((option, index) => (
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
              onPointerDown={keepInputFocus}
              onSelect={() => selectIndex(index)}
              option={option}
              selected={option.value === selectedValue}
            />
          ))
        )}
      </PresenceRegion>
    </div>
  );
}
