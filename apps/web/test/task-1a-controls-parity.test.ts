import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

describe('Task 1A.2 button availability contract', () => {
  it('uses one real guard for disabled pending aria-disabled and inert ancestry', async () => {
    const availability = await import('../src/shared/ui/button/button-availability.ts').catch(
      () => null,
    );
    assert.ok(availability, 'the canonical button availability guard must exist');

    const createTarget = ({
      ariaDisabled = false,
      disabled = false,
      inert = false,
      pending = false,
    } = {}) => ({
      disabled,
      closest: (selector: string) => (selector === '[inert]' && inert ? { inert: true } : null),
      getAttribute: (name: string) => {
        if (name === 'aria-disabled' && ariaDisabled) return 'true';
        if (name === 'data-pending' && pending) return 'true';
        return null;
      },
    });

    for (const flags of [
      { disabled: true },
      { pending: true },
      { ariaDisabled: true },
      { inert: true },
    ]) {
      assert.equal(availability.isButtonInteractionUnavailable(createTarget(flags)), true);
    }
    assert.equal(availability.isButtonInteractionUnavailable(createTarget()), false);
  });

  it('blocks unavailable clicks before the consumer handler and leaves available clicks intact', async () => {
    const availability = await import('../src/shared/ui/button/button-availability.ts').catch(
      () => null,
    );
    assert.ok(availability, 'the canonical button availability guard must exist');

    const calls: string[] = [];
    const unavailableEvent = {
      currentTarget: {
        disabled: false,
        closest: () => null,
        getAttribute: (name: string) => (name === 'aria-disabled' ? 'true' : null),
      },
      preventDefault: () => calls.push('preventDefault'),
      stopPropagation: () => calls.push('stopPropagation'),
    };
    assert.equal(availability.guardButtonInteraction(unavailableEvent), true);
    assert.deepEqual(calls, ['preventDefault', 'stopPropagation']);

    const availableEvent = {
      currentTarget: {
        disabled: false,
        closest: () => null,
        getAttribute: () => null,
      },
      preventDefault: () => calls.push('unexpected preventDefault'),
      stopPropagation: () => calls.push('unexpected stopPropagation'),
    };
    assert.equal(availability.guardButtonInteraction(availableEvent), false);
    assert.deepEqual(calls, ['preventDefault', 'stopPropagation']);
  });

  it('wires the guard and unavailable visual state into the canonical Button', async () => {
    const [button, css] = await Promise.all([
      read('shared/ui/button/button.tsx'),
      read('shared/ui/button/button.module.css'),
    ]);

    assert.match(button, /guardButtonInteraction/);
    assert.match(button, /onClick=\{handleClick\}/);
    assert.match(button, /unavailable \? undefined :/);
    assert.match(button, /disabled=\{nativeDisabled\}/);
    assert.doesNotMatch(button, /disabled=\{unavailable\}/);
    assert.match(css, /\.button\[aria-disabled='true'\]/);
    assert.match(css, /:global\(\[inert\]\) \.button/);
    assert.match(css, /cursor:\s*default/);
  });
});

describe('Task 1A.2 select and combobox close contract', () => {
  it('commits the first enabled partial match through the relation focus callback on Enter', async () => {
    const controller = await import('../src/shared/ui/select/select-controller.ts');
    assert.equal(
      typeof controller.commitComboboxSelection,
      'function',
      'Combobox must expose its real selection commit behavior for unit coverage',
    );

    const partialMatches = controller.filterSelectOptions(
      [
        { value: 'two', label: 'Two', disabled: true },
        { value: 'three', label: 'Three', description: 'Third option' },
      ],
      't',
    );
    const events: string[] = [];
    let focusedEntity = '';
    const committedIndex = controller.commitComboboxSelection({
      activeIndex: -1,
      currentValue: '',
      onQueryChange: (query: string) => events.push(`query:${query}`),
      onValueChange: (value: string) => {
        events.push(`value:${value}`);
        focusedEntity = value;
      },
      options: partialMatches,
    });

    assert.equal(committedIndex, 1);
    assert.deepEqual(events, ['value:three', 'query:Three']);
    assert.equal(focusedEntity, 'three');
  });

  it('commits values synchronously and begins one bounded exit immediately', async () => {
    const [select, combobox, motionIndex] = await Promise.all([
      read('shared/ui/select/select.tsx'),
      read('shared/ui/combobox/combobox.tsx'),
      read('shared/ui/motion/index.ts'),
    ]);

    const durationMatch = select.match(/optionCloseDurationMs\s*=\s*(\d+)/);
    assert.ok(durationMatch);
    const duration = Number(durationMatch[1]);
    assert.ok(duration >= 145 && duration <= 190);

    for (const source of [select, combobox]) {
      assert.doesNotMatch(source, /closeTimerRef|setTimeout\([^)]*setOpen\(false\)/s);
      assert.match(source, /const \{ reducedMotion \} = useMotionPreferences\(\)/);
      assert.match(
        source,
        /transition=\{\{\s*duration:\s*reducedMotion\s*\?\s*0\s*:\s*optionCloseDurationMs\s*\/\s*1_000/,
      );
      assert.match(
        source,
        /import \{[^}]*useMotionPreferences[^}]*\} from '@\/shared\/ui\/motion'/s,
      );
      assert.doesNotMatch(source, /@\/shared\/ui\/motion\/use-motion-preferences/);
    }
    assert.match(select, /setSelectedValue\(nextValue\);[\s\S]*?setOpen\(false\)/);
    assert.match(
      combobox,
      /commitComboboxSelection\(\{[\s\S]*?onValueChange:\s*setSelectedValue[\s\S]*?\}\);[\s\S]*?setOpen\(false\)/,
    );
    assert.match(motionIndex, /export \{\s*useMotionPreferences/);
  });
});

describe('Task 1A.2 canonical search adoption', () => {
  it('uses the canonical Combobox for relation graph filtering selection and focus', async () => {
    const relation = await read('pages/research-workspace/ui/relation-sigma-graph.tsx');

    assert.match(relation, /import \{ Combobox \} from '@\/shared\/ui\/combobox'/);
    assert.match(relation, /<Combobox/);
    assert.match(relation, /onQueryChange=/);
    assert.match(relation, /onValueChange=/);
    assert.match(
      relation,
      /onValueChange=\{\(entityKey\) => \{[\s\S]*?if \(entityKey\) selectAndFocusNode\(entityKey\)/,
    );
    assert.match(
      relation,
      /<div className=\{styles\.graphSearch\} data-testid="relation-graph-search">[\s\S]*?<Combobox/,
    );
    assert.doesNotMatch(relation, /<datalist|\blist=\{suggestionId\}|<Input/);
  });

  it('leaves workspace and relation page CSS responsible for layout only', async () => {
    const [workspaceCss, relationCss] = await Promise.all([
      read('pages/research-workspace/ui/research-workspace-page.module.css'),
      read('pages/research-workspace/ui/relation-detail.module.css'),
    ]);
    const workspaceSearch = workspaceCss.match(/\.search\s*\{([^}]*)\}/)?.[1] ?? '';
    const relationSearch = relationCss.match(/\.graphSearch\s*\{([^}]*)\}/)?.[1] ?? '';

    assert.doesNotMatch(workspaceSearch, /(?:min-)?height|padding|border|background|box-shadow/);
    assert.doesNotMatch(workspaceCss, /\.search(?::focus-within|\s+(?:input|svg))/);
    assert.doesNotMatch(relationSearch, /(?:min-)?height|padding|border|background|box-shadow/);
    assert.doesNotMatch(relationCss, /\.graphSearch(?::focus-within|\s+(?:input|svg))/);
  });
});
