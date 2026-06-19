import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { validateEnv } from './env.schema';

/**
 * Global typed configuration. Injects `ConfigService<Env, true>` everywhere.
 * Validation runs at boot via the zod schema in `env.schema.ts`.
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      envFilePath: ['.env'],
    }),
  ],
})
export class ConfigModule {}
