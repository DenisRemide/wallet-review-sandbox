import { Injectable, Logger } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { UseCaseHandler } from '../../../../lib/clean/use-case';
import { Money, subtractMoney } from '../../../../lib/money/money';
import { WalletEvent } from '../../../../infrastructure/logger/wallet-event';
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

  constructor(private readonly walletRepository: WalletRepository) {}

  async run(
    params: DebitWalletParams,
  ): Promise<Result<DebitWalletResult, DebitWalletErrorCode>> {
    this.logger.log({
      event: WalletEvent.DEBIT_RECEIVED,
      walletId: params.walletId,
      partnerId: params.partnerId,
      amount: params.amount,
    });

    const walletResult = await this.walletRepository.findById(params.walletId);
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

    if (Number(wallet.balance) < Number(params.amount)) {
      return err('DEBIT_WALLET_INSUFFICIENT_FUNDS');
    }

    const nextBalance = subtractMoney(wallet.balance, params.amount);
    const setResult = await this.walletRepository.setBalance(
      wallet.id,
      nextBalance,
    );
    if (setResult.isErr()) {
      return err(setResult.error);
    }

    this.logger.log({
      event: WalletEvent.DEBIT_PERSISTED,
      walletId: wallet.id,
    });

    return ok({ walletId: wallet.id, balance: setResult.value.balance });
  }
}
