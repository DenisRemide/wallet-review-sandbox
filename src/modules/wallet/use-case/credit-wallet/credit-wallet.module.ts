import { Module } from '@nestjs/common';
import { WalletRepositoryModule } from '../../infrastructure/repositories/wallet/wallet.repository.module';
import { CreditWalletHandler } from './credit-wallet.handler';

@Module({
  imports: [WalletRepositoryModule],
  providers: [CreditWalletHandler],
  exports: [CreditWalletHandler],
})
export class CreditWalletModule {}
