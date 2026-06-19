import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators';
import { DealsService } from './deals.service';

@ApiTags('deals')
@Controller({ path: 'deals', version: '1' })
export class DealsController {
  constructor(private readonly deals: DealsService) {}

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get a published deal by id' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.deals.getById(id);
  }
}
