import { createRef, type AnimationEventHandler, type DragEventHandler } from 'react';

import { Button, IconButton, Switch, TextInput, TextLink, Toggle } from '@/shared/ui/primitives';

const buttonDrag: DragEventHandler<HTMLButtonElement> = () => undefined;
const buttonAnimationStart: AnimationEventHandler<HTMLButtonElement> = () => undefined;
const anchorDrag: DragEventHandler<HTMLAnchorElement> = () => undefined;
const anchorAnimationStart: AnimationEventHandler<HTMLAnchorElement> = () => undefined;

export const nativeControlPropsFixture = (
  <>
    <TextInput
      ref={createRef<HTMLInputElement>()}
      autoComplete="username"
      id="fixture-input"
      name="username"
      type="text"
    />
    <Button draggable onAnimationStart={buttonAnimationStart} onDrag={buttonDrag}>
      Button
    </Button>
    <IconButton
      aria-label="Icon button"
      draggable
      onAnimationStart={buttonAnimationStart}
      onDrag={buttonDrag}
    >
      I
    </IconButton>
    <Switch
      checked={false}
      draggable
      label="Switch"
      onAnimationStart={buttonAnimationStart}
      onCheckedChange={() => undefined}
      onDrag={buttonDrag}
    />
    <Toggle
      draggable
      onAnimationStart={buttonAnimationStart}
      onDrag={buttonDrag}
      onPressedChange={() => undefined}
      pressed={false}
    >
      Toggle
    </Toggle>
    <TextLink
      draggable
      href="/native-link"
      onAnimationStart={anchorAnimationStart}
      onDrag={anchorDrag}
    >
      Link
    </TextLink>
  </>
);
