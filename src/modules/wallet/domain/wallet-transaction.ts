import { Money } from '../../../lib/money/money';

export enum WalletTransactionKind {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
}

export type WalletTransaction = {
  id: string;
  walletId: string;
  kind: WalletTransactionKind;
  amount: Money;
  createdAt: Date;
};
