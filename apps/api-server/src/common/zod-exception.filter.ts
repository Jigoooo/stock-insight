import { Catch, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { ZodError } from 'zod';

type ReplyLike = {
  status: (code: number) => ReplyLike;
  header: (name: string, value: string) => ReplyLike;
  send: (payload: unknown) => unknown;
};

// Controllers validate query/body with `schema.parse()`, which throws a raw
// ZodError. ZodError is not an HttpException, so without this filter Nest maps
// malformed client input to a 500 "Internal server error" — turning a caller
// mistake into what looks like a server outage, and hiding the real cause.
//
// Callers get the same envelope shape every other validation failure uses:
// { error: { code: 'VALIDATION_FAILED' } }. Issue details are deliberately NOT
// echoed back, so schema internals stay off the wire.
@Catch(ZodError)
export class ZodExceptionFilter implements ExceptionFilter {
  catch(_exception: ZodError, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<ReplyLike>();
    reply.status(HttpStatus.BAD_REQUEST);
    reply.header('cache-control', 'no-store');
    reply.send({ error: { code: 'VALIDATION_FAILED' } });
  }
}
