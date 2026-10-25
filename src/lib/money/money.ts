import { BigNumber } from 'bignumber.js';

// Money is a fixed-point decimal string (e.g. '100.00'). Never a JS number —
// floating-point arithmetic on balances loses precision and silently corrupts
// ledgers. All arithmetic goes through BigNumber.
export type Money = string;

export const MONEY_SCALE = 2;

const toBig = (value: Money): BigNumber => new BigNumber(value);

export const isValidMoney = (value: string): boolean => {
  const parsed = toBig(value);
  return parsed.isFinite() && parsed.isGreaterThanOrEqualTo(0);
};

export const addMoney = (a: Money, b: Money): Money => toBig(a).plus(b).toFixed();

export const subtractMoney = (a: Money, b: Money): Money =>
  toBig(a).minus(b).toFixed();

export const compareMoney = (a: Money, b: Money): -1 | 0 | 1 => {
  const comparison = toBig(a).comparedTo(b);
  if (comparison === null) {
    throw new Error(`MONEY_COMPARE_INVALID_OPERAND: ${a} vs ${b}`);
  }
  return comparison as -1 | 0 | 1;
};

export const isGreaterThanOrEqual = (a: Money, b: Money): boolean =>
  compareMoney(a, b) >= 0;

export const isLessThan = (a: Money, b: Money): boolean => compareMoney(a, b) < 0;

export const isPositiveMoney = (value: Money): boolean =>
  toBig(value).isGreaterThan(0);

export const formatMoney = (value: Money): Money =>
  toBig(value).toFixed(MONEY_SCALE, BigNumber.ROUND_HALF_UP);
