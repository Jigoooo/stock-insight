import type {
  AnimationEventHandler,
  DragEventHandler,
  HTMLAttributes,
  SyntheticEvent,
} from 'react';

type MotionConflictingNativeEventProps<ElementType extends HTMLElement> = {
  onAnimationStart?: AnimationEventHandler<ElementType>;
  onDrag?: DragEventHandler<ElementType>;
  onDragEnd?: DragEventHandler<ElementType>;
  onDragStart?: DragEventHandler<ElementType>;
};

type MotionSafeNativeProps<ElementType extends HTMLElement> = Omit<
  HTMLAttributes<ElementType>,
  keyof MotionConflictingNativeEventProps<ElementType>
>;

function composeCaptureHandler<EventType extends SyntheticEvent>(
  captureHandler: ((event: EventType) => void) | undefined,
  bubbleHandler: ((event: EventType) => void) | undefined,
) {
  if (!captureHandler && !bubbleHandler) return undefined;

  return (event: EventType) => {
    captureHandler?.(event);
    if (!event.isPropagationStopped()) bubbleHandler?.(event);
  };
}

export function bridgeNativeMotionEvents<ElementType extends HTMLElement>(
  props: HTMLAttributes<ElementType>,
) {
  const {
    onAnimationStart,
    onAnimationStartCapture,
    onDrag,
    onDragCapture,
    onDragEnd,
    onDragEndCapture,
    onDragStart,
    onDragStartCapture,
    ...motionSafeProps
  } = props;

  return {
    motionSafeProps: motionSafeProps as MotionSafeNativeProps<ElementType>,
    nativeCaptureProps: {
      onAnimationStartCapture: composeCaptureHandler(onAnimationStartCapture, onAnimationStart),
      onDragCapture: composeCaptureHandler(onDragCapture, onDrag),
      onDragEndCapture: composeCaptureHandler(onDragEndCapture, onDragEnd),
      onDragStartCapture: composeCaptureHandler(onDragStartCapture, onDragStart),
    },
  };
}
