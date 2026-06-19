import { Module } from '@nestjs/common';
import { LocalPushSender } from './providers/local-push-sender';
import { FcmPushSender } from './providers/fcm-push-sender';
import { pushSenderProvider } from './push-sender.provider';
import { PushTokensService } from './push-tokens.service';
import { NotificationsService } from './notifications.service';
import { PriceTrackingService } from './price-tracking.service';
import {
  NotificationPrefsController,
  NotificationsController,
  PushTokensController,
} from './notifications.controller';

@Module({
  controllers: [PushTokensController, NotificationsController, NotificationPrefsController],
  providers: [
    LocalPushSender,
    FcmPushSender,
    pushSenderProvider,
    PushTokensService,
    NotificationsService,
    PriceTrackingService,
  ],
  exports: [NotificationsService, PriceTrackingService, PushTokensService, LocalPushSender],
})
export class NotificationsModule {}
