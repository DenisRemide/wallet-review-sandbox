import { Injectable } from '@nestjs/common';
import { err, Result } from 'neverthrow';
import { LockUsingErrorCode } from './lock.errors';

// In-process stand-in for the production RedlockService. Serialises critical
// sections by key so that two concurrent non-idempotent operations on the same
// resource cannot interleave their read-modify-write. The contract mirrors
// RedlockService.using: the routine must return a Result, never throw.
@Injectable()
export class LockService {
  private readonly tails = new Map<string, Promise<void>>();

  async using<T, E>(
    keys: string[],
    routine: () => Promise<Result<T, E>>,
  ): Promise<Result<T, E | LockUsingErrorCode>> {
    const key = [...keys].sort().join('|');
    const previous = this.tails.get(key) ?? Promise.resolve();

    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.tails.set(
      key,
      previous.then(() => current),
    );

    await previous;
    try {
      return await routine();
    } catch {
      return err('LOCK_NOT_ACQUIRED');
    } finally {
      release();
    }
  }
}
