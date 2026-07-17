import { HttpException } from '@nestjs/common';

// Mirrors apps/web jsonResponse error bodies exactly: { error: { code } }
export function apiError(code: string, status: number): HttpException {
  return new HttpException({ error: { code } }, status);
}

// Fastify may hand back string | string[] for repeated query params.
// Nitro used URLSearchParams.get() which returns the FIRST value — mirror that.
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
