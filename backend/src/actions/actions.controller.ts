import { Body, Controller, Delete, Headers, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InteractionType, SwipeDirection } from '@prisma/client';
import { CurrentUser } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { ActionsService } from './actions.service';
import { CreateSwipeDto } from './actions.dto';

@ApiTags('actions')
@ApiBearerAuth('supabase')
@Controller({ path: 'deals', version: '1' })
export class ActionsController {
  constructor(private readonly actions: ActionsService) {}

  @Post(':id/swipes')
  @ApiOperation({ summary: 'Record a swipe (right saves). Supports Idempotency-Key.' })
  swipe(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSwipeDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.actions.swipe(
      user.id,
      id,
      dto.direction as unknown as SwipeDirection,
      idempotencyKey,
    );
  }

  @Delete(':id/swipes/latest')
  @ApiOperation({ summary: 'Undo the latest swipe for this deal' })
  undo(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.actions.undoLatestSwipe(user.id, id);
  }

  @Post(':id/save')
  save(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.actions.save(user.id, id);
  }

  @Delete(':id/save')
  unsave(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.actions.unsave(user.id, id);
  }

  @Post(':id/watch')
  watch(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.actions.watch(user.id, id);
  }

  @Delete(':id/watch')
  unwatch(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.actions.unwatch(user.id, id);
  }

  @Post(':id/views')
  view(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.actions.recordInteraction(user.id, id, InteractionType.view);
  }

  @Post(':id/clicks')
  click(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.actions.recordInteraction(user.id, id, InteractionType.click);
  }

  @Post(':id/shares')
  share(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.actions.recordInteraction(user.id, id, InteractionType.share);
  }

  @Post(':id/redemptions')
  @ApiOperation({ summary: 'Mark used — counts realized savings once per user+deal' })
  redeem(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.actions.redeem(user.id, id);
  }
}
