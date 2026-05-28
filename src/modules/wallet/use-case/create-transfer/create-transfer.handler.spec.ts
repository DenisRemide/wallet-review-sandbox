import { TransferStatus } from '../../domain/transfer';
import { WalletRepository } from '../../infrastructure/repositories/wallet/wallet.repository';
import { TransferRepository } from '../../infrastructure/repositories/transfer/transfer.repository';
import { TransferNotifier } from '../../infrastructure/transfer-notifier';
import { CreateTransferHandler } from './create-transfer.handler';

describe('CreateTransferHandler', () => {
  it('moves funds between two wallets', async () => {
    const handler = new CreateTransferHandler(
      new WalletRepository(),
      new TransferRepository(),
      new TransferNotifier(),
    );

    const result = await handler.run({
      partnerId: 'partner-acme',
      fromWalletId: 'wallet-acme-usd',
      toWalletId: 'wallet-globex-usd',
      amount: 100,
      idempotencyKey: 'transfer-001',
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().status).toBe(TransferStatus.COMPLETED);
    expect(result._unsafeUnwrap().fromBalance).toBe('898.5');
  });
});
