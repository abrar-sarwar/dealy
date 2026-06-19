import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { SubscriptionsService } from './subscriptions.service';

export class AppleSyncDto {
  @IsString()
  @MaxLength(20_000)
  signedTransactionInfo!: string;
}

export class AppleWebhookDto {
  @IsString()
  @MaxLength(50_000)
  signedPayload!: string;
}

@ApiTags('subscriptions')
@Controller({ version: '1' })
export class SubscriptionsController {
  constructor(private readonly subs: SubscriptionsService) {}

  @ApiBearerAuth('supabase')
  @Get('me/entitlements')
  @ApiOperation({ summary: 'Server-computed entitlements (Dealy+)' })
  entitlements(@CurrentUser() user: AuthUser) {
    return this.subs.entitlements(user.id);
  }

  @ApiBearerAuth('supabase')
  @Post('subscriptions/apple/sync')
  @ApiOperation({ summary: 'Verify a StoreKit transaction and refresh entitlements' })
  sync(@CurrentUser() user: AuthUser, @Body() dto: AppleSyncDto) {
    return this.subs.syncTransaction(user.id, dto.signedTransactionInfo);
  }

  @Public()
  @Post('webhooks/apple')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'App Store Server Notifications v2 webhook' })
  async webhook(@Body() dto: AppleWebhookDto): Promise<{ received: true }> {
    await this.subs.handleNotification(dto.signedPayload);
    return { received: true };
  }
}
