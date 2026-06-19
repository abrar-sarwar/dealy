import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'node:fs';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

/** CLI: `pnpm openapi:export` — write the OpenAPI spec to docs/openapi.json. */
async function main(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  configureApp(app);
  await app.init();

  const config = new DocumentBuilder()
    .setTitle('Dealy API')
    .setDescription('Dealy production API — swipe-first, location-aware deals.')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Supabase access token' },
      'supabase',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  writeFileSync('docs/openapi.json', `${JSON.stringify(document, null, 2)}\n`);

  console.log(`Wrote docs/openapi.json (${Object.keys(document.paths).length} paths).`);
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
