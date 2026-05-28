import { LockService } from '../../../../lib/concurrency/lock.service';
import { IdempotencyStore } from '../../../../lib/idempotency/idempotency.store';
import { Wallet } from '../../domain/wallet';
import { WalletRepository } from '../../infrastructure/repositories/wallet/wallet.repository';
import { CreditWalletHandler } from './credit-wallet.handler';

describe('CreditWalletHandler', () => {
  let handler: CreditWalletHandler;
  let repository: WalletRepository;

  beforeEach(() => {
    repository = new WalletRepository();
    handler = new CreditWalletHandler(
      repository,
      new LockService(),
      new IdempotencyStore<Wallet>(),
    );
  });

  it('credits the wallet using decimal-safe arithmetic', async () => {
    const first = await handler.run({
      walletId: 'wallet-acme-usd',
      partnerId: 'partner-acme',
      amount: '0.10',
      idempotencyKey: 'credit-key-0001',
    });
    expect(first._unsafeUnwrap().balance).toBe('1000.1');

    const second = await handler.run({
      walletId: 'wallet-acme-usd',
      partnerId: 'partner-acme',
      amount: '0.20',
      idempotencyKey: 'credit-key-0002',
    });
    // 0.1 + 0.2 must not drift to 1000.30000000000001
    expect(second._unsafeUnwrap().balance).toBe('1000.3');
  });

  it('is idempotent: a retry with the same key does not double-credit', async () => {
    const params = {
      walletId: 'wallet-acme-usd',
      partnerId: 'partner-acme',
      amount: '50.00',
      idempotencyKey: 'credit-key-dup',
    };

    const first = await handler.run(params);
    const retry = await handler.run(params);

    expect(first._unsafeUnwrap().balance).toBe('1050');
    expect(retry._unsafeUnwrap().balance).toBe('1050');

    const balance = await repository.findById('wallet-acme-usd');
    expect(balance._unsafeUnwrap()?.balance).toBe('1050');
  });

  it('forbids crediting a wallet owned by another partner', async () => {
    const result = await handler.run({
      walletId: 'wallet-acme-usd',
      partnerId: 'partner-globex',
      amount: '10.00',
      idempotencyKey: 'credit-key-forbidden',
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBe('CREDIT_WALLET_FORBIDDEN');
  });

  it('rejects a non-positive amount', async () => {
    const result = await handler.run({
      walletId: 'wallet-acme-usd',
      partnerId: 'partner-acme',
      amount: '0',
      idempotencyKey: 'credit-key-zero',
    });

    expect(result._unsafeUnwrapErr()).toBe('CREDIT_WALLET_INVALID_AMOUNT');
  });
});
