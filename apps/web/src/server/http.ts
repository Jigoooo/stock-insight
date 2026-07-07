const jsonHeaders = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
};

export function jsonResponse(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      ...jsonHeaders,
      ...init.headers,
    },
  });
}
