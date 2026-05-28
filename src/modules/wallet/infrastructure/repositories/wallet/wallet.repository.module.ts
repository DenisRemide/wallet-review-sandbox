import { Module } from '@nestjs/common';
import { WalletRepository } from './wallet.repository';

@Module({
  providers: [WalletRepository],
  exports: [WalletRepository],
})
export class WalletRepositoryModule {}
