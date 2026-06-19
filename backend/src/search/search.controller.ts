import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators';
import { SearchQueryDto } from './search.dto';
import { SearchService } from './search.service';

@ApiTags('search')
@Controller({ version: '1' })
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Public()
  @Get('search')
  @ApiOperation({ summary: 'Search deals (full-text, filters, sort; typo-tolerant)' })
  run(@Query() query: SearchQueryDto) {
    return this.search.search(query);
  }
}
