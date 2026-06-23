import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { fixturesEnabled } from '../config/env.schema';
import type { DealProvider } from './normalized-deal';
import { FixtureProvider } from './providers/fixture.provider';
import { TicketmasterProvider } from './providers/ticketmaster.provider';
import { EditorialProvider } from './providers/editorial.provider';

@Injectable()
export class ProviderRegistry {
  private readonly providers: Map<string, DealProvider>;

  constructor(
    fixture: FixtureProvider,
    ticketmaster: TicketmasterProvider,
    editorial: EditorialProvider,
    config: ConfigService<Env, true>,
  ) {
    // Authoritative providers are always available. Fixture/editorial (non-
    // authoritative dev/demo sources) are registered ONLY when fixtures are
    // enabled — so they cannot be silently ingested in staging/production.
    this.providers = new Map<string, DealProvider>([[ticketmaster.name, ticketmaster]]);
    if (
      fixturesEnabled({
        APP_ENV: config.get('APP_ENV', { infer: true }),
        DEALY_ENABLE_FIXTURES: config.get('DEALY_ENABLE_FIXTURES', { infer: true }),
      })
    ) {
      this.providers.set(fixture.name, fixture);
      this.providers.set(editorial.name, editorial);
    }
  }

  get(name: string): DealProvider | undefined {
    return this.providers.get(name);
  }

  list(): DealProvider[] {
    return [...this.providers.values()];
  }
}
