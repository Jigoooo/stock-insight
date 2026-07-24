import type { StockListResponse } from '@stock-insight/contracts';
import type { CryptoResearchWorkspace } from '@stock-insight/contracts/crypto-research';
import type { GeoSnapshot } from '@stock-insight/contracts/geo-api-contract';
import type {
  PersonalizationDecisionHistory,
  PersonalizationDecisionSupport,
  PersonalizationPortfolioImpact,
  PersonalizationPortfolioSnapshot,
  PersonalizationThesis,
} from '@stock-insight/contracts/personalization';
import type {
  DecisionHistoryPage,
  EntityRelationGraph,
  MyResearchOverview,
  RadarSignalPage,
  ResearchFeedLaneId,
  ResearchRecordDetail,
  SystemStatus,
  ThemeResearchList,
  WorkspaceToday,
} from '@stock-insight/contracts/research-workspace';

export type ResearchWorkspaceViewId =
  | 'today'
  | 'radar'
  | 'stocks'
  | 'crypto'
  | 'themes'
  | 'research'
  | 'history'
  | 'status';

export type ResearchWorkspaceViewOptions = {
  cursor?: string;
  lane?: ResearchFeedLaneId;
  record?: string;
  view: ResearchWorkspaceViewId;
};

export type ResearchWorkspaceShellSummary = {
  radarScopeTotal: number;
  watchlistCount: number;
};

export type PersonalizationResearchWorkspace = {
  decision: PersonalizationDecisionSupport | null;
  decisionHistory: PersonalizationDecisionHistory | null;
  impact: PersonalizationPortfolioImpact | null;
  portfolio: PersonalizationPortfolioSnapshot | null;
  selectedEntityKey: string | null;
  thesis: PersonalizationThesis | null;
};

export type ResearchWorkspaceViewPayload =
  | {
      defaultRecord: ResearchRecordDetail | null;
      lane: ResearchFeedLaneId;
      shell: ResearchWorkspaceShellSummary;
      today: WorkspaceToday;
      view: 'today';
    }
  | {
      geoSnapshot: GeoSnapshot;
      radar: RadarSignalPage;
      shell: ResearchWorkspaceShellSummary;
      view: 'radar';
    }
  | { shell: ResearchWorkspaceShellSummary; stocks: StockListResponse; view: 'stocks' }
  | { crypto: CryptoResearchWorkspace; shell: ResearchWorkspaceShellSummary; view: 'crypto' }
  | {
      relation: EntityRelationGraph | null;
      shell: ResearchWorkspaceShellSummary;
      themes: ThemeResearchList;
      view: 'themes';
    }
  | {
      myResearch: MyResearchOverview;
      personalization: PersonalizationResearchWorkspace;
      shell: ResearchWorkspaceShellSummary;
      view: 'research';
    }
  | { history: DecisionHistoryPage; shell: ResearchWorkspaceShellSummary; view: 'history' }
  | { shell: ResearchWorkspaceShellSummary; status: SystemStatus; view: 'status' };
