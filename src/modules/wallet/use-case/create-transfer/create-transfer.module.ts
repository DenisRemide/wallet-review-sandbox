import { Module } from '@nestjs/common';
import { WalletRepositoryModule } from '../../infrastructure/repositories/wallet/wallet.repository.module';
import { TransferRepositoryModule } from '../../infrastructure/repositories/transfer/transfer.repository.module';
import { TransferNotifier } from '../../infrastructure/transfer-notifier';
import { CreateTransferHandler } from './create-transfer.handler';

@Module({
  imports: [WalletRepositoryModule, TransferRepositoryModule],
  providers: [CreateTransferHandler, TransferNotifier],
  exports: [CreateTransferHandler],
})
export class CreateTransferModule {}
