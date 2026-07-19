import type { StockListResponse } from '@stock-insight/contracts';
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

export type ResearchWorkspaceViewPayload =
  | {
      defaultRecord: ResearchRecordDetail | null;
      lane: ResearchFeedLaneId;
      shell: ResearchWorkspaceShellSummary;
      today: WorkspaceToday;
      view: 'today';
    }
  | { radar: RadarSignalPage; shell: ResearchWorkspaceShellSummary; view: 'radar' }
  | { shell: ResearchWorkspaceShellSummary; stocks: StockListResponse; view: 'stocks' }
  | {
      relation: EntityRelationGraph | null;
      shell: ResearchWorkspaceShellSummary;
      themes: ThemeResearchList;
      view: 'themes';
    }
  | {
      myResearch: MyResearchOverview;
      shell: ResearchWorkspaceShellSummary;
      view: 'research';
    }
  | { history: DecisionHistoryPage; shell: ResearchWorkspaceShellSummary; view: 'history' }
  | { shell: ResearchWorkspaceShellSummary; status: SystemStatus; view: 'status' };
