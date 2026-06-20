import { Injectable } from '@nestjs/common';
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
  ) {
    this.providers = new Map<string, DealProvider>([
      [fixture.name, fixture],
      [ticketmaster.name, ticketmaster],
      [editorial.name, editorial],
    ]);
  }

  get(name: string): DealProvider | undefined {
    return this.providers.get(name);
  }

  list(): DealProvider[] {
    return [...this.providers.values()];
  }
}
