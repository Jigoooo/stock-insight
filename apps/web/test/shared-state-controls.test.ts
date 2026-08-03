import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = async (path: string) =>
  readFile(new URL(`../src/${path}`, import.meta.url), 'utf8').catch(() => '');

describe('shared state controls', () => {
  it('uses semantic state primitives with approved visual variants', async () => {
    const [switchSource, checkboxSource] = await Promise.all([
      read('shared/ui/switch/switch.tsx'),
      read('shared/ui/checkbox/checkbox.tsx'),
    ]);

    assert.match(switchSource, /type SwitchVariant = 'quiet' \| 'inset'/);
    assert.match(switchSource, /SwitchPrimitive\.Root/);
    assert.match(switchSource, /data-variant=\{variant\}/);
    assert.match(checkboxSource, /type CheckboxVariant = 'plain' \| 'inset' \| 'ledger'/);
    assert.match(checkboxSource, /CheckboxPrimitive\.Root/);
    assert.match(checkboxSource, /data-variant=\{variant\}/);
  });

  it('keeps ToggleGroup attached and gives one Motion owner to the sliding indicator', async () => {
    const source = await read('shared/ui/toggle-group/toggle-group.tsx');

    assert.match(source, /ToggleGroupPrimitive\.Root/);
    assert.match(source, /layoutId="toggle-group-indicator"/);
    assert.doesNotMatch(source, /whileTap|scale/);
  });

  it('exposes calm Textarea and route/display Tabs variants', async () => {
    const [textareaSource, tabsSource] = await Promise.all([
      read('shared/ui/textarea/textarea.tsx'),
      read('shared/ui/tabs/tabs.tsx'),
    ]);

    assert.match(textareaSource, /type TextareaVariant = 'plain' \| 'composer' \| 'editorial'/);
    assert.match(textareaSource, /variant\?: TextareaVariant/);
    assert.match(textareaSource, /footer\?: ReactNode/);
    assert.match(tabsSource, /type TabsVariant = 'soft-inset' \| 'sliding-underline'/);
    assert.match(tabsSource, /fullWidth\?: boolean/);
    assert.match(tabsSource, /data-variant=\{variant\}/);
  });
});
