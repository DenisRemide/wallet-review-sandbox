import { Module } from '@nestjs/common';
import { PartnerModule } from '../../../partner/partner.module';
import { WalletRepositoryModule } from '../../infrastructure/repositories/wallet/wallet.repository.module';
import { CreditWalletHandler } from './credit-wallet.handler';

@Module({
  imports: [WalletRepositoryModule, PartnerModule],
  providers: [CreditWalletHandler],
  exports: [CreditWalletHandler],
})
export class CreditWalletModule {}
