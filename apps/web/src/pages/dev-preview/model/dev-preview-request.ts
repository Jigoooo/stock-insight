import type { MarketConnectionsPreviewScenario } from './market-connections-preview-fixture';

export type StocksPreviewScenario = 'default' | 'no-holdings' | 'empty' | 'detail-error';
export type DevPreviewPageProps =
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
const knownScenarios = new Set([...stockScenarios, ...marketConnectionsScenarios]);

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

export function resolveDevPreviewRequest(search: Record<string, unknown>): DevPreviewPageProps {
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
