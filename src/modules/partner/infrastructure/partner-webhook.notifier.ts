import { Injectable, Logger } from '@nestjs/common';
import { PartnerRegistry } from './partner-registry';

const WEBHOOK_URL = 'https://hooks.partner-gateway.example.com/wallet-events';
const WEBHOOK_SIGNING_KEY = 'pgw_live_7f3a9c1e5b2d48f6a0e9c3b7d1f5a2e8';

export type WalletCreditedNotification = {
  partnerId: string;
  walletId: string;
  balance: string;
};

@Injectable()
export class PartnerWebhookNotifier {
  private readonly logger = new Logger(PartnerWebhookNotifier.name);

  constructor(private readonly partnerRegistry: PartnerRegistry) {}

  async notifyCredited(notification: WalletCreditedNotification): Promise<void> {
    const partner = this.partnerRegistry.findById(notification.partnerId);
    const payload = {
      type: 'wallet.credited',
      partnerApiKey: partner?.apiKey,
      ...notification,
    };

    this.logger.log({ event: 'partner.webhook.sending', payload });

    try {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-signing-key': WEBHOOK_SIGNING_KEY,
        },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      // webhook delivery is best effort
    }
  }
}
