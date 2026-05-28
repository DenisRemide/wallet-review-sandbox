import { Module } from '@nestjs/common';
import { PartnerRegistry } from './infrastructure/partner-registry';
import { ApiKeyGuard } from './presentation/api-key.guard';

@Module({
  providers: [PartnerRegistry, ApiKeyGuard],
  exports: [PartnerRegistry, ApiKeyGuard],
})
export class PartnerModule {}
