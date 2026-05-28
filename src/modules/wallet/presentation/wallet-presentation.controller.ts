import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
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
}
