import { LockUsingErrorCode } from '../../../../lib/concurrency/lock.errors';
import {
  WalletRepositoryFindErrorCode,
  WalletRepositorySetBalanceErrorCode,
} from '../../infrastructure/repositories/wallet/wallet.repository.errors';

export type CreditWalletErrorCode =
  | WalletRepositoryFindErrorCode
  | WalletRepositorySetBalanceErrorCode
  | LockUsingErrorCode
  | 'CREDIT_WALLET_NOT_FOUND'
  | 'CREDIT_WALLET_FORBIDDEN'
  | 'CREDIT_WALLET_INVALID_AMOUNT';
