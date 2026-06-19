import { Global, Module } from '@nestjs/common';
import { posthogProvider } from './posthog.provider';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';

/** Global so any module can emit server-side events without re-importing. */
@Global()
@Module({
  controllers: [AnalyticsController],
  providers: [posthogProvider, AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
