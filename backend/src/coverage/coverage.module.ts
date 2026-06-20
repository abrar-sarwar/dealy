import { Module } from '@nestjs/common';
import { CoverageService } from './coverage.service';

@Module({
  providers: [CoverageService],
  exports: [CoverageService],
})
export class CoverageModule {}
