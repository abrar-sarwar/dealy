import { Injectable } from '@nestjs/common';
import type { DealProvider } from './normalized-deal';
import { FixtureProvider } from './providers/fixture.provider';
import { TicketmasterProvider } from './providers/ticketmaster.provider';

@Injectable()
export class ProviderRegistry {
  private readonly providers: Map<string, DealProvider>;

  constructor(fixture: FixtureProvider, ticketmaster: TicketmasterProvider) {
    this.providers = new Map<string, DealProvider>([
      [fixture.name, fixture],
      [ticketmaster.name, ticketmaster],
    ]);
  }

  get(name: string): DealProvider | undefined {
    return this.providers.get(name);
  }

  list(): DealProvider[] {
    return [...this.providers.values()];
  }
}
