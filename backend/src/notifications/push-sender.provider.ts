import { Logger } from '@nestjs/common';
import { FcmPushSender } from './providers/fcm-push-sender';
import { LocalPushSender } from './providers/local-push-sender';
import { PUSH_SENDER, type PushSender } from './push-sender';

/** Use FCM in production when configured; otherwise the local (dev/test) sender. */
export const pushSenderProvider = {
  provide: PUSH_SENDER,
  inject: [FcmPushSender, LocalPushSender],
  useFactory: (fcm: FcmPushSender, local: LocalPushSender): PushSender => {
    const sender = fcm.isAvailable() ? fcm : local;
    new Logger('PushSender').log(`Active push sender: ${sender.name}`);
    return sender;
  },
};
