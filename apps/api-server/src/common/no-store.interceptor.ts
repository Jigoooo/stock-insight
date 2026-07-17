import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';

type ReplyLike = { header: (name: string, value: string) => void };

// Parity with apps/web jsonResponse(): every API response carries cache-control: no-store.
@Injectable()
export class NoStoreInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const reply = context.switchToHttp().getResponse<ReplyLike>();
    reply.header('cache-control', 'no-store');
    return next.handle();
  }
}
