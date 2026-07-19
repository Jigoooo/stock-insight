export type DelegatedMotionRecipe = 'pressable' | 'quiet';
export type DelegatedMotionElement = object;

export type InteractionMotionTarget = {
  element: DelegatedMotionElement;
  recipe: DelegatedMotionRecipe;
};

export type MotionTweenVars = {
  clearProps?: string;
  duration?: number;
  ease?: string;
  onComplete?: () => void;
  opacity?: number;
  overwrite?: 'auto';
  scale?: number;
  y?: number;
};

export type InteractionMotionAdapter = {
  killTweensOf: (element: DelegatedMotionElement) => void;
  set: (element: DelegatedMotionElement, vars: MotionTweenVars) => void;
  to: (element: DelegatedMotionElement, vars: MotionTweenVars) => void;
};

export type MotionMediaQuery = {
  matches: boolean;
  addEventListener: (type: 'change', listener: EventListener) => void;
  removeEventListener: (type: 'change', listener: EventListener) => void;
};

export type MotionRoot = {
  addEventListener: (type: string, listener: EventListener, options?: boolean) => void;
  removeEventListener: (type: string, listener: EventListener, options?: boolean) => void;
};

type InstallDelegatedInteractionMotionOptions = {
  finePointer: MotionMediaQuery;
  isUnavailable: (element: DelegatedMotionElement) => boolean;
  motion: InteractionMotionAdapter;
  motionPreference: MotionMediaQuery;
  readNumber: (token: string) => number;
  readSeconds: (token: string) => number;
  readValue: (token: string) => string;
  resolveTarget: (target: EventTarget | null) => InteractionMotionTarget | null;
  root: MotionRoot;
};

type MotionPointerEvent = Event & {
  button: number;
  pointerId: number;
  pointerType: string;
  relatedTarget: EventTarget | null;
};

export function installDelegatedInteractionMotion({
  finePointer,
  isUnavailable,
  motion,
  motionPreference,
  readNumber,
  readSeconds,
  readValue,
  resolveTarget,
  root,
}: InstallDelegatedInteractionMotionOptions) {
  const activeElements = new Map<DelegatedMotionElement, DelegatedMotionRecipe>();
  const pressedElements = new Map<number, InteractionMotionTarget>();

  const clearMotionProps = (element: DelegatedMotionElement, recipe: DelegatedMotionRecipe) => {
    motion.set(element, { clearProps: recipe === 'quiet' ? 'opacity' : 'transform' });
  };

  const normalizeElement = (element: DelegatedMotionElement, recipe: DelegatedMotionRecipe) => {
    motion.killTweensOf(element);
    clearMotionProps(element, recipe);
    activeElements.delete(element);
  };

  const normalizeActiveElements = () => {
    for (const [element, recipe] of activeElements) normalizeElement(element, recipe);
    activeElements.clear();
    pressedElements.clear();
  };

  const forgetPressedElement = (element: DelegatedMotionElement) => {
    for (const [pointerId, pressedTarget] of pressedElements) {
      if (pressedTarget.element === element) pressedElements.delete(pointerId);
    }
  };

  const restoreElement = (element: DelegatedMotionElement, recipe: DelegatedMotionRecipe) => {
    motion.killTweensOf(element);
    if (motionPreference.matches) {
      normalizeElement(element, recipe);
      return;
    }

    activeElements.set(element, recipe);
    motion.to(element, {
      ...(recipe === 'quiet' ? { opacity: 1 } : { scale: 1, y: 0 }),
      duration: readSeconds('--duration-fast'),
      ease: readValue('--motion-ease-out'),
      overwrite: 'auto',
      onComplete: () => {
        clearMotionProps(element, recipe);
        activeElements.delete(element);
      },
    });
  };

  const onPointerDown = (rawEvent: Event) => {
    const event = rawEvent as MotionPointerEvent;
    if (event.button !== 0 || motionPreference.matches) return;
    const target = resolveTarget(event.target);
    if (!target || isUnavailable(target.element)) return;

    const { element, recipe } = target;
    const previousTarget = pressedElements.get(event.pointerId);
    if (previousTarget && previousTarget.element !== element)
      restoreElement(previousTarget.element, previousTarget.recipe);

    pressedElements.set(event.pointerId, target);
    activeElements.set(element, recipe);
    motion.killTweensOf(element);
    if (recipe === 'quiet') {
      motion.to(element, {
        opacity: readNumber('--motion-quiet-press-opacity'),
        duration: readSeconds('--duration-press'),
        ease: readValue('--motion-ease-press'),
        overwrite: 'auto',
      });
      return;
    }

    motion.to(element, {
      scale: readNumber('--motion-press-scale'),
      y: readNumber('--motion-press-y'),
      duration: readSeconds('--duration-press'),
      ease: readValue('--motion-ease-press'),
      overwrite: 'auto',
    });
  };

  const onPointerRelease = (rawEvent: Event) => {
    const event = rawEvent as MotionPointerEvent;
    const pressedTarget = pressedElements.get(event.pointerId);
    pressedElements.delete(event.pointerId);
    const target = pressedTarget ?? resolveTarget(event.target);
    if (target && activeElements.has(target.element)) restoreElement(target.element, target.recipe);
  };

  const onPointerOver = (rawEvent: Event) => {
    const event = rawEvent as MotionPointerEvent;
    if (event.pointerType !== 'mouse' || !finePointer.matches || motionPreference.matches) return;

    const target = resolveTarget(event.target);
    if (!target || target.recipe !== 'pressable' || isUnavailable(target.element)) return;
    const previousElement = resolveTarget(event.relatedTarget)?.element;
    if (previousElement === target.element) return;

    const { element } = target;
    activeElements.set(element, target.recipe);
    motion.killTweensOf(element);
    motion.to(element, {
      y: readNumber('--motion-hover-y'),
      duration: readSeconds('--duration-fast'),
      ease: readValue('--motion-ease-out'),
      overwrite: 'auto',
    });
  };

  const onPointerOut = (rawEvent: Event) => {
    const event = rawEvent as MotionPointerEvent;
    const target = resolveTarget(event.target);
    if (!target) return;
    const nextElement = resolveTarget(event.relatedTarget)?.element;
    if (nextElement === target.element) return;

    forgetPressedElement(target.element);
    if (activeElements.has(target.element)) restoreElement(target.element, target.recipe);
  };

  const onMotionPreferenceChange = () => {
    if (motionPreference.matches) normalizeActiveElements();
  };

  const onPointerPreferenceChange = () => {
    if (!finePointer.matches) normalizeActiveElements();
  };

  motionPreference.addEventListener('change', onMotionPreferenceChange);
  finePointer.addEventListener('change', onPointerPreferenceChange);
  root.addEventListener('pointerdown', onPointerDown, true);
  root.addEventListener('pointerup', onPointerRelease, true);
  root.addEventListener('pointercancel', onPointerRelease, true);
  root.addEventListener('pointerover', onPointerOver, true);
  root.addEventListener('pointerout', onPointerOut, true);

  return () => {
    normalizeActiveElements();
    motionPreference.removeEventListener('change', onMotionPreferenceChange);
    finePointer.removeEventListener('change', onPointerPreferenceChange);
    root.removeEventListener('pointerdown', onPointerDown, true);
    root.removeEventListener('pointerup', onPointerRelease, true);
    root.removeEventListener('pointercancel', onPointerRelease, true);
    root.removeEventListener('pointerover', onPointerOver, true);
    root.removeEventListener('pointerout', onPointerOut, true);
  };
}
