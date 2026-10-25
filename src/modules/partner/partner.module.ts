import { Module } from '@nestjs/common';
import { PartnerRegistry } from './infrastructure/partner-registry';
import { PartnerWebhookNotifier } from './infrastructure/partner-webhook.notifier';
import { ApiKeyGuard } from './presentation/api-key.guard';

@Module({
  providers: [PartnerRegistry, ApiKeyGuard, PartnerWebhookNotifier],
  exports: [PartnerRegistry, ApiKeyGuard, PartnerWebhookNotifier],
})
export class PartnerModule {}
