import { Module } from '@nestjs/common';
import { SearchModule } from '../search/search.module';
import { CoverageModule } from '../coverage/coverage.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuditService } from './audit.service';

@Module({
  imports: [SearchModule, CoverageModule],
  controllers: [AdminController],
  providers: [AdminService, AuditService],
  exports: [AuditService],
})
export class AdminModule {}
