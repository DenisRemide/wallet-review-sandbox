import { Injectable } from '@nestjs/common';

// In-process idempotency ledger. Production backs this with Redis/Postgres, but
// the contract is the same: a non-idempotent operation records its result under
// the caller-supplied idempotency key, so a retry returns the original outcome
// instead of executing the side-effect twice.
@Injectable()
export class IdempotencyStore<T = unknown> {
  private readonly entries = new Map<string, T>();

  get(key: string): T | undefined {
    return this.entries.get(key);
  }

  remember(key: string, value: T): void {
    this.entries.set(key, value);
  }
}
