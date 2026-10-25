import { Injectable, Logger } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { UseCaseHandler } from '../../../../lib/clean/use-case';
import { LockService } from '../../../../lib/concurrency/lock.service';
import { IdempotencyStore } from '../../../../lib/idempotency/idempotency.store';
import {
  isGreaterThanOrEqual,
  Money,
  subtractMoney,
} from '../../../../lib/money/money';
import { WalletEvent } from '../../../../infrastructure/logger/wallet-event';
import { Wallet } from '../../domain/wallet';
import { WalletRepository } from '../../infrastructure/repositories/wallet/wallet.repository';
import { DebitWalletErrorCode } from './debit-wallet.errors';

export type DebitWalletParams = {
  walletId: string;
  partnerId: string;
  amount: Money;
  idempotencyKey: string;
};

export type DebitWalletResult = {
  walletId: string;
  balance: Money;
};

@Injectable()
export class DebitWalletHandler implements UseCaseHandler<
  DebitWalletParams,
  Result<DebitWalletResult, DebitWalletErrorCode>
> {
  private readonly logger = new Logger(DebitWalletHandler.name);

  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly lockService: LockService,
    private readonly idempotencyStore: IdempotencyStore<Wallet>,
  ) {}

  async run(
    params: DebitWalletParams,
  ): Promise<Result<DebitWalletResult, DebitWalletErrorCode>> {
    this.logger.log({
      event: WalletEvent.DEBIT_RECEIVED,
      walletId: params.walletId,
      partnerId: params.partnerId,
    });

    const cached = this.idempotencyStore.get(params.idempotencyKey);
    if (cached) {
      return ok({ walletId: cached.id, balance: cached.balance });
    }

    const debitResult = await this.lockService.using(
      [`atomic:wallet-debit:${params.walletId}`],
      async (): Promise<Result<Wallet, DebitWalletErrorCode>> => {
        const walletResult = await this.walletRepository.findById(
          params.walletId,
        );
        if (walletResult.isErr()) {
          return err(walletResult.error);
        }

        const wallet = walletResult.value;
        if (!wallet) {
          return err('DEBIT_WALLET_NOT_FOUND');
        }

        if (wallet.partnerId !== params.partnerId) {
          return err('DEBIT_WALLET_FORBIDDEN');
        }

        if (!isGreaterThanOrEqual(wallet.balance, params.amount)) {
          return err('DEBIT_WALLET_INSUFFICIENT_FUNDS');
        }

        return this.walletRepository.setBalance(
          wallet.id,
          subtractMoney(wallet.balance, params.amount),
        );
      },
    );

    if (debitResult.isErr()) {
      return err(debitResult.error);
    }

    this.idempotencyStore.remember(params.idempotencyKey, debitResult.value);
    this.logger.log({
      event: WalletEvent.DEBIT_PERSISTED,
      walletId: debitResult.value.id,
    });

    return ok({
      walletId: debitResult.value.id,
      balance: debitResult.value.balance,
    });
  }
}
