import { HeadContent, Scripts } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { activeDesignProfile } from '@/shared/theme/design-profile-contract';

const initialCanvasCss = `html,body{background:${activeDesignProfile.themeColors.light}}@media(prefers-color-scheme:dark){html,body{background:${activeDesignProfile.themeColors.dark}}}`;

export function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko" data-design-profile={activeDesignProfile.id}>
      <head>
        <HeadContent />
        <style data-initial-canvas>{initialCanvasCss}</style>
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
