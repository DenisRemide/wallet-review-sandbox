import { Module } from '@nestjs/common';
import { TransferRepository } from './transfer.repository';

@Module({
  providers: [TransferRepository],
  exports: [TransferRepository],
})
export class TransferRepositoryModule {}
