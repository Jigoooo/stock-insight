export type ButtonInteractionTarget = {
  disabled?: boolean;
  closest: (selector: string) => unknown;
  getAttribute: (name: string) => string | null;
};

export type ButtonInteractionEvent = {
  currentTarget: ButtonInteractionTarget;
  preventDefault: () => void;
  stopPropagation: () => void;
};

export function isButtonInteractionUnavailable(target: ButtonInteractionTarget) {
  return Boolean(
    target.disabled ||
    target.getAttribute('aria-disabled') === 'true' ||
    target.getAttribute('data-pending') === 'true' ||
    target.closest('[inert]'),
  );
}

export function guardButtonInteraction(event: ButtonInteractionEvent) {
  if (!isButtonInteractionUnavailable(event.currentTarget)) return false;
  event.preventDefault();
  event.stopPropagation();
  return true;
}
