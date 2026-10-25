import { Module } from '@nestjs/common';
import { WalletRepositoryModule } from '../../infrastructure/repositories/wallet/wallet.repository.module';
import { DebitWalletHandler } from './debit-wallet.handler';

@Module({
  imports: [WalletRepositoryModule],
  providers: [DebitWalletHandler],
  exports: [DebitWalletHandler],
})
export class DebitWalletModule {}
