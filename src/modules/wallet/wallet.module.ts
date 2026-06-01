import { Module } from '@nestjs/common';
import { PartnerModule } from '../partner/partner.module';
import { GetWalletBalanceModule } from './use-case/get-wallet-balance/get-wallet-balance.module';
import { CreditWalletModule } from './use-case/credit-wallet/credit-wallet.module';
import { CreateTransferModule } from './use-case/create-transfer/create-transfer.module';
import { WalletPresentationController } from './presentation/wallet-presentation.controller';
import { WalletPresentationService } from './presentation/wallet-presentation.service';
import { TransferController } from './presentation/transfer.controller';

@Module({
  imports: [
    PartnerModule,
    GetWalletBalanceModule,
    CreditWalletModule,
    CreateTransferModule,
  ],
  controllers: [WalletPresentationController, TransferController],
  providers: [WalletPresentationService],
})
export class WalletModule {}
