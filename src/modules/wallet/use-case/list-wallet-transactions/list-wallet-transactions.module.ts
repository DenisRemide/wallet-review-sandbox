import { Module } from '@nestjs/common';
import { TransactionRepositoryModule } from '../../infrastructure/repositories/transaction/transaction.repository.module';
import { ListWalletTransactionsHandler } from './list-wallet-transactions.handler';

@Module({
  imports: [TransactionRepositoryModule],
  providers: [ListWalletTransactionsHandler],
  exports: [ListWalletTransactionsHandler],
})
export class ListWalletTransactionsModule {}
