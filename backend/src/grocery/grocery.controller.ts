import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators';
import { GroceryBasketService } from './grocery-basket.service';
import { GenerateBasketDto, type BasketDto } from './grocery.dto';
import { toBasketDto, toGenerateInput } from './grocery.mapper';

@ApiTags('grocery')
@Controller({ path: 'grocery', version: '1' })
export class GroceryController {
  constructor(private readonly baskets: GroceryBasketService) {}

  @Public()
  @Post('baskets/generate')
  @ApiOperation({
    summary:
      'Generate a Smart Basket: budget-fit student staples, matched real grocery deals, ' +
      'best store + optional second stop, estimated total, and an honest explanation. ' +
      'Works without auth and out-of-area (lower confidence + estimated labels).',
  })
  async generate(@Body() body: GenerateBasketDto): Promise<BasketDto> {
    const entity = await this.baskets.generate(toGenerateInput(body));
    return toBasketDto(entity);
  }

  @Public()
  @Post('baskets/:id/regenerate')
  @ApiOperation({
    summary: 'Re-roll a Smart Basket from its saved parameters (returns a new basket)',
  })
  async regenerate(@Param('id') id: string): Promise<BasketDto> {
    const entity = await this.baskets.regenerate(id);
    return toBasketDto(entity);
  }

  @Public()
  @Get('baskets/:id')
  @ApiOperation({ summary: 'Fetch a previously generated Smart Basket by id' })
  async getById(@Param('id') id: string): Promise<BasketDto> {
    const entity = await this.baskets.getById(id);
    return toBasketDto(entity);
  }
}
