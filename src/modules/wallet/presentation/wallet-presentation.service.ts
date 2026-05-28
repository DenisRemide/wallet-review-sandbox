import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { GetWalletBalanceHandler } from '../use-case/get-wallet-balance/get-wallet-balance.handler';
import { CreditWalletHandler } from '../use-case/credit-wallet/credit-wallet.handler';
import { GetWalletBalanceDtoRes } from './dto/get-wallet-balance.dto';
import {
  CreditWalletDtoReq,
  CreditWalletDtoRes,
} from './dto/credit-wallet.dto';

@Injectable()
export class WalletPresentationService {
  constructor(
    private readonly getWalletBalanceHandler: GetWalletBalanceHandler,
    private readonly creditWalletHandler: CreditWalletHandler,
  ) {}

  async getBalance(
    partnerId: string,
    walletId: string,
  ): Promise<GetWalletBalanceDtoRes> {
    const result = await this.getWalletBalanceHandler.run({
      walletId,
      partnerId,
    });
    if (result.isErr()) {
      throw this.toHttpException(result.error);
    }

    return result.value;
  }

  async creditWallet(
    partnerId: string,
    walletId: string,
    dto: CreditWalletDtoReq,
  ): Promise<CreditWalletDtoRes> {
    const result = await this.creditWalletHandler.run({
      walletId,
      partnerId,
      amount: dto.amount,
      idempotencyKey: dto.idempotencyKey,
    });
    if (result.isErr()) {
      throw this.toHttpException(result.error);
    }

    return {
      walletId: result.value.walletId,
      balance: result.value.balance,
    };
  }

  private toHttpException(errorCode: string): HttpException {
    if (errorCode.endsWith('_NOT_FOUND')) {
      return new NotFoundException(errorCode);
    }
    if (errorCode.endsWith('_FORBIDDEN')) {
      return new ForbiddenException(errorCode);
    }
    if (
      errorCode.endsWith('_DB_ERROR') ||
      errorCode.endsWith('_TARGET_MISSING') ||
      errorCode === 'LOCK_NOT_ACQUIRED'
    ) {
      return new InternalServerErrorException();
    }

    return new BadRequestException(errorCode);
  }
}
