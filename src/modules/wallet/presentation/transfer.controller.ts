import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../../partner/presentation/api-key.guard';
import { CurrentPartnerId } from '../../partner/presentation/current-partner.decorator';
import {
  CreateTransferHandler,
  CreateTransferResult,
} from '../use-case/create-transfer/create-transfer.handler';
import { CreateTransferDtoReq } from './dto/create-transfer.dto';

@Controller('transfers')
@ApiTags('Transfer')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
export class TransferController {
  constructor(private readonly createTransferHandler: CreateTransferHandler) {}

  @Post()
  @ApiOperation({
    operationId: 'createTransfer',
    summary: 'Move funds between two wallets',
  })
  async createTransfer(
    @CurrentPartnerId() partnerId: string,
    @Body() dto: CreateTransferDtoReq,
  ): Promise<CreateTransferResult> {
    const result = await this.createTransferHandler.run({
      partnerId,
      fromWalletId: dto.fromWalletId,
      toWalletId: dto.toWalletId,
      amount: dto.amount,
      idempotencyKey: dto.idempotencyKey,
    });
    if (result.isErr()) {
      throw new BadRequestException(result.error);
    }

    return result.value;
  }
}
