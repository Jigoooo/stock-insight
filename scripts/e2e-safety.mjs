const PRODUCTION_MUTATION_ACK = 'I_ACKNOWLEDGE_PRODUCTION_WRITES';
const EXISTING_SERVER_ACK = 'I_ACKNOWLEDGE_EXISTING_SERVER';

// Disposable QA databases are created by the release runners with a random
// suffix. Everything else that can reach the live cluster is refused: the
// tunnel answers on ANY local port, over IPv6, through a unix socket, and
// hostnames/schemes are case-insensitive, so this is an allowlist, not a
// blocklist.
const DISPOSABLE_DATABASE_PATTERN = /^stock_insight_(?:p6_production|test|e2e|qa)_[a-z0-9]+$/;
const PRODUCTION_ROLES = new Set([
  'stock_insight_app_reader',
  'stock_insight_app_writer',
  'research_app',
]);

function decodeComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isProductionDatabaseUrl(value) {
  if (!value) return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    // Unparseable DSNs (libpq key/value strings) cannot be proven safe.
    return true;
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol.toLowerCase())) return true;

  // pg-connection-string treats query parameters as connection fields and
  // gives several of them precedence over URL credentials (host/user/port,
  // plus options and TLS file paths). The safety gate must not validate one
  // target while the driver connects with another interpretation. Disposable
  // local QA DSNs need no query parameters, so reject them all fail-closed.
  if (url.searchParams.size > 0) return true;

  const database = decodeComponent(url.pathname.replace(/^\//, '')).toLowerCase();
  const username = decodeComponent(url.username).toLowerCase();
  const hostname = decodeComponent(url.hostname).toLowerCase().replace(/\.$/, '');
  // Never let the driver fill identity/address from USER, HOME/.pgpass or its
  // default socket/port. A disposable target must be fully explicit.
  if (!username || !hostname || !url.port) return true;
  // A unix-socket DSN carries its target in ?host= and has no URL hostname.
  const socketHost = url.searchParams.get('host');

  // Any DSN naming the production database or a production role is refused,
  // whatever host/port/scheme spelling is used to reach it.
  if (database === 'research_app') return true;
  if (PRODUCTION_ROLES.has(username)) return true;
  if (socketHost) return true;
  if (hostname.endsWith('jigooo.com')) return true;
  // Only explicitly disposable database names are treated as safe.
  return !DISPOSABLE_DATABASE_PATTERN.test(database);
}

export function resolvePlaywrightBaseUrl(env, serverPort) {
  const managedBaseUrl = `http://127.0.0.1:${serverPort}`;
  if (env.PLAYWRIGHT_SKIP_WEB_SERVER !== '1') return managedBaseUrl;
  return env.PLAYWRIGHT_BASE_URL ?? managedBaseUrl;
}

export function assertSafeE2eConfiguration(env) {
  const allowProductionWrites =
    env.STOCK_INSIGHT_E2E_PRODUCTION_MUTATION_ACK === PRODUCTION_MUTATION_ACK;
  const allowExistingServer = env.STOCK_INSIGHT_E2E_EXISTING_SERVER_ACK === EXISTING_SERVER_ACK;
  const productionDatabaseKeys = ['DATABASE_URL', 'DATABASE_READ_URL', 'DATABASE_WRITE_URL'].filter(
    (key) => isProductionDatabaseUrl(env[key]),
  );
  const liveIndicators = [
    env.STOCK_INSIGHT_LIVE_DATABASE_EXPECTED === 'true' && 'STOCK_INSIGHT_LIVE_DATABASE_EXPECTED',
    env.STOCK_INSIGHT_MUTATIONS_ENABLED === 'true' && 'STOCK_INSIGHT_MUTATIONS_ENABLED',
    env.VITE_STOCK_INSIGHT_DATA_ENV === 'production-live' && 'VITE_STOCK_INSIGHT_DATA_ENV',
  ].filter(Boolean);

  if ((productionDatabaseKeys.length > 0 || liveIndicators.length > 0) && !allowProductionWrites) {
    throw new Error(
      `E2E refused production-like mutation context: ${[
        ...productionDatabaseKeys,
        ...liveIndicators,
      ].join(', ')}`,
    );
  }
  if (env.PLAYWRIGHT_SKIP_WEB_SERVER === '1' && !allowExistingServer) {
    throw new Error('E2E refused an existing server without explicit acknowledgement');
  }

  return { allowExistingServer, allowProductionWrites };
}
