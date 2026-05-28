import { Module } from '@nestjs/common';
import { LockModule } from './lib/concurrency/lock.module';
import { IdempotencyModule } from './lib/idempotency/idempotency.module';
import { PartnerModule } from './modules/partner/partner.module';
import { WalletModule } from './modules/wallet/wallet.module';

@Module({
  imports: [LockModule, IdempotencyModule, PartnerModule, WalletModule],
})
export class AppModule {}
