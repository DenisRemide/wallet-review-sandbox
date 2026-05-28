import { Injectable } from '@nestjs/common';
import { Partner } from '../domain/partner';

// Demo fixtures. In production partners are issued opaque API keys stored hashed
// in the database; this in-memory registry only exists so the sandbox runs
// without external infrastructure.
const SEED_PARTNERS: readonly Partner[] = [
  { id: 'partner-acme', name: 'Acme Pay', apiKey: 'demo-key-acme' },
  { id: 'partner-globex', name: 'Globex Wallet', apiKey: 'demo-key-globex' },
];

@Injectable()
export class PartnerRegistry {
  private readonly byApiKey = new Map<string, Partner>(
    SEED_PARTNERS.map((partner) => [partner.apiKey, partner]),
  );

  findByApiKey(apiKey: string): Partner | undefined {
    return this.byApiKey.get(apiKey);
  }
}
