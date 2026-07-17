import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { activeDesignProfile } from '../src/shared/theme/design-profile-contract.ts';

const constitutionUrl = new URL('../../../docs/design/ux-constitution.md', import.meta.url);
const activeProfileUrl = new URL(
  `../../../docs/design/profiles/${activeDesignProfile.id}.md`,
  import.meta.url,
);
const indexUrl = new URL('../../../docs/futur_insight_design_system.md', import.meta.url);

describe('design governance boundary', () => {
  it('separates safety invariants from the active visual profile', async () => {
    const [constitution, profile, index] = await Promise.all([
      readFile(constitutionUrl, 'utf8'),
      readFile(activeProfileUrl, 'utf8'),
      readFile(indexUrl, 'utf8'),
    ]);

    for (const invariant of [
      'WCAG AA',
      'focus-visible',
      '24×24',
      '390px',
      'reduced motion',
      'loading / error / empty / ready / stale',
      'raw UUID',
      'semantic token interface',
    ]) {
      assert.match(constitution, new RegExp(invariant.replaceAll('/', '\\/')));
    }

    for (const tasteLock of [
      'split-screen 유지',
      'gradient 금지',
      'GSAP 필수',
      'scale(0.97)',
      'sticky relation inspector',
    ]) {
      assert.doesNotMatch(constitution, new RegExp(tasteLock.replace(/[().]/g, '\\$&')));
    }

    assert.match(profile, /이 문서는 현재 미감의 snapshot이며 배포 헌법이 아니다/);
    assert.match(profile, /다른 profile/);

    assert.match(index, /docs\/design\/ux-constitution\.md/);
    assert.match(index, new RegExp(`docs/design/profiles/${activeDesignProfile.id}\\.md`));
    assert.match(index, /특정 미감은 배포 헌법이 아니다/);
    assert.doesNotMatch(index, /제품 전체 재설계의 단일 원장/);
  });
});
