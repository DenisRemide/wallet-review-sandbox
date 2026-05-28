import { Money } from '../../../lib/money/money';
import { Currency } from './currency';

export type Wallet = {
  id: string;
  partnerId: string;
  currency: Currency;
  balance: Money;
  createdAt: Date;
  updatedAt: Date;
};
