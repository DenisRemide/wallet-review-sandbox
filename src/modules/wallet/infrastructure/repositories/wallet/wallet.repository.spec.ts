import { WalletRepository } from './wallet.repository';

describe('WalletRepository', () => {
  let repository: WalletRepository;

  beforeEach(() => {
    repository = new WalletRepository();
  });

  it('returns a seeded wallet by id', async () => {
    const result = await repository.findById('wallet-acme-usd');

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      id: 'wallet-acme-usd',
      partnerId: 'partner-acme',
      balance: '1000.00',
    });
  });

  it('returns undefined for an unknown wallet', async () => {
    const result = await repository.findById('wallet-unknown');

    expect(result._unsafeUnwrap()).toBeUndefined();
  });

  it('updates the balance immutably', async () => {
    const result = await repository.setBalance('wallet-acme-usd', '1234.56');

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().balance).toBe('1234.56');
  });

  it('reports a missing target on update of an unknown wallet', async () => {
    const result = await repository.setBalance('wallet-unknown', '1.00');

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBe('SET_BALANCE_WALLET_TARGET_MISSING');
  });
});
