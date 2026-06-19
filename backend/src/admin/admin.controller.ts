import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsEnum } from 'class-validator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DealStatus, UserRole } from '@prisma/client';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { AdminService } from './admin.service';
import { AuditService } from './audit.service';

export class GrantRoleDto {
  @IsEnum(UserRole)
  role!: UserRole;
}

@ApiTags('admin')
@ApiBearerAuth('supabase')
@Roles(UserRole.admin) // every route requires the admin role (RolesGuard)
@Controller({ path: 'admin', version: '1' })
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly audit: AuditService,
  ) {}

  @Post('users/:id/roles')
  @ApiOperation({ summary: 'Grant a role to a user (audited)' })
  grantRole(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GrantRoleDto,
  ) {
    return this.admin.grantRole(actor.id, id, dto.role);
  }

  @Post('deals/:id/publish')
  publish(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.setDealStatus(actor.id, id, DealStatus.published, 'deal.publish');
  }

  @Post('deals/:id/unpublish')
  unpublish(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.setDealStatus(actor.id, id, DealStatus.archived, 'deal.unpublish');
  }

  @Post('deals/:id/expire')
  expire(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.setDealStatus(actor.id, id, DealStatus.expired, 'deal.expire');
  }

  @Get('ingestion/failures')
  @ApiOperation({ summary: 'Recent ingestion failures' })
  failures() {
    return this.admin.listIngestionFailures();
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'Recent audit log entries' })
  auditLogs() {
    return this.audit.list();
  }
}
