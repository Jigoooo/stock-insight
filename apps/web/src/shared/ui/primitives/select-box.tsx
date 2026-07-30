/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Provider-free APG select uses explicit combobox/listbox semantics. */
import { Check, ChevronDown } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import {
  getNextEnabledOptionIndex,
  getTypeaheadOptionIndex,
  resolveSelectableValue,
  type NavigationKey,
  type SelectOption,
} from './select-controls-controller';
import styles from './select-controls.module.css';

import { PresenceRegion } from '@/shared/ui/motion';

export type SelectBoxProps = {
  'aria-label'?: string;
  'aria-labelledby'?: string;
  className?: string;
  defaultValue?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  onValueChange?: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  value?: string;
};

function classNames(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(' ');
}

export function SelectBox({
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  className,
  defaultValue = '',
  disabled = false,
  id,
  name,
  onValueChange,
  options,
  placeholder = '선택하세요',
  value,
}: SelectBoxProps) {
  const generatedId = useId();
  const triggerId = id ?? `${generatedId}-trigger`;
  const listboxId = `${generatedId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const typeaheadRef = useRef('');
  const typeaheadTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const selectedValue = value ?? internalValue;
  const selectedOption = options.find((option) => option.value === selectedValue);
  const activeDescendant =
    open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  const setSelectedValue = (nextValue: string) => {
    if (value === undefined) setInternalValue(nextValue);
    onValueChange?.(nextValue);
  };

  const openListbox = () => {
    const selectedIndex = options.findIndex(
      (option) => option.value === selectedValue && !option.disabled,
    );
    const firstIndex = getNextEnabledOptionIndex({
      currentIndex: -1,
      key: 'ArrowDown',
      options,
    });
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : firstIndex);
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
      setOpen(false);
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

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Home':
      case 'End': {
        event.preventDefault();
        const key = event.key as NavigationKey;
        if (!open) {
          openListbox();
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
        setOpen(false);
        return;
      case 'Tab':
        setOpen(false);
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
    <div ref={rootRef} className={classNames(styles.control, className)}>
      {name ? <input ref={hiddenInputRef} type="hidden" name={name} value={selectedValue} /> : null}
      <button
        id={triggerId}
        aria-activedescendant={activeDescendant}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        className={styles.trigger}
        disabled={disabled}
        role="combobox"
        type="button"
        onClick={() => (open ? setOpen(false) : openListbox())}
        onKeyDown={handleKeyDown}
      >
        <span className={classNames(styles.triggerText, !selectedOption && styles.placeholder)}>
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDown aria-hidden="true" />
      </button>
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
        {options.map((option, index) => {
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
              onPointerDown={keepTriggerFocus}
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
        })}
      </PresenceRegion>
    </div>
  );
}
