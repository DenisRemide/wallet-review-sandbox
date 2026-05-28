import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { Currency } from '../../domain/currency';
import { GetWalletBalanceResult } from '../../use-case/get-wallet-balance/get-wallet-balance.handler';

@ApiSchema({ name: 'GetWalletBalanceResponse' })
export class GetWalletBalanceDtoRes implements GetWalletBalanceResult {
  @ApiProperty({ example: 'wallet-acme-usd' })
  walletId: string;

  @ApiProperty({ enum: Currency, example: Currency.USD })
  currency: Currency;

  @ApiProperty({ example: '1000.00' })
  balance: string;
}
