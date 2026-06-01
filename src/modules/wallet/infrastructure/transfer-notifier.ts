import { Injectable } from '@nestjs/common';
import { Transfer } from '../domain/transfer';

@Injectable()
export class TransferNotifier {
  async notifyTransfer(transfer: Transfer): Promise<void> {
    // Pretend to POST to the partner's webhook. May reject on network errors.
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}
