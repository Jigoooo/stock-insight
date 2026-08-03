export type PaginationActionDisabledState = {
  ariaDisabled?: boolean | 'false' | 'true';
  disabled?: boolean;
};

type PaginationActionEvent = {
  defaultPrevented: boolean;
  preventDefault: () => void;
  stopPropagation: () => void;
};

type PaginationActionHandler<Event extends PaginationActionEvent> = (event: Event) => void;

export function isPaginationActionDisabled(...states: PaginationActionDisabledState[]) {
  return states.some(
    ({ ariaDisabled, disabled }) =>
      disabled === true || ariaDisabled === true || ariaDisabled === 'true',
  );
}

export function paginationActionSemantics(disabled: boolean, nativeButton: boolean) {
  return {
    ariaDisabled: disabled || undefined,
    nativeDisabled: nativeButton && disabled ? true : undefined,
    tabIndex: disabled ? -1 : undefined,
  };
}

export function composePaginationActionClick<Event extends PaginationActionEvent>({
  childOnClick,
  disabled,
  onClick,
}: {
  childOnClick?: PaginationActionHandler<Event>;
  disabled: boolean;
  onClick?: PaginationActionHandler<Event>;
}) {
  return (event: Event) => {
    if (disabled) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    childOnClick?.(event);
    if (!event.defaultPrevented) onClick?.(event);
  };
}

type SlottedPaginationActionProps<Element extends HTMLElement> = PaginationActionDisabledState & {
  'aria-disabled'?: boolean | 'false' | 'true';
  className?: string;
  onClick?: (event: MouseEvent<Element>) => void;
  tabIndex?: number;
};

export function prepareSlottedPaginationAction<Element extends HTMLElement>(
  children: ReactNode,
  state: PaginationActionDisabledState,
  onClick?: (event: MouseEvent<Element>) => void,
) {
  const child = Children.only(children);
  if (!isValidElement<SlottedPaginationActionProps<Element>>(child)) {
    throw new Error('Pagination asChild requires one valid element');
  }

  const nativeButton = child.type === 'button';
  const disabled = isPaginationActionDisabled(state, {
    ariaDisabled: child.props['aria-disabled'],
    disabled: child.props.disabled,
  });
  const semantics = paginationActionSemantics(disabled, nativeButton);
  const handleClick = composePaginationActionClick<MouseEvent<Element>>({
    childOnClick: child.props.onClick,
    disabled,
    onClick,
  });
  const slottedChild = cloneElement(child, {
    'aria-disabled': semantics.ariaDisabled ?? child.props['aria-disabled'],
    disabled: nativeButton ? (semantics.nativeDisabled ?? child.props.disabled) : undefined,
    onClick: undefined,
    tabIndex: semantics.tabIndex ?? child.props.tabIndex,
  });

  return { handleClick, semantics, slottedChild };
}
import { Children, cloneElement, isValidElement, type MouseEvent, type ReactNode } from 'react';
