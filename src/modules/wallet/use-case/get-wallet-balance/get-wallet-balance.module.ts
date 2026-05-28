import { Module } from '@nestjs/common';
import { WalletRepositoryModule } from '../../infrastructure/repositories/wallet/wallet.repository.module';
import { GetWalletBalanceHandler } from './get-wallet-balance.handler';

@Module({
  imports: [WalletRepositoryModule],
  providers: [GetWalletBalanceHandler],
  exports: [GetWalletBalanceHandler],
})
export class GetWalletBalanceModule {}
