import { Injectable } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { Money } from '../../../../../lib/money/money';
import { Currency } from '../../../domain/currency';
import { Wallet } from '../../../domain/wallet';
import {
  WalletRepositoryFindErrorCode,
  WalletRepositorySetBalanceErrorCode,
} from './wallet.repository.errors';

// Demo fixtures — production reads/writes Postgres. The store keeps the
// repository contract (Result-returning, one error type per method) identical
// so use-cases are unaware that persistence is in-memory.
const seedWallets = (): Map<string, Wallet> => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const wallets: Wallet[] = [
    {
      id: 'wallet-acme-usd',
      partnerId: 'partner-acme',
      currency: Currency.USD,
      balance: '1000.00',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'wallet-globex-usd',
      partnerId: 'partner-globex',
      currency: Currency.USD,
      balance: '500.00',
      createdAt: now,
      updatedAt: now,
    },
  ];
  return new Map(wallets.map((wallet) => [wallet.id, wallet]));
};

@Injectable()
export class WalletRepository {
  private readonly wallets = seedWallets();

  async findById(
    walletId: string,
  ): Promise<Result<Wallet | undefined, WalletRepositoryFindErrorCode>> {
    return ok(this.wallets.get(walletId));
  }

  async setBalance(
    walletId: string,
    balance: Money,
  ): Promise<Result<Wallet, WalletRepositorySetBalanceErrorCode>> {
    const current = this.wallets.get(walletId);
    if (!current) {
      return err('SET_BALANCE_WALLET_TARGET_MISSING');
    }

    const updated: Wallet = {
      ...current,
      balance,
      updatedAt: new Date(),
    };
    this.wallets.set(walletId, updated);

    return ok(updated);
  }
}
