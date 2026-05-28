export type LockUsingErrorCode = 'LOCK_NOT_ACQUIRED';

export const isLockUsingError = (error: unknown): error is LockUsingErrorCode =>
  error === 'LOCK_NOT_ACQUIRED';
