import { Module } from '@nestjs/common';
import { ActionsController } from './actions.controller';
import { MeActionsController } from './me-actions.controller';
import { ActionsService } from './actions.service';

@Module({
  controllers: [ActionsController, MeActionsController],
  providers: [ActionsService],
  exports: [ActionsService],
})
export class ActionsModule {}
