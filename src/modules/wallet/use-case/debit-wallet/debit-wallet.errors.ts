import { LockUsingErrorCode } from '../../../../lib/concurrency/lock.errors';
import {
  WalletRepositoryFindErrorCode,
  WalletRepositorySetBalanceErrorCode,
} from '../../infrastructure/repositories/wallet/wallet.repository.errors';

export type DebitWalletErrorCode =
  | WalletRepositoryFindErrorCode
  | WalletRepositorySetBalanceErrorCode
  | LockUsingErrorCode
  | 'DEBIT_WALLET_NOT_FOUND'
  | 'DEBIT_WALLET_FORBIDDEN'
  | 'DEBIT_WALLET_INSUFFICIENT_FUNDS';
