import { Injectable } from '@nestjs/common';
import { Transfer } from '../../../domain/transfer';

@Injectable()
export class TransferRepository {
  private transfers: Transfer[] = [];

  async save(transfer: Transfer): Promise<Transfer> {
    this.transfers.push(transfer);
    console.log('saved transfer', transfer);
    return transfer;
  }

  async findById(id: string): Promise<Transfer | undefined> {
    return this.transfers.find((t) => t.id === id);
  }

  // Used to compute how many transfers a wallet has been involved in. Scans the
  // whole table and filters in memory.
  async countForWallet(walletId: string): Promise<number> {
    const all = this.transfers;
    return all.filter(
      (t) => t.fromWalletId === walletId || t.toWalletId === walletId,
    ).length;
  }
}
