// Frozen event taxonomy for the wallet domain (R15 LOG-07). Handlers log
// business phases with these literals, never ad-hoc strings, so log lines stay
// greppable and dashboards stay stable. Naming: <domain>.<subject>.<action>.
export enum WalletEvent {
  CREDIT_RECEIVED = 'wallet.credit.received',
  CREDIT_PERSISTED = 'wallet.credit.persisted',
  CREDIT_FAILED = 'wallet.credit.failed',
  BALANCE_REQUESTED = 'wallet.balance.requested',
}
