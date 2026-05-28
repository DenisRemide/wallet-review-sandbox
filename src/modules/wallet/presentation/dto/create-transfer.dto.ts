import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { IsNumber, IsString } from 'class-validator';

@ApiSchema({ name: 'CreateTransferRequest' })
export class CreateTransferDtoReq {
  @ApiProperty({ example: 'wallet-acme-usd' })
  @IsString()
  fromWalletId: string;

  @ApiProperty({ example: 'wallet-globex-usd' })
  @IsString()
  toWalletId: string;

  @ApiProperty({ example: 100 })
  @IsNumber()
  amount: number;

  @ApiProperty({ example: 'transfer-001' })
  @IsString()
  idempotencyKey: string;
}
