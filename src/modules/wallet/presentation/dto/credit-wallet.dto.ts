import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

@ApiSchema({ name: 'CreditWalletRequest' })
export class CreditWalletDtoReq {
  @ApiProperty({ example: '50.00', description: 'Non-negative decimal amount' })
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message:
      'amount must be a non-negative decimal with up to 2 fraction digits',
  })
  amount: string;

  @ApiProperty({ example: 'credit-2026-05-28-001' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  idempotencyKey: string;
}

@ApiSchema({ name: 'CreditWalletResponse' })
export class CreditWalletDtoRes {
  @ApiProperty({ example: 'wallet-acme-usd' })
  walletId: string;

  @ApiProperty({ example: '1050.00' })
  balance: string;
}
