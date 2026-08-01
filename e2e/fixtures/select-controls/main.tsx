import {
  StrictMode,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import { createRoot } from 'react-dom/client';

import './style.css';

import { useWorkspaceAppendReveal } from '@/pages/research-workspace/ui/use-workspace-append-reveal';
import { useWorkspaceRelationCrossfade } from '@/pages/research-workspace/ui/use-workspace-relation-crossfade';
import { Button, IconButton } from '@/shared/ui/button';
import { Combobox } from '@/shared/ui/combobox';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { TextLink } from '@/shared/ui/link';
import { createMotionDomAdapter } from '@/shared/ui/motion/dom-motion-adapter';
import { SelectBox, type SelectOption } from '@/shared/ui/select';
import { Switch } from '@/shared/ui/switch';
import { ToggleGroup } from '@/shared/ui/toggle-group';

declare global {
  interface Window {
    __runMotionAdapterRuntimeCases: () => Promise<{
      animatedReducedNormal: {
        normal: MotionProbeSnapshot;
        reduced: MotionProbeSnapshot;
      };
      interrupted: {
        callbacks: string[];
        final: MotionProbeSnapshot;
      };
      repeatedFromTo: {
        firstFinal: MotionProbeSnapshot;
        secondFinal: MotionProbeSnapshot;
        secondStart: MotionProbeSnapshot;
      };
      staleCompletion: {
        callbacks: string[];
        final: MotionProbeSnapshot;
        whileNewerActive: MotionProbeSnapshot;
      };
    }>;
    __nativeEventLog: Record<string, Array<{ eventPhase: number; handler: string }>>;
    __runWorkspaceFirstPaintCases: () => Promise<{
      append: MotionProbeSnapshot;
      relation: MotionProbeSnapshot;
    }>;
  }
}

type MotionProbeSnapshot = {
  opacity: number;
  transform: string;
};

window.__nativeEventLog = {};

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function readMotionProbe(element: HTMLElement): MotionProbeSnapshot {
  const style = getComputedStyle(element);
  return { opacity: Number(style.opacity), transform: style.transform };
}

window.__runMotionAdapterRuntimeCases = async () => {
  const probe = document.createElement('div');
  probe.style.width = '10px';
  probe.style.height = '10px';
  document.body.append(probe);
  const adapter = createMotionDomAdapter();

  adapter.fromTo(
    probe,
    { opacity: 0, y: 6 },
    { clearProps: 'opacity,transform', duration: 0.04, opacity: 1, y: 0 },
  );
  await wait(100);
  const firstFinal = readMotionProbe(probe);
  adapter.fromTo(
    probe,
    { opacity: 0, y: 6 },
    { clearProps: 'opacity,transform', duration: 0.04, opacity: 1, y: 0 },
  );
  await nextFrame();
  const secondStart = readMotionProbe(probe);
  await wait(100);
  const secondFinal = readMotionProbe(probe);

  adapter.to(probe, { duration: 0.2, opacity: 0.2, y: 8 });
  await wait(20);
  adapter.killTweensOf(probe);
  adapter.set(probe, { opacity: 1, y: 0 });
  const reduced = readMotionProbe(probe);
  adapter.to(probe, { duration: 0.04, opacity: 0.65, y: 2 });
  await wait(100);
  const normal = readMotionProbe(probe);

  const interruptedCallbacks: string[] = [];
  adapter.to(probe, {
    duration: 0.2,
    onComplete: () => interruptedCallbacks.push('old'),
    opacity: 0.1,
    y: 10,
  });
  await wait(20);
  adapter.to(probe, {
    duration: 0.04,
    onComplete: () => interruptedCallbacks.push('new'),
    opacity: 0.75,
    y: 3,
  });
  await wait(100);
  const interruptedFinal = readMotionProbe(probe);

  const staleCallbacks: string[] = [];
  adapter.to(probe, {
    clearProps: 'opacity',
    duration: 0.04,
    onComplete: () => staleCallbacks.push('old'),
    opacity: 0,
  });
  await wait(10);
  adapter.to(probe, {
    duration: 0.1,
    onComplete: () => staleCallbacks.push('new'),
    opacity: 0.6,
  });
  await wait(60);
  const whileNewerActive = readMotionProbe(probe);
  await wait(100);
  const staleFinal = readMotionProbe(probe);

  adapter.killTweensOf(probe);
  adapter.set(probe, { clearProps: 'opacity,transform' });
  probe.remove();

  return {
    animatedReducedNormal: { normal, reduced },
    interrupted: { callbacks: interruptedCallbacks, final: interruptedFinal },
    repeatedFromTo: { firstFinal, secondFinal, secondStart },
    staleCompletion: {
      callbacks: staleCallbacks,
      final: staleFinal,
      whileNewerActive,
    },
  };
};

const shortOptions: readonly SelectOption[] = [
  { value: 'alpha', label: 'Alpha' },
  { value: 'beta', label: 'Beta', disabled: true },
  { value: 'gamma', label: 'Gamma', description: 'Third choice' },
  { value: 'delta', label: 'Delta' },
];

const longOptions: readonly SelectOption[] = Array.from({ length: 30 }, (_, index) => ({
  value: `item-${index + 1}`,
  label: `Item ${String(index + 1).padStart(2, '0')}`,
}));

function recordNativeEvent<ElementType extends HTMLElement>(probe: string, handler: string) {
  return (event: SyntheticEvent<ElementType>) => {
    window.__nativeEventLog[probe] ??= [];
    window.__nativeEventLog[probe]?.push({ eventPhase: event.eventPhase, handler });
  };
}

function recordNativeRootEvent<ElementType extends HTMLElement>(handler: string) {
  return (event: SyntheticEvent<ElementType>) => {
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-event-target]')
        : null;
    const probe = target?.dataset.eventTarget;
    if (!probe) return;
    window.__nativeEventLog[probe] ??= [];
    window.__nativeEventLog[probe]?.push({ eventPhase: event.eventPhase, handler });
  };
}

function EventTargets({ probe }: { probe: string }) {
  return (
    <>
      <span
        data-event-target={`${probe}-normal`}
        draggable
        onDrag={recordNativeEvent(`${probe}-normal`, 'child-bubble')}
        onDragCapture={recordNativeEvent(`${probe}-normal`, 'child-capture')}
      >
        normal
      </span>
      <span
        data-event-target={`${probe}-stopped`}
        draggable
        onDrag={(event) => {
          recordNativeEvent(`${probe}-stopped`, 'child-bubble')(event);
          event.stopPropagation();
        }}
        onDragCapture={recordNativeEvent(`${probe}-stopped`, 'child-capture')}
      >
        stopped
      </span>
      <span
        data-event-target={`${probe}-animation-normal`}
        onAnimationStart={recordNativeEvent(`${probe}-animation-normal`, 'child-bubble')}
        onAnimationStartCapture={recordNativeEvent(`${probe}-animation-normal`, 'child-capture')}
      >
        animation normal
      </span>
      <span
        data-event-target={`${probe}-animation-stopped`}
        onAnimationStart={(event) => {
          recordNativeEvent(`${probe}-animation-stopped`, 'child-bubble')(event);
          event.stopPropagation();
        }}
        onAnimationStartCapture={recordNativeEvent(`${probe}-animation-stopped`, 'child-capture')}
      >
        animation stopped
      </span>
    </>
  );
}

function NativeEventProbe({
  children,
  probe,
}: {
  children: (targets: ReactNode) => ReactNode;
  probe: string;
}) {
  return children(<EventTargets probe={probe} />);
}

function WorkspaceFirstPaintProbe() {
  const [appendKeys, setAppendKeys] = useState(['initial']);
  const [relationKey, setRelationKey] = useState('initial');
  const appendRef = useRef<HTMLElement>(null);
  const relationRef = useRef<HTMLElement>(null);
  useWorkspaceAppendReveal({ keys: appendKeys, scopeRef: appendRef });
  useWorkspaceRelationCrossfade({ scopeRef: relationRef, stateKey: relationKey });

  return (
    <section aria-label="Workspace first-paint motion">
      <button type="button" onClick={() => setAppendKeys(['initial', 'appended'])}>
        Append workspace row
      </button>
      <div ref={appendRef}>
        {appendKeys.map((key) => (
          <span data-append-key={key} key={key}>
            {key}
          </span>
        ))}
      </div>
      <button type="button" onClick={() => setRelationKey('next')}>
        Change relation state
      </button>
      <article data-relation-state={relationKey} ref={relationRef}>
        Relation state
      </article>
    </section>
  );
}

function Fixture() {
  const [controlledSelect, setControlledSelect] = useState('alpha');
  const [controlledCombo, setControlledCombo] = useState('');
  const [controlledQuery, setControlledQuery] = useState('');
  const [submission, setSubmission] = useState('');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmission(JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))));
  };

  return (
    <main>
      <h1>Select controls browser fixture</h1>
      <WorkspaceFirstPaintProbe />
      <form onSubmit={submit}>
        <section aria-label="Native event semantics">
          <NativeEventProbe probe="button">
            {(targets) => (
              <Button
                onAnimationStart={recordNativeRootEvent('root-bubble')}
                onAnimationStartCapture={recordNativeRootEvent('root-capture')}
                onDrag={recordNativeRootEvent('root-bubble')}
                onDragCapture={recordNativeRootEvent('root-capture')}
              >
                {targets}
              </Button>
            )}
          </NativeEventProbe>
          <NativeEventProbe probe="icon-button">
            {(targets) => (
              <IconButton
                aria-label="Icon event probe"
                onAnimationStart={recordNativeRootEvent('root-bubble')}
                onAnimationStartCapture={recordNativeRootEvent('root-capture')}
                onDrag={recordNativeRootEvent('root-bubble')}
                onDragCapture={recordNativeRootEvent('root-capture')}
              >
                {targets}
              </IconButton>
            )}
          </NativeEventProbe>
          <NativeEventProbe probe="switch">
            {(targets) => (
              <Switch
                checked={false}
                label={targets}
                onCheckedChange={() => undefined}
                onAnimationStart={recordNativeRootEvent('root-bubble')}
                onAnimationStartCapture={recordNativeRootEvent('root-capture')}
                onDrag={recordNativeRootEvent('root-bubble')}
                onDragCapture={recordNativeRootEvent('root-capture')}
              />
            )}
          </NativeEventProbe>
          <NativeEventProbe probe="toggle">
            {(targets) => (
              <ToggleGroup
                items={[{ label: targets, value: 'toggle' }]}
                onAnimationStart={recordNativeRootEvent('root-bubble')}
                onAnimationStartCapture={recordNativeRootEvent('root-capture')}
                onDrag={recordNativeRootEvent('root-bubble')}
                onDragCapture={recordNativeRootEvent('root-capture')}
                onValueChange={() => undefined}
                value=""
              />
            )}
          </NativeEventProbe>
          <NativeEventProbe probe="text-link">
            {(targets) => (
              <TextLink
                href="#event-probe"
                motion="pressable"
                onAnimationStart={recordNativeRootEvent('root-bubble')}
                onAnimationStartCapture={recordNativeRootEvent('root-capture')}
                onDrag={recordNativeRootEvent('root-bubble')}
                onDragCapture={recordNativeRootEvent('root-capture')}
              >
                {targets}
              </TextLink>
            )}
          </NativeEventProbe>
        </section>

        <section aria-label="Field anatomy">
          <Field>
            <FieldLabel htmlFor="wrapped-field-control">Wrapped field</FieldLabel>
            <div>
              <input
                aria-describedby="wrapped-field-control-description"
                id="wrapped-field-control"
                name="wrappedField"
              />
            </div>
            <FieldDescription id="wrapped-field-control-description">
              Wrapped description
            </FieldDescription>
          </Field>
          <Field data-invalid="true">
            <FieldLabel htmlFor="direct-field-control">Direct field</FieldLabel>
            <Input
              aria-describedby="direct-field-control-description"
              aria-errormessage="direct-field-control-error"
              aria-invalid="true"
              id="direct-field-control"
              name="directField"
            />
            <FieldDescription id="direct-field-control-description">
              Direct description
            </FieldDescription>
            <FieldError id="direct-field-control-error">Direct error</FieldError>
          </Field>
        </section>

        <section aria-label="Unavailable shared controls">
          <Button disabled>Disabled button</Button>
          <Button pending>Pending button</Button>
          <Button aria-disabled="true">ARIA disabled button</Button>
          <Button inert>Inert button</Button>
          <TextLink aria-disabled="true" href="#disabled-link" motion="pressable">
            ARIA disabled link
          </TextLink>
          <IconButton aria-label="Disabled icon button" disabled>
            D
          </IconButton>
          <IconButton aria-label="Pending icon button" pending>
            P
          </IconButton>
          <Switch
            checked={false}
            disabled
            label="Disabled switch"
            onCheckedChange={() => undefined}
          />
          <Switch
            checked={false}
            label="Pending switch"
            onCheckedChange={() => undefined}
            pending
          />
          <ToggleGroup
            disabled
            items={[{ label: 'Disabled toggle', value: 'toggle' }]}
            onValueChange={() => undefined}
            value=""
          />
        </section>

        <label id="uncontrolled-select-label" htmlFor="uncontrolled-select">
          Uncontrolled select
        </label>
        <SelectBox
          aria-labelledby="uncontrolled-select-label"
          defaultValue="alpha"
          id="uncontrolled-select"
          name="uncontrolledSelect"
          options={shortOptions}
        />

        <label id="controlled-select-label" htmlFor="controlled-select">
          Controlled select
        </label>
        <SelectBox
          aria-labelledby="controlled-select-label"
          defaultValue="alpha"
          id="controlled-select"
          name="controlledSelect"
          onValueChange={setControlledSelect}
          options={shortOptions}
          value={controlledSelect}
        />

        <label id="long-select-label" htmlFor="long-select">
          Long select
        </label>
        <SelectBox
          aria-labelledby="long-select-label"
          defaultValue="item-1"
          id="long-select"
          name="longSelect"
          options={longOptions}
        />

        <label id="disabled-select-label" htmlFor="disabled-select">
          Disabled select
        </label>
        <SelectBox
          aria-labelledby="disabled-select-label"
          defaultValue="alpha"
          disabled
          id="disabled-select"
          name="disabledSelect"
          options={shortOptions}
        />

        <label id="combo-label" htmlFor="combo">
          Search choices
        </label>
        <Combobox
          aria-labelledby="combo-label"
          emptyMessage="No matching choices"
          id="combo"
          name="combo"
          options={shortOptions}
        />

        <label id="controlled-combo-label" htmlFor="controlled-combo">
          Controlled search choices
        </label>
        <Combobox
          aria-labelledby="controlled-combo-label"
          filter={(option, query) =>
            option.description?.toLocaleLowerCase().includes(query.toLocaleLowerCase())
          }
          id="controlled-combo"
          name="controlledCombo"
          onQueryChange={setControlledQuery}
          onValueChange={setControlledCombo}
          options={shortOptions}
          query={controlledQuery}
          value={controlledCombo}
        />

        <label id="disabled-combo-label" htmlFor="disabled-combo">
          Disabled search choices
        </label>
        <Combobox
          aria-labelledby="disabled-combo-label"
          defaultValue="alpha"
          disabled
          id="disabled-combo"
          name="disabledCombo"
          options={shortOptions}
        />

        <div className="actions">
          <button type="submit">Submit form</button>
          <button type="reset">Reset form</button>
          <button type="button">Outside target</button>
        </div>
        <output aria-label="Submitted data">{submission}</output>
      </form>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
);

function captureMutationBeforePaint({
  selector,
  triggerLabel,
}: {
  selector: string;
  triggerLabel: string;
}) {
  return new Promise<MotionProbeSnapshot>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timed out waiting for ${selector}`));
    }, 1_000);
    const observer = new MutationObserver(() => {
      const target = document.querySelector<HTMLElement>(selector);
      if (!target) return;
      window.clearTimeout(timeout);
      observer.disconnect();
      resolve(readMotionProbe(target));
    });
    observer.observe(document.body, {
      attributeFilter: ['data-relation-state'],
      attributes: true,
      childList: true,
      subtree: true,
    });
    const trigger = [...document.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === triggerLabel,
    );
    if (!(trigger instanceof HTMLButtonElement)) {
      window.clearTimeout(timeout);
      observer.disconnect();
      reject(new Error(`Missing trigger ${triggerLabel}`));
      return;
    }
    trigger.click();
  });
}

window.__runWorkspaceFirstPaintCases = async () => ({
  append: await captureMutationBeforePaint({
    selector: '[data-append-key="appended"]',
    triggerLabel: 'Append workspace row',
  }),
  relation: await captureMutationBeforePaint({
    selector: '[data-relation-state="next"]',
    triggerLabel: 'Change relation state',
  }),
});
