import { Module } from '@nestjs/common';
import { TransactionRepository } from './transaction.repository';

@Module({
  providers: [TransactionRepository],
  exports: [TransactionRepository],
})
export class TransactionRepositoryModule {}
