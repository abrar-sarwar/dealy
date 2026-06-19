import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from '@fastify/helmet';
import * as Sentry from '@sentry/node';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { validateEnv } from './config/env.schema';
import type { Env } from './config/env.schema';

async function bootstrap(): Promise<void> {
  // Initialise Sentry before the app so early errors are captured (no-op if no DSN).
  const env = validateEnv(process.env);
  if (env.SENTRY_DSN) {
    Sentry.init({ dsn: env.SENTRY_DSN, environment: env.APP_ENV, tracesSampleRate: 0 });
  }

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
    { bufferLogs: true },
  );

  // Use pino for all framework logs.
  app.useLogger(app.get(Logger));
  const config = app.get(ConfigService<Env, true>);

  // Security headers.
  await app.register(helmet, { contentSecurityPolicy: false });

  // CORS — native iOS uses bearer tokens (CORS-irrelevant); this covers web/admin.
  const origins = config
    .get('CORS_ALLOWED_ORIGINS', { infer: true })
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins.length > 0 ? origins : false,
    credentials: true,
  });

  // Versioning (/v1) + strict request validation — shared with e2e tests.
  configureApp(app);

  // Drain connections cleanly on SIGTERM (Railway/containers).
  app.enableShutdownHooks();

  // OpenAPI / Swagger at /docs.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Dealy API')
    .setDescription('Dealy production API — swipe-first, location-aware deals.')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Supabase access token' },
      'supabase',
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = config.get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
  app
    .get(Logger)
    .log(`Dealy API listening on :${port} (env=${config.get('APP_ENV', { infer: true })})`);
}

void bootstrap();
