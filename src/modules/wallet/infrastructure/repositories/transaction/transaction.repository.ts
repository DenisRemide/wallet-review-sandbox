import { Injectable } from '@nestjs/common';
import { ok, Result } from 'neverthrow';
import {
  WalletTransaction,
  WalletTransactionKind,
} from '../../../domain/wallet-transaction';
import { TransactionRepositoryListErrorCode } from './transaction.repository.errors';

const seedTransactions = (): WalletTransaction[] => [
  {
    id: 'tx-0001',
    walletId: 'wallet-acme-usd',
    kind: WalletTransactionKind.CREDIT,
    amount: '1000.00',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  },
  {
    id: 'tx-0002',
    walletId: 'wallet-globex-usd',
    kind: WalletTransactionKind.CREDIT,
    amount: '500.00',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  },
];

@Injectable()
export class TransactionRepository {
  private readonly transactions = seedTransactions();

  async listByWallet(
    walletId: string,
    limit: number,
  ): Promise<Result<WalletTransaction[], TransactionRepositoryListErrorCode>> {
    const rows = this.transactions
      .filter((transaction) => transaction.walletId === walletId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);

    return ok(rows);
  }
}
