import { Module } from '@nestjs/common';
import { APP_STORE_VERIFIER } from './app-store-verifier';
import { AppleJwsVerifier } from './apple-jws-verifier';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';

@Module({
  controllers: [SubscriptionsController],
  providers: [
    AppleJwsVerifier,
    { provide: APP_STORE_VERIFIER, useExisting: AppleJwsVerifier },
    SubscriptionsService,
  ],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
