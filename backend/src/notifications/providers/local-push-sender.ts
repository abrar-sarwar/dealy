import { Injectable, Logger } from '@nestjs/common';
import type { PushMessage, PushSender, PushSendResult } from '../push-sender';

/**
 * Development/test push sender. Records (logs) deliveries and reports success.
 * Treats the sentinel token `invalid-token` as permanently invalid so the
 * invalid-token cleanup path is testable.
 */
@Injectable()
export class LocalPushSender implements PushSender {
  readonly name = 'local';
  private readonly logger = new Logger(LocalPushSender.name);
  /** Captures the last batch for assertions in tests. */
  readonly sent: PushMessage[] = [];

  isAvailable(): boolean {
    return true;
  }

  async send(messages: PushMessage[]): Promise<PushSendResult[]> {
    this.sent.push(...messages);
    return messages.map((m) => {
      const invalidToken = m.token === 'invalid-token';
      if (!invalidToken) this.logger.debug(`(local) push → ${m.token}: ${m.title}`);
      return { token: m.token, success: !invalidToken, invalidToken };
    });
  }
}
