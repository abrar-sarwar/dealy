import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { UpdatePreferencesDto, UpdateProfileDto } from './users.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth('supabase')
@Controller({ path: 'me', version: '1' })
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Current user profile, preferences, roles, interests' })
  me(@CurrentUser() user: AuthUser) {
    return this.users.getMe(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Update profile / onboarding / interests' })
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete (soft) the current account' })
  async deleteMe(@CurrentUser() user: AuthUser): Promise<void> {
    await this.users.deleteMe(user.id);
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Get preferences' })
  preferences(@CurrentUser() user: AuthUser) {
    return this.users.getPreferences(user.id);
  }

  @Put('preferences')
  @ApiOperation({ summary: 'Update preferences (radius, notifications)' })
  updatePreferences(@CurrentUser() user: AuthUser, @Body() dto: UpdatePreferencesDto) {
    return this.users.updatePreferences(user.id, dto);
  }
}
