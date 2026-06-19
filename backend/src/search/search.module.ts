import { Module } from '@nestjs/common';
import { meiliClientProvider } from './meili.provider';
import { SearchIndexer } from './search-indexer.service';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';

@Module({
  controllers: [SearchController],
  providers: [meiliClientProvider, SearchIndexer, SearchService],
  exports: [SearchIndexer, SearchService],
})
export class SearchModule {}
