import { Controller, Get, Inject } from '@nestjs/common';

import { API_SERVER_DB } from '../config/tokens.ts';
import type { DbProbeResult, DbService } from '../db/db-service.ts';

import { healthStatusSchema } from '@stock-insight/contracts';

export type HealthResponse = {
  ok: boolean;
  service: string;
  checkedAt: string;
  db: DbProbeResult;
};

@Controller()
export class HealthController {
  constructor(@Inject(API_SERVER_DB) private readonly db: DbService) {}

  @Get('health')
  async getHealth(): Promise<HealthResponse> {
    const base = healthStatusSchema.parse({
      ok: true,
      service: 'stock-insight-api-server',
      checkedAt: new Date().toISOString(),
    });
    const db = await this.db.probe();
    return { ...base, db };
  }
}
