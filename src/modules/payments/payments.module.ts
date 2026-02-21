import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

import { PaymentsController } from './payments.controller';
import { PaymentService } from './services/payment.service';
import { VnpayService } from './services/vnpay.service';
import { MomoService } from './services/momo.service';
import { ZalopayService } from './services/zalopay.service';
import { PayoutService } from './services/payout.service';
import { Payment, Payout, Refund } from './entities/payment.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Payment, Payout, Refund]),
  ],
  controllers: [PaymentsController],
  providers: [PaymentService, VnpayService, MomoService, ZalopayService, PayoutService],
  exports: [PaymentService, VnpayService, MomoService, ZalopayService, PayoutService],
})
export class PaymentsModule {}
