import { ValidationPipe, VersioningType } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

/**
 * Request-pipeline configuration shared by `main.ts` and e2e tests so the test
 * app behaves exactly like production (versioning + validation + error envelope).
 */
export function configureApp(app: NestFastifyApplication): void {
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
}
