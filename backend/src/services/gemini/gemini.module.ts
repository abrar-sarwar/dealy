import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { geminiConfig } from '../../config/gemini';
import type { Env } from '../../config/env.schema';
import { GeminiClient } from './gemini.client';
import { GeminiService } from './gemini.service';

@Module({
  providers: [
    {
      provide: GeminiClient,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const g = geminiConfig(config);
        return new GeminiClient({ apiKey: g.apiKey });
      },
    },
    {
      provide: GeminiService,
      inject: [GeminiClient, ConfigService],
      useFactory: (client: GeminiClient, config: ConfigService<Env, true>) =>
        new GeminiService(client, geminiConfig(config)),
    },
  ],
  exports: [GeminiClient, GeminiService],
})
export class GeminiModule {}
