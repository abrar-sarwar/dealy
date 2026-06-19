import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from './config/config.module';
import type { Env } from './config/env.schema';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ReferenceModule } from './reference/reference.module';
import { DealsModule } from './deals/deals.module';
import { ActionsModule } from './actions/actions.module';
import { SearchModule } from './search/search.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const isDev = config.get('NODE_ENV', { infer: true }) !== 'production';
        return {
          pinoHttp: {
            level: config.get('LOG_LEVEL', { infer: true }),
            // Pretty logs in dev; structured JSON in prod.
            transport: isDev ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
            // Redact anything that could leak secrets/tokens.
            redact: {
              paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],
              remove: true,
            },
            customProps: () => ({ context: 'HTTP' }),
          },
        };
      },
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    UsersModule,
    ReferenceModule,
    DealsModule,
    ActionsModule,
    SearchModule,
    NotificationsModule,
    AnalyticsModule,
    SubscriptionsModule,
    AdminModule,
    IngestionModule,
  ],
})
export class AppModule {}
