import type { HistoryPreviewScenario } from './history-preview-fixture';
import type { MarketConnectionsPreviewScenario } from './market-connections-preview-fixture';
import type { StatusPreviewScenario } from './status-preview-fixture';

export type StocksPreviewScenario = 'default' | 'no-holdings' | 'empty' | 'detail-error';
export type DevPreviewPageProps =
  | {
      scenario?: StatusPreviewScenario;
      surface: 'status';
    }
  | {
      scenario?: HistoryPreviewScenario;
      surface: 'history';
    }
  | {
      scenario?: MarketConnectionsPreviewScenario;
      surface: 'market-connections';
    }
  | {
      scenario?: StocksPreviewScenario;
      surface?: 'workspace' | 'stocks';
    }
  | {
      scenario?: never;
      surface: 'today' | 'admin-invitations';
    };

const stockScenarios = new Set<StocksPreviewScenario>([
  'default',
  'no-holdings',
  'empty',
  'detail-error',
]);
const marketConnectionsScenarios = new Set<MarketConnectionsPreviewScenario>([
  'default',
  'no-personalized',
  'empty',
  'partial',
  'detail-error',
]);
const historyScenarios = new Set<HistoryPreviewScenario>([
  'default',
  'no-user-judgments',
  'no-due',
  'empty',
  'partial',
  'detail-error',
]);
const statusScenarios = new Set<StatusPreviewScenario>([
  'default',
  'all-ready',
  'stale',
  'source-limited',
  'empty',
  'error',
]);
const knownScenarios = new Set([
  ...stockScenarios,
  ...marketConnectionsScenarios,
  ...historyScenarios,
  ...statusScenarios,
]);

function invalidScenario(surface: string, scenario: unknown): never {
  throw new Error(`Scenario ${String(scenario)} is not valid for ${surface}`);
}

function resolveStocksScenario(
  scenario: unknown,
  surface: 'stocks' | 'workspace',
): StocksPreviewScenario | undefined {
  if (stockScenarios.has(scenario as StocksPreviewScenario))
    return scenario as StocksPreviewScenario;
  if (knownScenarios.has(scenario as MarketConnectionsPreviewScenario)) {
    invalidScenario(surface, scenario);
  }
  return undefined;
}

function resolveMarketConnectionsScenario(
  scenario: unknown,
): MarketConnectionsPreviewScenario | undefined {
  if (marketConnectionsScenarios.has(scenario as MarketConnectionsPreviewScenario)) {
    return scenario as MarketConnectionsPreviewScenario;
  }
  if (knownScenarios.has(scenario as StocksPreviewScenario)) {
    invalidScenario('market-connections', scenario);
  }
  return undefined;
}

function resolveHistoryScenario(scenario: unknown): HistoryPreviewScenario | undefined {
  if (historyScenarios.has(scenario as HistoryPreviewScenario)) {
    return scenario as HistoryPreviewScenario;
  }
  if (scenario === undefined) return undefined;
  return invalidScenario('history', scenario);
}

function resolveStatusScenario(scenario: unknown): StatusPreviewScenario | undefined {
  if (statusScenarios.has(scenario as StatusPreviewScenario)) {
    return scenario as StatusPreviewScenario;
  }
  if (scenario === undefined) return undefined;
  return invalidScenario('status', scenario);
}

export function resolveDevPreviewRequest(search: Record<string, unknown>): DevPreviewPageProps {
  if (search.surface === 'status') {
    return {
      scenario: resolveStatusScenario(search.scenario),
      surface: 'status',
    };
  }
  if (search.surface === 'history') {
    return {
      scenario: resolveHistoryScenario(search.scenario),
      surface: 'history',
    };
  }
  if (search.surface === 'market-connections') {
    return {
      scenario: resolveMarketConnectionsScenario(search.scenario),
      surface: 'market-connections',
    };
  }
  if (search.surface === 'stocks') {
    return {
      scenario: resolveStocksScenario(search.scenario, 'stocks'),
      surface: 'stocks',
    };
  }
  if (search.surface === 'today' || search.surface === 'admin-invitations') {
    if (knownScenarios.has(search.scenario as StocksPreviewScenario)) {
      invalidScenario(search.surface, search.scenario);
    }
    return { surface: search.surface };
  }
  return {
    scenario: resolveStocksScenario(search.scenario, 'workspace'),
    surface: undefined,
  };
}
