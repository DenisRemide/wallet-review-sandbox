# Modules & domain (sandbox)

This is a trimmed sandbox. Two bounded contexts exist:

## `partner`

Identity of API consumers. An `ApiKeyGuard` authenticates requests by `x-api-key`
and attaches `partnerId` to the request. `PartnerRegistry` is an in-memory
stand-in for the partner store.

## `wallet`

Owns wallet balances and the operations on them.

- **domain** — `Wallet` (`balance` is a decimal `Money` string), `Currency`.
- **infrastructure/repositories/wallet** — `WalletRepository` (in-memory),
  Result-returning, one error type per method.
- **use-case/get-wallet-balance** — read a wallet the caller owns.
- **use-case/credit-wallet** — top up a wallet; locked + idempotent (reference
  implementation for R05).
- **presentation** — `WalletPresentationController` → `WalletPresentationService`
  → handlers.

Ownership rule: a partner may only read/mutate wallets where
`wallet.partnerId === request.partnerId`.

## Event taxonomy (R15)

Event enums live in `src/infrastructure/logger/`:

- `WalletEvent` — `wallet.credit.received`, `wallet.credit.persisted`,
  `wallet.credit.failed`, `wallet.balance.requested`.

Any new flow adds its own event enum here before logging (R15 LOG-02 / LOG-07).
