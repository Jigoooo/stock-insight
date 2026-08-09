import type { StockListResponse } from '@stock-insight/contracts';
import type { GeoSnapshot } from '@stock-insight/contracts/geo-api-contract';
import type {
  DecisionHistoryPage,
  RadarSignalPage,
  ResearchFeedLaneId,
  ResearchRecordDetail,
  SystemStatus,
  WorkspaceToday,
} from '@stock-insight/contracts/research-workspace';

export type ResearchWorkspaceViewId = 'today' | 'radar' | 'stocks' | 'history' | 'status';

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
  | { history: DecisionHistoryPage; shell: ResearchWorkspaceShellSummary; view: 'history' }
  | { shell: ResearchWorkspaceShellSummary; status: SystemStatus; view: 'status' };
