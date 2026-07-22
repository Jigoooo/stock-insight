import { createElement } from 'react';

import { getDecisionSupportPresentation } from './decision-support-presentation.ts';

import type { DecisionSupportSummary } from '@stock-insight/contracts/research-workspace';

export function DecisionSupportContent({
  data,
  className,
}: {
  data: DecisionSupportSummary;
  className?: string;
}) {
  const presentation = getDecisionSupportPresentation(data);
  return createElement(
    'div',
    {
      className,
      'data-restricted': presentation.state === 'restricted' || undefined,
    },
    createElement('span', null, presentation.eyebrow),
    createElement('strong', null, presentation.title),
    createElement('p', null, presentation.description),
  );
}
