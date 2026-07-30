import { StrictMode, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';

import './style.css';

import {
  Button,
  Combobox,
  IconButton,
  SelectBox,
  Switch,
  Toggle,
  type SelectOption,
} from '@/shared/ui/primitives';

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
      <form onSubmit={submit}>
        <section aria-label="Unavailable shared controls">
          <Button disabled>Disabled button</Button>
          <Button pending>Pending button</Button>
          <Button aria-disabled="true">ARIA disabled button</Button>
          <Button inert>Inert button</Button>
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
          <Toggle disabled onPressedChange={() => undefined} pressed={false}>
            Disabled toggle
          </Toggle>
          <Toggle onPressedChange={() => undefined} pending pressed={false}>
            Pending toggle
          </Toggle>
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
