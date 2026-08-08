import { DevPreviewPage } from './dev-preview-page';

void (<DevPreviewPage />);
void (<DevPreviewPage surface="workspace" scenario="no-holdings" />);
void (<DevPreviewPage surface="stocks" scenario="detail-error" />);
void (<DevPreviewPage surface="market-connections" scenario="no-personalized" />);
void (<DevPreviewPage surface="market-connections" scenario="partial" />);
void (<DevPreviewPage surface="history" scenario="no-user-judgments" />);
void (<DevPreviewPage surface="history" scenario="no-due" />);
void (<DevPreviewPage surface="today" />);
void (<DevPreviewPage surface="admin-invitations" />);

// @ts-expect-error no-holdings belongs to the Stocks preview only
void (<DevPreviewPage surface="market-connections" scenario="no-holdings" />);
// @ts-expect-error no-personalized belongs to the Market Connections preview only
void (<DevPreviewPage surface="stocks" scenario="no-personalized" />);
// @ts-expect-error partial belongs to the Market Connections preview only
void (<DevPreviewPage surface="workspace" scenario="partial" />);
// @ts-expect-error no-holdings belongs to the Stocks preview only
void (<DevPreviewPage surface="history" scenario="no-holdings" />);
// @ts-expect-error Today does not own preview scenarios
void (<DevPreviewPage surface="today" scenario="default" />);
// @ts-expect-error Admin Invitations does not own preview scenarios
void (<DevPreviewPage surface="admin-invitations" scenario="empty" />);
