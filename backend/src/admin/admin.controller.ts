import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { IsEnum } from 'class-validator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DealStatus, UserRole } from '@prisma/client';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { AdminService } from './admin.service';
import { AuditService } from './audit.service';
import { CoverageService } from '../coverage/coverage.service';
import { ModerationService } from './moderation.service';
import { ModerationQueueQuery, RejectDto, ModerationEditDto } from './moderation.dto';

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
    private readonly coverage: CoverageService,
    private readonly moderation: ModerationService,
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

  @Get('coverage')
  @ApiOperation({
    summary: 'Density-first coverage report: verified inventory, zone readiness, provider health',
  })
  coverageReport() {
    return this.coverage.report();
  }

  @Get('moderation/queue')
  @ApiOperation({ summary: 'Pending curated candidates (highest confidence first)' })
  moderationQueue(@Query() q: ModerationQueueQuery) {
    return this.moderation.queue({ source: q.source, category: q.category, limit: q.limit });
  }

  @Post('moderation/:id/approve')
  approve(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.moderation.approve(actor.id, id);
  }

  @Post('moderation/:id/reject')
  reject(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectDto,
  ) {
    return this.moderation.reject(actor.id, id, dto.reason);
  }

  @Post('moderation/:id/edit')
  edit(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModerationEditDto,
  ) {
    return this.moderation.edit(actor.id, id, dto);
  }
}
