import { Search } from 'lucide-react';
import { useDeferredValue } from 'react';

import styles from './research-workspace-page.module.css';

import { SearchField } from '@/shared/ui/primitives';

export function useDeferredWorkspaceSearch(query: string) {
  const deferredQuery = useDeferredValue(query);
  const pending = query !== deferredQuery;
  return { deferredQuery, pending };
}

export function WorkspaceSearch({
  disabled,
  onQueryChange,
  onSubmit,
  pending,
  query,
}: {
  disabled: boolean;
  onQueryChange: (query: string) => void;
  onSubmit: () => void;
  pending: boolean;
  query: string;
}) {
  return (
    <SearchField
      className={styles.search}
      icon={<Search aria-hidden="true" />}
      data-pending={pending || undefined}
      aria-busy={pending || undefined}
      inputProps={{
        value: query,
        onChange: (event) => onQueryChange(event.target.value),
        onKeyDown: (event) => event.key === 'Enter' && onSubmit(),
        placeholder: '종목명·티커 검색',
        'aria-label': '종목명 또는 티커 검색',
        disabled,
      }}
    />
  );
}
