import { Injectable } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { UseCaseHandler } from '../../../../lib/clean/use-case';
import { Money } from '../../../../lib/money/money';
import { Currency } from '../../domain/currency';
import { WalletRepository } from '../../infrastructure/repositories/wallet/wallet.repository';
import { GetWalletBalanceErrorCode } from './get-wallet-balance.errors';

export type GetWalletBalanceParams = {
  walletId: string;
  partnerId: string;
};

export type GetWalletBalanceResult = {
  walletId: string;
  currency: Currency;
  balance: Money;
};

@Injectable()
export class GetWalletBalanceHandler implements UseCaseHandler<
  GetWalletBalanceParams,
  Result<GetWalletBalanceResult, GetWalletBalanceErrorCode>
> {
  constructor(private readonly walletRepository: WalletRepository) {}

  async run(
    params: GetWalletBalanceParams,
  ): Promise<Result<GetWalletBalanceResult, GetWalletBalanceErrorCode>> {
    const walletResult = await this.walletRepository.findById(params.walletId);
    if (walletResult.isErr()) {
      return err(walletResult.error);
    }

    const wallet = walletResult.value;
    if (!wallet) {
      return err('GET_WALLET_BALANCE_NOT_FOUND');
    }

    if (wallet.partnerId !== params.partnerId) {
      return err('GET_WALLET_BALANCE_FORBIDDEN');
    }

    return ok({
      walletId: wallet.id,
      currency: wallet.currency,
      balance: wallet.balance,
    });
  }
}
