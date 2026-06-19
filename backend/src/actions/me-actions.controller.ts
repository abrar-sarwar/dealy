import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { ActionsService } from './actions.service';

@ApiTags('actions')
@ApiBearerAuth('supabase')
@Controller({ path: 'me', version: '1' })
export class MeActionsController {
  constructor(private readonly actions: ActionsService) {}

  @Get('saved-deals')
  @ApiOperation({ summary: "The current user's saved deals (most recent first)" })
  saved(@CurrentUser() user: AuthUser) {
    return this.actions.listSaved(user.id);
  }

  @Get('watched-deals')
  @ApiOperation({ summary: "The current user's watched deals" })
  watched(@CurrentUser() user: AuthUser) {
    return this.actions.listWatched(user.id);
  }
}
