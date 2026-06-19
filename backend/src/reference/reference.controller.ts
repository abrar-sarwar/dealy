import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators';
import { ReferenceService } from './reference.service';

/** Public reference data needed by onboarding before/around sign-in. */
@ApiTags('reference')
@Controller({ version: '1' })
export class ReferenceController {
  constructor(private readonly reference: ReferenceService) {}

  @Public()
  @Get('schools')
  @ApiOperation({ summary: 'List schools and their campuses' })
  schools() {
    return this.reference.listSchools();
  }

  @Public()
  @Get('campuses')
  @ApiOperation({ summary: 'List all campuses/city anchors' })
  campuses() {
    return this.reference.listCampuses();
  }

  @Public()
  @Get('categories')
  @ApiOperation({ summary: 'List deal categories' })
  categories() {
    return this.reference.listCategories();
  }
}
