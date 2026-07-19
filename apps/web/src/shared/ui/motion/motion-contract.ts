export const MOTION_RECIPES = [
  'pressable',
  'quiet',
  'field-shell',
  'switch',
  'toggle',
  'overlay',
  'none',
] as const;

export type MotionRecipe = (typeof MOTION_RECIPES)[number];

export type MotionAvailabilityElement = {
  closest: (selector: string) => unknown | null;
  getAttribute: (name: string) => string | null;
  matches: (selector: string) => boolean;
};

export type MotionRecipeElement = {
  dataset: { motion?: string };
};

export const MOTION_SELECTOR = '[data-motion]';
export const DELEGATED_MOTION_RECIPES = [
  'pressable',
  'quiet',
] as const satisfies readonly MotionRecipe[];
export const COMPONENT_OWNED_MOTION_RECIPES = [
  'field-shell',
  'switch',
  'toggle',
  'overlay',
] as const satisfies readonly MotionRecipe[];

const motionRecipeSet: ReadonlySet<string> = new Set(MOTION_RECIPES);

function isMotionRecipe(value: string | undefined): value is MotionRecipe {
  return value !== undefined && motionRecipeSet.has(value);
}

export function readMotionRecipe(element: MotionRecipeElement): MotionRecipe | null {
  const recipe = element.dataset.motion;
  if (!isMotionRecipe(recipe) || recipe === 'none') return null;
  return recipe;
}

export function isDelegatedMotionRecipe(
  recipe: MotionRecipe | null,
): recipe is (typeof DELEGATED_MOTION_RECIPES)[number] {
  return recipe !== null && DELEGATED_MOTION_RECIPES.some((candidate) => candidate === recipe);
}

export function resolveDelegatedMotionTarget(target: EventTarget | null) {
  if (!target || typeof (target as { closest?: unknown }).closest !== 'function') return null;
  const element = (
    target as EventTarget & { closest: (selector: string) => MotionRecipeElement | null }
  ).closest(MOTION_SELECTOR);
  if (!element) return null;

  const recipe = readMotionRecipe(element);
  if (!isDelegatedMotionRecipe(recipe)) return null;
  return { element, recipe };
}

export function isMotionTargetUnavailable(element: MotionAvailabilityElement) {
  return (
    element.matches(':disabled') ||
    element.getAttribute('aria-disabled') === 'true' ||
    element.closest('[inert]') !== null
  );
}
