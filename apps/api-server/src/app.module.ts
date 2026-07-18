import { Module } from '@nestjs/common';

import { parseApiServerEnv, type ApiServerEnv } from './config/env.ts';
import { API_SERVER_DB, API_SERVER_ENV } from './config/tokens.ts';
import { createDbService } from './db/db-service.ts';
import { HealthController } from './health/health.controller.ts';
import { MetaController } from './meta/meta.controller.ts';
import { DashboardController } from './read/dashboard.controller.ts';
import { DiscoverController } from './read/discover.controller.ts';
import { MarketNewsController } from './read/market-news.controller.ts';
import { MeController } from './read/me.controller.ts';
import { PortfolioController } from './read/portfolio.controller.ts';
import { ProductController } from './read/product.controller.ts';
import { ResearchWorkspaceController } from './read/research-workspace.controller.ts';
import { StocksController } from './read/stocks.controller.ts';
import { ManualPortfolioController } from './write/manual-portfolio.controller.ts';

@Module({
  controllers: [
    HealthController,
    MetaController,
    DashboardController,
    MeController,
    PortfolioController,
    ProductController,
    MarketNewsController,
    DiscoverController,
    ResearchWorkspaceController,
    ManualPortfolioController,
    // StocksController is intentionally LAST: its `GET stocks/:entityKey` wildcard
    // must not shadow other static routes during registration.
    StocksController,
  ],
  providers: [
    {
      provide: API_SERVER_ENV,
      useFactory: () => parseApiServerEnv(),
    },
    {
      provide: API_SERVER_DB,
      useFactory: (env: ApiServerEnv) => createDbService(env),
      inject: [API_SERVER_ENV],
    },
  ],
})
export class AppModule {}
