import { Catch, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';

import { InternalContextError } from '../read/internal-context-store.ts';

type ReplyLike = {
  status: (code: number) => ReplyLike;
  header: (name: string, value: string) => ReplyLike;
  send: (payload: unknown) => unknown;
};

// A scope assertion inside a controller (`requireRequestUserScope()` on a data
// route reached with an anonymous context, or `requireRequestScope()` kind
// mismatch on a pre-auth route) throws InternalContextError, which is NOT an
// HttpException. Without this filter Nest maps it to a blanket 500, turning a
// deliberate fail-closed authorization refusal into an opaque server error —
// and hiding the very containment property the anonymous/user split exists for.
@Catch(InternalContextError)
export class InternalContextExceptionFilter implements ExceptionFilter {
  catch(_exception: InternalContextError, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<ReplyLike>();
    reply.status(HttpStatus.UNAUTHORIZED);
    reply.header('cache-control', 'no-store');
    reply.send({ error: { code: 'UNAUTHORIZED', message: 'Internal scope refused' } });
  }
}
