import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

@ApiSchema({ name: 'DebitWalletRequest' })
export class DebitWalletDtoReq {
  @ApiProperty({ example: '25.00', description: 'Decimal amount to withdraw' })
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'amount must be a decimal with up to 2 fraction digits',
  })
  amount: string;

  @ApiProperty({ example: 'debit-2026-10-25-001' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  idempotencyKey: string;
}

@ApiSchema({ name: 'DebitWalletResponse' })
export class DebitWalletDtoRes {
  @ApiProperty({ example: 'wallet-acme-usd' })
  walletId: string;

  @ApiProperty({ example: '975.00' })
  balance: string;
}
