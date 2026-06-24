import { Injectable } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { aiCacheKey, sha256 } from './discovery-cost';

export interface AiCacheParams {
  task: string;
  model: string;
  schemaVersion: string;
  prompt: string;
}

/** Prompt/result cache for Gemini (P4). Fresh hit → stored output, no model
 *  call. Miss or expired → run generate(), upsert with TTL, record hit metrics. */
@Injectable()
export class AiCacheService {
  constructor(
    private readonly prisma: Pick<PrismaService, 'aiCache'>,
    private readonly ttlHours: number,
  ) {}

  async getOrGenerate<T>(params: AiCacheParams, generate: () => Promise<T>): Promise<{ value: T; cacheHit: boolean }> {
    const cacheKey = aiCacheKey(params);
    const now = new Date();
    const existing = await this.prisma.aiCache.findUnique({ where: { cacheKey } });
    if (existing && existing.expiresAt > now) {
      await this.prisma.aiCache.update({ where: { cacheKey }, data: { hitCount: { increment: 1 }, lastHitAt: now } });
      return { value: existing.output as T, cacheHit: true };
    }
    const value = await generate();
    const expiresAt = new Date(now.getTime() + this.ttlHours * 60 * 60 * 1000);
    const promptHash = sha256(params.prompt);
    await this.prisma.aiCache.upsert({
      where: { cacheKey },
      create: { cacheKey, task: params.task, model: params.model, schemaVersion: params.schemaVersion, promptHash, output: value as object, expiresAt },
      update: { output: value as object, expiresAt, promptHash },
    });
    return { value, cacheHit: false };
  }
}
