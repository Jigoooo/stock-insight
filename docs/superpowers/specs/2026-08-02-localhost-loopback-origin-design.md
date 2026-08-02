# Localhost loopback authentication origin design

## Goal

Allow macOS live development authentication mutations to work when the developer opens either `http://localhost:6100` or `http://127.0.0.1:6100`.

## Scope

Only the shared CSRF origin comparison changes. Edge Gateway, Cloudflare, Tailscale, tunnel monitoring, production host configuration, and session storage are unchanged.

## Behavior

A mutation origin is accepted when either:

- it exactly matches the configured application origin; or
- both origins use HTTP loopback hostnames, use the same protocol, and resolve to the same effective port.

The supported loopback hostname aliases are `localhost`, `127.0.0.1`, and `[::1]`. This keeps the existing local-origin policy aligned with runtime configuration validation.

## Security boundary

Production origins remain exact-match only. A loopback origin cannot match a non-loopback origin. Different protocols, ports, malformed origins, paths, credentials, and lookalike hostnames remain rejected.

Browser cookies remain host-scoped. A login session created on `localhost` is not shared with `127.0.0.1`; users should continue on the hostname where they logged in.

## Verification

Add focused unit coverage for both alias directions and rejection cases, then run the web test suite, formatting, lint, typecheck, build, and repository diff checks.
