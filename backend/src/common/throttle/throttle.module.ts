import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GenerationThrottleGuard } from './generation-throttle.guard';

/**
 * Provides a single, shared {@link GenerationThrottleGuard} instance (one
 * in-memory bucket store) to any module that imports this one — so the Food Run
 * and Smart Basket controllers share the same per-IP budget.
 */
@Module({
  imports: [ConfigModule],
  providers: [GenerationThrottleGuard],
  exports: [GenerationThrottleGuard],
})
export class ThrottleModule {}
