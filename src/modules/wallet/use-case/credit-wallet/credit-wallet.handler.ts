import { Injectable, Logger } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { UseCaseHandler } from '../../../../lib/clean/use-case';
import { LockService } from '../../../../lib/concurrency/lock.service';
import { IdempotencyStore } from '../../../../lib/idempotency/idempotency.store';
import { addMoney, isPositiveMoney, Money } from '../../../../lib/money/money';
import { WalletEvent } from '../../../../infrastructure/logger/wallet-event';
import { Wallet } from '../../domain/wallet';
import { WalletRepository } from '../../infrastructure/repositories/wallet/wallet.repository';
import { CreditWalletErrorCode } from './credit-wallet.errors';

export type CreditWalletParams = {
  walletId: string;
  partnerId: string;
  amount: Money;
  idempotencyKey: string;
};

export type CreditWalletResult = {
  walletId: string;
  balance: Money;
};

@Injectable()
export class CreditWalletHandler implements UseCaseHandler<
  CreditWalletParams,
  Result<CreditWalletResult, CreditWalletErrorCode>
> {
  private readonly logger = new Logger(CreditWalletHandler.name);

  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly lockService: LockService,
    private readonly idempotencyStore: IdempotencyStore<Wallet>,
  ) {}

  async run(
    params: CreditWalletParams,
  ): Promise<Result<CreditWalletResult, CreditWalletErrorCode>> {
    this.logger.log({
      event: WalletEvent.CREDIT_RECEIVED,
      walletId: params.walletId,
      partnerId: params.partnerId,
    });

    if (!isPositiveMoney(params.amount)) {
      return err('CREDIT_WALLET_INVALID_AMOUNT');
    }

    const cached = this.idempotencyStore.get(params.idempotencyKey);
    if (cached) {
      return ok({ walletId: cached.id, balance: cached.balance });
    }

    const creditResult = await this.lockService.using(
      [`atomic:wallet-credit:${params.walletId}`],
      async (): Promise<Result<Wallet, CreditWalletErrorCode>> => {
        const walletResult = await this.walletRepository.findById(
          params.walletId,
        );
        if (walletResult.isErr()) {
          return err(walletResult.error);
        }

        const wallet = walletResult.value;
        if (!wallet) {
          return err('CREDIT_WALLET_NOT_FOUND');
        }

        if (wallet.partnerId !== params.partnerId) {
          return err('CREDIT_WALLET_FORBIDDEN');
        }

        const nextBalance = addMoney(wallet.balance, params.amount);
        const setResult = await this.walletRepository.setBalance(
          wallet.id,
          nextBalance,
        );
        if (setResult.isErr()) {
          this.logger.error({
            event: WalletEvent.CREDIT_FAILED,
            walletId: wallet.id,
            error: setResult.error,
          });
          return err(setResult.error);
        }

        return ok(setResult.value);
      },
    );

    if (creditResult.isErr()) {
      return err(creditResult.error);
    }

    this.idempotencyStore.remember(params.idempotencyKey, creditResult.value);
    this.logger.log({
      event: WalletEvent.CREDIT_PERSISTED,
      walletId: creditResult.value.id,
    });

    return ok({
      walletId: creditResult.value.id,
      balance: creditResult.value.balance,
    });
  }
}
