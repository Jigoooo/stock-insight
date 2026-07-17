import { HeadContent, Scripts } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { activeDesignProfile } from '@/shared/theme/design-profile-contract';

export function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko" data-design-profile={activeDesignProfile.id}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
