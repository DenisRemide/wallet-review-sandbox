import { Module } from '@nestjs/common';
import { PartnerModule } from '../partner/partner.module';
import { GetWalletBalanceModule } from './use-case/get-wallet-balance/get-wallet-balance.module';
import { CreditWalletModule } from './use-case/credit-wallet/credit-wallet.module';
import { ListWalletTransactionsModule } from './use-case/list-wallet-transactions/list-wallet-transactions.module';
import { WalletPresentationController } from './presentation/wallet-presentation.controller';
import { WalletPresentationService } from './presentation/wallet-presentation.service';

@Module({
  imports: [
    PartnerModule,
    GetWalletBalanceModule,
    CreditWalletModule,
    ListWalletTransactionsModule,
  ],
  controllers: [WalletPresentationController],
  providers: [WalletPresentationService],
})
export class WalletModule {}
