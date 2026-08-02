import { createRef, type AnimationEventHandler, type DragEventHandler } from 'react';

import { Button, IconButton } from '@/shared/ui/button';
import { ButtonGroup } from '@/shared/ui/button-group';
import { Calendar } from '@/shared/ui/calendar';
import { DatePicker, RangePicker } from '@/shared/ui/date-picker';
import { Dropzone, FileUpload } from '@/shared/ui/file-upload';
import { Input } from '@/shared/ui/input';
import { TextLink } from '@/shared/ui/link';
import { OTP } from '@/shared/ui/otp';
import { RadioGroup } from '@/shared/ui/radio-group';
import { Slider } from '@/shared/ui/slider';
import { SplitButton } from '@/shared/ui/split-button';
import { Switch } from '@/shared/ui/switch';
import { ToggleGroup } from '@/shared/ui/toggle-group';

const buttonDrag: DragEventHandler<HTMLButtonElement> = () => undefined;
const buttonAnimationStart: AnimationEventHandler<HTMLButtonElement> = () => undefined;
const groupDrag: DragEventHandler<HTMLDivElement> = () => undefined;
const groupAnimationStart: AnimationEventHandler<HTMLDivElement> = () => undefined;
const anchorDrag: DragEventHandler<HTMLAnchorElement> = () => undefined;
const anchorAnimationStart: AnimationEventHandler<HTMLAnchorElement> = () => undefined;

export const nativeControlPropsFixture = (
  <>
    <Input
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
    <ButtonGroup aria-label="Fixture actions" orientation="vertical" variant="inset">
      <Button>First action</Button>
      <Button pending pendingLabel="Running">
        Second action
      </Button>
    </ButtonGroup>
    <SplitButton
      actions={[
        { label: 'Download', value: 'download' },
        { disabled: true, label: 'Archived action', value: 'archive' },
      ]}
      disableMenuWhilePending
      onActionSelect={() => undefined}
      onOpenChange={() => undefined}
      triggerLabel="Fixture alternatives"
      variant="twin"
    >
      Primary action
    </SplitButton>
    <Switch
      checked={false}
      draggable
      label="Switch"
      onAnimationStart={buttonAnimationStart}
      onCheckedChange={() => undefined}
      onDrag={buttonDrag}
    />
    <RadioGroup
      aria-label="Research scope"
      items={[
        { label: 'Holdings', value: 'holding' },
        { description: 'Watched names', label: 'Watchlist', value: 'watch' },
      ]}
      onValueChange={() => undefined}
      value="watch"
      variant="rail"
    />
    <Slider
      aria-label="Confidence threshold"
      endLabel="Strict"
      onValueChange={() => undefined}
      startLabel="Broad"
      thumbLabels={['Confidence threshold']}
      value={[64]}
      variant="inset"
    />
    <Calendar
      defaultMonth={new Date(2026, 7, 1)}
      defaultValue={new Date(2026, 7, 12)}
      onValueChange={() => undefined}
      variant="ledger"
    />
    <DatePicker
      defaultValue={new Date(2026, 7, 2)}
      label="기준일"
      onValueChange={() => undefined}
      variant="inset"
    />
    <RangePicker
      defaultValue={{ from: new Date(2026, 7, 2), to: new Date(2026, 7, 16) }}
      endLabel="종료일"
      onValueChange={() => undefined}
      startLabel="시작일"
      variant="rail"
    />
    <FileUpload
      accept=".csv,.xlsx,.pdf"
      defaultFiles={[{ id: 'report', name: 'report.csv', size: 284 * 1024 }]}
      mode="multiple"
      onFilesChange={() => undefined}
      onReject={() => undefined}
      variant="inset"
    />
    <Dropzone
      accept=".csv,.xlsx,.pdf"
      filled
      mode="single"
      onFilesSelected={() => undefined}
      variant="hairline"
    />
    <OTP
      defaultValue="47"
      label="Verification code"
      name="verificationCode"
      onComplete={() => undefined}
      onValueChange={() => undefined}
      variant="rail"
    />
    <ToggleGroup
      draggable
      items={[{ label: 'Toggle', value: 'toggle' }]}
      onAnimationStart={groupAnimationStart}
      onDrag={groupDrag}
      onValueChange={() => undefined}
      value=""
    />
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
