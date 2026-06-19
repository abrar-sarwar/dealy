import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { DevicePlatform } from '@prisma/client';
import { CurrentUser } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { PushTokensService } from './push-tokens.service';
import { NotificationsService } from './notifications.service';
import { RegisterPushTokenDto, UpdateNotificationPrefsDto } from './notifications.dto';

@ApiTags('notifications')
@ApiBearerAuth('supabase')
@Controller({ path: 'push-tokens', version: '1' })
export class PushTokensController {
  constructor(private readonly tokens: PushTokensService) {}

  @Post()
  @ApiOperation({ summary: 'Register/refresh a device push token' })
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterPushTokenDto) {
    return this.tokens.register(user.id, dto.token, dto.platform as unknown as DevicePlatform);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a device push token' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.tokens.remove(user.id, id);
  }
}

@ApiTags('notifications')
@ApiBearerAuth('supabase')
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: "The current user's notifications" })
  list(@CurrentUser() user: AuthUser) {
    return this.notifications.list(user.id);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark a notification read' })
  async read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.notifications.markRead(user.id, id);
  }
}

@ApiTags('notifications')
@ApiBearerAuth('supabase')
@Controller({ path: 'me', version: '1' })
export class NotificationPrefsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('notification-preferences')
  @ApiOperation({ summary: 'Get notification preferences' })
  get(@CurrentUser() user: AuthUser) {
    return this.notifications.getPreferences(user.id);
  }

  @Put('notification-preferences')
  @ApiOperation({ summary: 'Update notification preferences (toggles + quiet hours)' })
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateNotificationPrefsDto) {
    return this.notifications.updatePreferences(user.id, dto);
  }
}
