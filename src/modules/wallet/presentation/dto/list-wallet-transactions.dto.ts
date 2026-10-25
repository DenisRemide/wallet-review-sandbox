import { ApiProperty, ApiSchema } from '@nestjs/swagger';

@ApiSchema({ name: 'WalletTransaction' })
export class WalletTransactionDtoRes {
  @ApiProperty({ example: 'tx-0001' })
  id: string;

  @ApiProperty({ example: 'CREDIT', enum: ['CREDIT', 'DEBIT'] })
  kind: string;

  @ApiProperty({ example: '1000.00' })
  amount: string;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt: string;
}
