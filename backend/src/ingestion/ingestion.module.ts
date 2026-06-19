import { Module } from '@nestjs/common';
import { SearchModule } from '../search/search.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { IngestionService } from './ingestion.service';
import { ProviderRegistry } from './provider-registry';
import { FixtureProvider } from './providers/fixture.provider';
import { TicketmasterProvider } from './providers/ticketmaster.provider';

@Module({
  imports: [SearchModule, NotificationsModule],
  providers: [IngestionService, ProviderRegistry, FixtureProvider, TicketmasterProvider],
  exports: [IngestionService, ProviderRegistry],
})
export class IngestionModule {}
