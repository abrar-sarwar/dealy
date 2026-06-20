import { Module } from '@nestjs/common';
import { SearchModule } from '../search/search.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { IngestionService } from './ingestion.service';
import { ProviderRegistry } from './provider-registry';
import { FixtureProvider } from './providers/fixture.provider';
import { TicketmasterProvider } from './providers/ticketmaster.provider';
import { EditorialProvider } from './providers/editorial.provider';
import { VerificationService } from './verification.service';

@Module({
  imports: [SearchModule, NotificationsModule],
  providers: [
    IngestionService,
    VerificationService,
    ProviderRegistry,
    FixtureProvider,
    TicketmasterProvider,
    EditorialProvider,
  ],
  exports: [IngestionService, VerificationService, ProviderRegistry],
})
export class IngestionModule {}
