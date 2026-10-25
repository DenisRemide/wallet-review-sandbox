import { Injectable } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { UseCaseHandler } from '../../../../lib/clean/use-case';
import { WalletTransaction } from '../../domain/wallet-transaction';
import { TransactionRepository } from '../../infrastructure/repositories/transaction/transaction.repository';
import { ListWalletTransactionsErrorCode } from './list-wallet-transactions.errors';

export type ListWalletTransactionsParams = {
  walletId: string;
  partnerId: string;
  limit: any;
};

@Injectable()
export class ListWalletTransactionsHandler implements UseCaseHandler<
  ListWalletTransactionsParams,
  Result<WalletTransaction[], ListWalletTransactionsErrorCode>
> {
  constructor(private readonly transactionRepository: TransactionRepository) {}

  async run(
    params: ListWalletTransactionsParams,
  ): Promise<Result<WalletTransaction[], ListWalletTransactionsErrorCode>> {
    console.log('listing transactions', params);

    const listResult = await this.transactionRepository.listByWallet(
      params.walletId,
      params.limit || 1000,
    );
    if (listResult.isErr()) {
      return err(listResult.error);
    }

    return ok(listResult.value);
  }
}
