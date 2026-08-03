'use client';

import { Search } from 'lucide-react';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import styles from './command-palette.module.css';

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';

export type CommandPaletteVariant = 'compact-command' | 'split-context' | 'quick-actions';

export type CommandPaletteItem<Value extends string = string> = {
  description: string;
  group: string;
  keywords?: ReadonlyArray<string>;
  label: string;
  shortcut?: ReadonlyArray<string>;
  value: Value;
};

export type CommandPalettePreviewDetail = {
  id: string;
  label: ReactNode;
  value: ReactNode;
};

export type CommandPaletteProps<Value extends string = string> = {
  description: ReactNode;
  emptyText?: ReactNode;
  escapeLabel?: string;
  groupLabels?: Readonly<Record<string, ReactNode>>;
  hotkey?: boolean;
  items: ReadonlyArray<CommandPaletteItem<Value>>;
  locale?: string;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: CommandPaletteItem<Value>) => void;
  open: boolean;
  previewDetails?: ReadonlyArray<CommandPalettePreviewDetail>;
  searchLabel?: string;
  searchPlaceholder?: string;
  title: ReactNode;
  variant?: CommandPaletteVariant;
};

type CommandPaletteContentProps<Value extends string> = Omit<
  CommandPaletteProps<Value>,
  'hotkey' | 'open' | 'variant'
> & {
  variant: CommandPaletteVariant;
};

function CommandOption<Value extends string>({
  active,
  index,
  item,
  onActivate,
  onExecute,
  optionId,
}: {
  active: boolean;
  index: number;
  item: CommandPaletteItem<Value>;
  onActivate: (index: number) => void;
  onExecute: (item: CommandPaletteItem<Value>) => void;
  optionId: string;
}) {
  return (
    <button
      aria-selected={active}
      className={styles.option}
      data-active={active || undefined}
      id={optionId}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- command options must remain buttons inside the ARIA listbox.
      role="option"
      type="button"
      onClick={() => onExecute(item)}
      onFocus={() => onActivate(index)}
      onMouseEnter={() => onActivate(index)}
    >
      <span className={styles.optionCopy}>
        <strong>{item.label}</strong>
        <span>{item.description}</span>
      </span>
      {item.shortcut ? (
        <span className={styles.shortcut} aria-label={`단축키 ${item.shortcut.join(' ')}`}>
          {item.shortcut.map((key) => (
            <kbd key={key}>{key}</kbd>
          ))}
        </span>
      ) : null}
    </button>
  );
}

function CommandPaletteContent<Value extends string>({
  description,
  emptyText = '검색 결과가 없습니다.',
  escapeLabel = 'ESC',
  groupLabels,
  items,
  locale,
  onOpenChange,
  onSelect,
  previewDetails,
  searchLabel = '명령 검색',
  searchPlaceholder = '명령 검색',
  title,
  variant,
}: CommandPaletteContentProps<Value>) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scopeId = useId().replaceAll(':', '');
  const resultsId = `command-palette-results-${scopeId}`;
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const filteredItems = useMemo(() => {
    if (!normalizedQuery) return items;

    return items.filter((item) =>
      [item.label, item.description, ...(item.keywords ?? [])]
        .join(' ')
        .toLocaleLowerCase(locale)
        .includes(normalizedQuery),
    );
  }, [items, locale, normalizedQuery]);
  const activeItem = filteredItems[activeIndex];
  const groups = Array.from(new Set(filteredItems.map((item) => item.group)));
  const optionId = (index: number) => `command-palette-option-${scopeId}-${index}`;

  const executeCommand = (item: CommandPaletteItem<Value>) => {
    onSelect(item);
    onOpenChange(false);
  };

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
      case 'Enter':
        event.preventDefault();
        if (activeItem) executeCommand(activeItem);
        break;
      case 'Escape':
        event.preventDefault();
        onOpenChange(false);
        break;
    }
  };

  const renderOptions = (groupItems: ReadonlyArray<CommandPaletteItem<Value>>) =>
    groupItems.map((item) => {
      const index = filteredItems.indexOf(item);

      return (
        <CommandOption
          active={index === activeIndex}
          index={index}
          item={item}
          key={item.value}
          optionId={optionId(index)}
          onActivate={setActiveIndex}
          onExecute={executeCommand}
        />
      );
    });

  return (
    <DialogContent
      className={styles.dialog}
      data-command-palette=""
      data-command-variant={variant}
      size={variant === 'split-context' ? 'lg' : variant === 'quick-actions' ? 'sm' : 'md'}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        searchInputRef.current?.focus();
      }}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogBody className={styles.body}>
        <div className={styles.search} data-slot="command-palette-search">
          <Search aria-hidden="true" size={16} />
          <Input
            ref={searchInputRef}
            aria-activedescendant={activeItem ? optionId(activeIndex) : undefined}
            aria-autocomplete="list"
            aria-controls={resultsId}
            aria-expanded="true"
            aria-label={searchLabel}
            density="search"
            placeholder={searchPlaceholder}
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
          <kbd>{escapeLabel}</kbd>
        </div>

        {filteredItems.length === 0 ? (
          <div className={styles.empty}>{emptyText}</div>
        ) : (
          <div className={styles.layout} data-split={variant === 'split-context' || undefined}>
            <div
              className={styles.results}
              data-density={variant === 'quick-actions' ? 'compact' : 'default'}
              data-slot="command-results"
              id={resultsId}
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- this custom command collection is not a native select.
              role="listbox"
            >
              {variant === 'split-context'
                ? renderOptions(filteredItems)
                : groups.map((group) => {
                    const groupItems = filteredItems.filter((item) => item.group === group);
                    const groupId = `command-palette-group-${scopeId}-${groups.indexOf(group)}`;

                    return (
                      <div
                        aria-labelledby={groupId}
                        className={styles.group}
                        key={group}
                        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- visual command groups label listbox options.
                        role="group"
                      >
                        <span id={groupId}>{groupLabels?.[group] ?? group}</span>
                        {renderOptions(groupItems)}
                      </div>
                    );
                  })}
            </div>

            {variant === 'split-context' && activeItem ? (
              <aside className={styles.preview} data-slot="command-preview">
                <span>선택한 명령</span>
                <h3>{activeItem.label}</h3>
                <p>{activeItem.description}</p>
                <dl>
                  <div>
                    <dt>분류</dt>
                    <dd>{activeItem.group}</dd>
                  </div>
                  {previewDetails?.map((detail) => (
                    <div key={detail.id}>
                      <dt>{detail.label}</dt>
                      <dd>{detail.value}</dd>
                    </div>
                  ))}
                </dl>
              </aside>
            ) : null}
          </div>
        )}
      </DialogBody>
    </DialogContent>
  );
}

export function CommandPalette<Value extends string = string>({
  hotkey = false,
  onOpenChange,
  open,
  variant = 'compact-command',
  ...props
}: CommandPaletteProps<Value>) {
  useEffect(() => {
    if (!hotkey) return;

    const handleGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(true);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [hotkey, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <CommandPaletteContent
          {...props}
          key={variant}
          onOpenChange={onOpenChange}
          variant={variant}
        />
      ) : null}
    </Dialog>
  );
}
