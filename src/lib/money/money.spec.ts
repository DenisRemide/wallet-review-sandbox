import {
  addMoney,
  compareMoney,
  formatMoney,
  isGreaterThanOrEqual,
  isLessThan,
  subtractMoney,
} from './money';

describe('money', () => {
  it('adds without floating point drift', () => {
    expect(addMoney('0.1', '0.2')).toBe('0.3');
  });

  it('subtracts to a negative value', () => {
    expect(subtractMoney('10.00', '12.50')).toBe('-2.5');
  });

  it('compares decimal strings', () => {
    expect(compareMoney('10.00', '9.99')).toBe(1);
    expect(compareMoney('10', '10.00')).toBe(0);
    expect(compareMoney('0.01', '0.10')).toBe(-1);
  });

  it('answers ordering questions', () => {
    expect(isGreaterThanOrEqual('5.00', '5')).toBe(true);
    expect(isLessThan('4.99', '5')).toBe(true);
  });

  it('formats to two fraction digits', () => {
    expect(formatMoney('1.005')).toBe('1.01');
    expect(formatMoney('7')).toBe('7.00');
  });
});
