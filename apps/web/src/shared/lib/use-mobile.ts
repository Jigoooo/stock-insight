/* oxlint-disable react-hooks-js/set-state-in-effect -- Official shadcn hook initializes the media-query snapshot after mount. */

// Upstream: https://github.com/shadcn-ui/ui/blob/cb2bcd88d93b2f9bddb030e9136f1f8773e7eac4/apps/v4/registry/new-york-v4/hooks/use-mobile.ts
// Registry item: use-mobile
// Revision: cb2bcd88d93b2f9bddb030e9136f1f8773e7eac4

import * as React from 'react';

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener('change', onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return !!isMobile;
}
