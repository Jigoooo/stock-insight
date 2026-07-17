import { Controller, Get, Inject } from '@nestjs/common';

import type { ApiServerEnv } from '../config/env.ts';
import { API_SERVER_ENV } from '../config/tokens.ts';

export type MetaResponse = {
  service: string;
  apiVersion: 'v1';
  nodeEnv: string;
  uptimeSec: number;
};

@Controller('meta')
export class MetaController {
  constructor(@Inject(API_SERVER_ENV) private readonly env: ApiServerEnv) {}

  @Get()
  getMeta(): MetaResponse {
    return {
      service: 'stock-insight-api-server',
      apiVersion: 'v1',
      nodeEnv: this.env.nodeEnv ?? 'development',
      uptimeSec: Math.round(process.uptime()),
    };
  }
}
