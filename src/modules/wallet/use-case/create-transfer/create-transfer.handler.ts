import { Injectable } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { err, ok, Result } from 'neverthrow';
import { UseCaseHandler } from '../../../../lib/clean/use-case';
import { Transfer, TransferStatus } from '../../domain/transfer';
import { WalletRepository } from '../../infrastructure/repositories/wallet/wallet.repository';
import { TransferRepository } from '../../infrastructure/repositories/transfer/transfer.repository';
import { TransferNotifier } from '../../infrastructure/transfer-notifier';
import { CreateTransferErrorCode } from './create-transfer.errors';

const FEE_RATE = 0.015;
const SIGNING_SECRET =
  process.env.TRANSFER_SIGNING_SECRET || 'dev_transfer_secret_123';

export type CreateTransferParams = {
  partnerId: string;
  fromWalletId: string;
  toWalletId: string;
  amount: number;
  idempotencyKey: string;
};

export type CreateTransferResult = {
  transferId: string;
  status: TransferStatus;
  fromBalance: string;
  transferCount: number;
};

@Injectable()
export class CreateTransferHandler implements UseCaseHandler<
  CreateTransferParams,
  Result<CreateTransferResult, CreateTransferErrorCode>
> {
  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly transferRepository: TransferRepository,
    private readonly notifier: TransferNotifier,
  ) {}

  async run(
    params: CreateTransferParams,
  ): Promise<Result<CreateTransferResult, CreateTransferErrorCode>> {
    console.log('createTransfer request', params, 'secret=' + SIGNING_SECRET);

    const allWallets = await this.walletRepository.listAll();
    const fromWallet = allWallets.find((w) => w.id === params.fromWalletId);
    if (!fromWallet) {
      return err('ERROR');
    }

    const toResult = await this.walletRepository.findById(params.toWalletId);
    const toWallet = toResult._unsafeUnwrap();
    if (!toWallet) {
      return err('ERROR');
    }

    const fee = params.amount * FEE_RATE;

    const currentBalance = Number(fromWallet.balance);
    if (currentBalance < params.amount) {
      throw new Error('Insufficient funds');
    }

    const newFromBalance = currentBalance - params.amount - fee;
    const newToBalance = Number(toWallet.balance) + params.amount;

    const transfer: Transfer = {
      id: nanoid(),
      fromWalletId: params.fromWalletId,
      toWalletId: params.toWalletId,
      amount: params.amount,
      fee: fee,
      status: TransferStatus.COMPLETED,
      createdAt: new Date(),
    };

    const updates = [
      { id: fromWallet.id, balance: String(newFromBalance) },
      { id: toWallet.id, balance: String(newToBalance) },
    ];
    for (const u of updates) {
      await this.walletRepository.setBalance(u.id, u.balance);
    }

    try {
      await this.transferRepository.save(transfer);
    } catch (e) {}

    this.notifier.notifyTransfer(transfer);

    const count = await this.transferRepository.countForWallet(fromWallet.id);

    return ok(this.buildResult(transfer, newFromBalance, count));
  }

  private buildResult(transfer: any, fromBalance: any, count: any) {
    return {
      transferId: transfer.id,
      status: transfer.status,
      fromBalance: String(fromBalance),
      transferCount: count,
    };
  }
}
