import { BigNumber } from 'bignumber.js';

// Money is a fixed-point decimal string (e.g. '100.00'). Never a JS number —
// floating-point arithmetic on balances loses precision and silently corrupts
// ledgers. All arithmetic goes through BigNumber.
export type Money = string;

export const isValidMoney = (value: string): boolean => {
  const parsed = new BigNumber(value);
  return parsed.isFinite() && parsed.isGreaterThanOrEqualTo(0);
};

export const addMoney = (a: Money, b: Money): Money =>
  new BigNumber(a).plus(b).toFixed();

export const subtractMoney = (a: Money, b: Money): Money =>
  new BigNumber(a).minus(b).toFixed();

export const isGreaterThanOrEqual = (a: Money, b: Money): boolean =>
  new BigNumber(a).isGreaterThanOrEqualTo(b);

export const isPositiveMoney = (value: Money): boolean =>
  new BigNumber(value).isGreaterThan(0);
