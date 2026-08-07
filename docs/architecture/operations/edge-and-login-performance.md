# Edge and login performance

Measured 2026-08-02 against production (`https://stock.jigooo.com`). This exists so the
next person does not re-derive it, and so the constraints in `CLAUDE.md` / `AGENTS.md`
have a source.

## The constraint that shapes everything

```
browser (KR) → Cloudflare edge (LAX) → CF backbone → cloudflared tunnel (ICN) → nginx edge → app
```

`/cdn-cgi/trace` reports `colo=LAX` for `stock.jigooo.com` while `www.cloudflare.com`
from the same client IP reports `colo=ICN`. The tunnel itself registers at `icn01/05/06`,
so a request crosses the Pacific twice.

| Leg | Cost |
| --- | --- |
| KR ↔ LAX edge | ~139 ms |
| LAX ↔ tunnel (ICN) ↔ origin | ~170–460 ms |
| Origin SSR (anonymous) | 2–4 ms |
| First connection (TCP + TLS) | ~298 ms, once |

**One extra origin round trip costs roughly 600 ms.** That is larger than almost any
server-side work in this codebase, so the cheapest wins are always "remove a round trip"
rather than "make the server faster" — with one exception, below.

## Cloudflare routing checklist

Cannot be fixed in code. Before spending money on it, confirm the cause:

1. `curl -s https://stock.jigooo.com/cdn-cgi/trace | grep colo` → currently `LAX`.
   Control: `curl -s https://www.cloudflare.com/cdn-cgi/trace | grep colo` → `ICN`.
   Two different answers from one client means this is a zone problem, not the ISP.
2. Cloudflare dashboard → the zone's **plan tier**. Free/Pro/Business not being
   advertised at ICN for Korean traffic is documented, expected behaviour.
3. Zero Trust → Networks → Tunnels → ingress rules. **Not in this repo and not on this
   host** — the cloudflared container (a separate repo) runs from `TUNNEL_TOKEN`, so the
   hostname→service mapping exists only in the dashboard.
4. Caching → Cache Rules must not override the `CDN-Cache-Control` the edge emits for
   `/assets/`. If asset caching stops working, look here first.
5. **Argo Smart Routing does not fix this.** Argo optimises PoP↔origin, not which edge
   PoP the client connects to, so the ~139 ms KR↔LAX leg would remain. An ICN edge for
   Korean traffic is effectively Enterprise-gated.

## What was changed, and what it bought

### Workspace loader query — the one exception

`/v1/workspace` (the tab a user lands on after login) took **6.8–7.7 s**, an order of
magnitude more than the network. `FEED_SQL` joined the per-user aggregate view
`public.v_user_feed_dedup` and filtered `user_id` **on the join condition**, so the
planner placed the whole view inside a nested loop and re-aggregated every user's feed
once per publication row — `loops=124` × 34k rows, 4.7M shared buffer hits.

Moving the filter inside the aggregate (a `MATERIALIZED` CTE) made it **6,975 ms → 119 ms**
with identical output, verified by a full-column row diff (123 rows) and an
endpoint-level JSON diff.

`MATERIALIZED` is load-bearing: without it the planner may inline the CTE and rebuild the
same nested loop. The same view is read by five other read models — `stocks`, `dashboard`,
`market-news`, `portfolio`, `workspace/record-detail` — which have not been audited.

### Static asset caching

The origin already emits `public, max-age=31536000, immutable` for content-hashed
`/assets/`. `location /` in the edge config applied `proxy_hide_header Cache-Control` to
every path and threw it away, so 24 assets / 531 KB were re-fetched through the tunnel on
every visit. A `location ^~ /assets/` block now lets the origin header through.

Three nginx facts that block naive edits:
- `add_header` does not merge across levels — declaring one drops the server-level
  security snippet, so it must be re-included.
- Adding a `Cache-Control` on top of the origin's emits two conflicting header lines.
- `limit_req` is not inherited from a sibling location; omitting it silently exempts
  assets from rate limiting.

Result: 392 KB bundle TTFB **0.90 s → 0.43 s**, `cf-cache-status` `BYPASS` → `HIT`.
Documents, server functions and the brain stay `no-store`.

### Entry path

Anonymous `/` used to redirect to `/workspace`, which then bounced to `/login` — three
origin round trips before the form rendered. `routes/index.tsx` now resolves the session
and goes straight to the final URL, and `routes/login.tsx` no longer emits a `redirect`
search key that a bare `/login` would have to normalise away.

Anonymous visitors pay nothing for the added session check: `readBoundSession` returns
early without touching the brain when there is no cookie.

Result: 2 redirects → 1, 1.21–1.48 s → 0.90–1.19 s.

### Post-login handoff

`window.location.assign` threw away a parsed, hydrated bundle and re-fetched the
document. Login and signup now use a client transition (`router.invalidate()` then
`navigate()`), verified with a `window` marker that survives a client transition but not
a document reload: marker alive, **0 document requests** after the click, `/workspace/today`
reached in 829 ms on production.

`pending` is deliberately held through the transition — `navigate()` settles only after
the workspace loader does. Logout stays a full reload on purpose: discarding all
in-memory user data is the point.

## Result

| | Before | After |
| --- | --- | --- |
| `/v1/workspace` | 8,786 ms | ~200 ms |
| `/v1/feed` | 8,711 ms | ~140 ms |
| Login click → workspace | full document reload | 829 ms, no reload |
| Anonymous `/` → login form | 3 round trips, 1.48 s | 2 round trips, 0.90 s |
| 392 KB bundle TTFB | 0.90 s | 0.43 s (edge HIT) |

## Known, not fixed

- **Security headers are emitted twice** (once by Nitro, once by the nginx snippet) on
  both documents and assets. CSP intersects harmlessly, but HSTS `max-age` disagrees:
  31536000 vs 15552000. Predates this work.
- `pnpm verify:release` never exercises the real nginx edge or the tunnel, and
  `ops/scripts/verify-edge-brain-routing.sh` checks status codes and bodies but not
  headers. **Edge changes are only verifiable against the deployed URL.**
- The five other read models using `v_user_feed_dedup` have not been checked for the
  same planner trap.
