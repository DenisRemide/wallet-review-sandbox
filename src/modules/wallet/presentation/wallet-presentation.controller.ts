import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../../partner/presentation/api-key.guard';
import { CurrentPartnerId } from '../../partner/presentation/current-partner.decorator';
import { WalletPresentationService } from './wallet-presentation.service';
import { GetWalletBalanceDtoRes } from './dto/get-wallet-balance.dto';
import {
  CreditWalletDtoReq,
  CreditWalletDtoRes,
} from './dto/credit-wallet.dto';
import { DebitWalletDtoReq, DebitWalletDtoRes } from './dto/debit-wallet.dto';
import { WalletTransactionDtoRes } from './dto/list-wallet-transactions.dto';

@Controller('wallets')
@ApiTags('Wallet')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
export class WalletPresentationController {
  constructor(
    private readonly walletPresentationService: WalletPresentationService,
  ) {}

  @Get(':walletId/balance')
  @ApiResponse({ type: GetWalletBalanceDtoRes })
  @ApiOperation({
    operationId: 'getWalletBalance',
    summary: 'Read the current balance of a wallet owned by the caller',
  })
  async getWalletBalance(
    @CurrentPartnerId() partnerId: string,
    @Param('walletId') walletId: string,
  ): Promise<GetWalletBalanceDtoRes> {
    return this.walletPresentationService.getBalance(partnerId, walletId);
  }

  @Post(':walletId/credit')
  @ApiResponse({ type: CreditWalletDtoRes })
  @ApiOperation({
    operationId: 'creditWallet',
    summary: 'Top up a wallet owned by the caller (idempotent)',
  })
  async creditWallet(
    @CurrentPartnerId() partnerId: string,
    @Param('walletId') walletId: string,
    @Body() dto: CreditWalletDtoReq,
  ): Promise<CreditWalletDtoRes> {
    return this.walletPresentationService.creditWallet(
      partnerId,
      walletId,
      dto,
    );
  }

  @Get(':walletId/transactions')
  @ApiResponse({ type: [WalletTransactionDtoRes] })
  @ApiOperation({
    operationId: 'listWalletTransactions',
    summary: 'List the latest transactions of a wallet',
  })
  async listWalletTransactions(
    @CurrentPartnerId() partnerId: string,
    @Param('walletId') walletId: string,
    @Query('limit') limit?: string,
  ): Promise<WalletTransactionDtoRes[]> {
    return this.walletPresentationService.listTransactions(
      partnerId,
      walletId,
      limit,
    );
  }

  @Post(':walletId/debit')
  @ApiResponse({ type: DebitWalletDtoRes })
  @ApiOperation({
    operationId: 'debitWallet',
    summary: 'Withdraw funds from a wallet owned by the caller',
  })
  async debitWallet(
    @CurrentPartnerId() partnerId: string,
    @Param('walletId') walletId: string,
    @Body() dto: DebitWalletDtoReq,
  ): Promise<DebitWalletDtoRes> {
    return this.walletPresentationService.debitWallet(
      partnerId,
      walletId,
      dto,
    );
  }
}
