import { WalletRepositoryFindErrorCode } from '../../infrastructure/repositories/wallet/wallet.repository.errors';

export type GetWalletBalanceErrorCode =
  | WalletRepositoryFindErrorCode
  | 'GET_WALLET_BALANCE_NOT_FOUND'
  | 'GET_WALLET_BALANCE_FORBIDDEN';
