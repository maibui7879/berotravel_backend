import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  UseGuards,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AtGuard } from '../../common/guards/at.guard';
import { GetCurrentUser } from '../../common/decorators/get-current-user.decorator';
import { PaymentService } from './services/payment.service';
import {
  InitiatePaymentDto,
  PaymentCallbackDto,
  PaymentResponseDto,
  RefundRequestDto,
} from './dto/payment.dto';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * POST /payments/initiate
   * Khởi tạo payment intent tại payment gateway
   */
  @UseGuards(AtGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Initiate payment for a booking',
    description: 'Create payment intent at the selected gateway (Stripe, VNPay, etc.)',
  })
  @Post('initiate')
  async initiatePayment(
    @GetCurrentUser('sub') userId: string,
    @Body() dto: InitiatePaymentDto,
  ): Promise<PaymentResponseDto> {
    return this.paymentService.initiatePayment(userId, dto);
  }

  /**
   * POST /payments/webhook/vnpay
   * VNPay webhook callback
   */
  @ApiOperation({
    summary: 'VNPay payment webhook',
    description: 'Webhook endpoint for VNPay payment status callbacks',
  })
  @Post('webhook/vnpay')
  async vnpayWebhook(@Query() query: any): Promise<{ message: string }> {
    // Convert query string to PaymentCallbackDto
    const dto: PaymentCallbackDto = {
      transaction_id: query.vnp_TransactionNo,
      order_info: query.vnp_OrderInfo,
      response_code: query.vnp_ResponseCode,
      amount: query.vnp_Amount ? Number(query.vnp_Amount) / 100 : 0,
      order_id: query.vnp_TxnRef,
      bank_code: query.vnp_BankCode,
      bank_tran_no: query.vnp_BankTranNo,
      card_type: query.vnp_CardType,
      timestamp: Number(query.vnp_PayDate),
      signature: query.vnp_SecureHash,
    };

    try {
      await this.paymentService.handlePaymentCallback(dto);
      return { message: 'Payment updated' };
    } catch (error) {
      return { message: 'Webhook processing error' };
    }
  }

  /**
   * POST /payments/webhook/stripe
   * Stripe webhook callback
   */
  @ApiOperation({
    summary: 'Stripe webhook',
    description: 'Webhook endpoint for Stripe payment events',
  })
  @Post('webhook/stripe')
  async stripeWebhook(@Body() event: any): Promise<{ received: boolean }> {
    // TODO: Verify Stripe signature
    // TODO: Handle different event types

    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object;
      const dto: PaymentCallbackDto = {
        transaction_id: intent.id,
        order_info: intent.description,
        payment_intent_id: intent.id,
        charge_id: intent.latest_charge,
        status: 'succeeded',
        response_code: '00',
      };

      await this.paymentService.handlePaymentCallback(dto);
    }

    return { received: true };
  }

  /**
   * GET /payments/:paymentId/status
   * Check payment status
   */
  @ApiOperation({
    summary: 'Get payment status',
    description: 'Check the current status of a payment',
  })
  @Get(':paymentId/status')
  async getPaymentStatus(@Param('paymentId') paymentId: string) {
    const status = await this.paymentService.getPaymentStatus(paymentId);
    return { payment_id: paymentId, status };
  }

  /**
   * POST /payments/refund
   * Request refund
   */
  @UseGuards(AtGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Request refund',
    description: 'Request a refund for a completed booking',
  })
  @Post('refund')
  async requestRefund(
    @GetCurrentUser('sub') userId: string,
    @Body() dto: RefundRequestDto,
  ): Promise<{ message: string; refund_id?: string }> {
    try {
      await this.paymentService.requestRefund(userId, dto.booking_id, dto.reason);
      return { message: 'Refund request submitted' };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  /**
   * POST /payments/webhook/momo
   * MoMo wallet webhook callback
   */
  @ApiOperation({
    summary: 'MoMo payment webhook',
    description: 'Webhook endpoint for MoMo wallet payment callbacks',
  })
  @Post('webhook/momo')
  async momoWebhook(@Body() body: any): Promise<{ message: string }> {
    try {
      const dto: PaymentCallbackDto = {
        transaction_id: body.transId,
        order_info: `Booking ${body.orderId}`,
        response_code: body.resultCode === 0 ? '00' : body.resultCode.toString(),
        amount: body.amount,
        order_id: body.orderId,
        timestamp: body.timestamp,
      };

      await this.paymentService.handlePaymentCallback(dto);
      return { message: 'MoMo payment updated' };
    } catch (error) {
      return { message: 'Webhook processing error' };
    }
  }

  /**
   * POST /payments/webhook/zalopay
   * ZaloPay webhook callback
   */
  @ApiOperation({
    summary: 'ZaloPay webhook',
    description: 'Webhook endpoint for ZaloPay payment events',
  })
  @Post('webhook/zalopay')
  async zalopayWebhook(@Body() body: any): Promise<{ message: string }> {
    try {
      const dto: PaymentCallbackDto = {
        transaction_id: body.app_trans_id,
        order_info: `Booking ${body.app_trans_id}`,
        response_code: body.result_code === 1 ? '00' : body.result_code.toString(),
        amount: body.amount,
        order_id: body.app_trans_id,
        timestamp: body.timestamp,
      };

      await this.paymentService.handlePaymentCallback(dto);
      return { message: 'ZaloPay payment updated' };
    } catch (error) {
      return { message: 'Webhook processing error' };
    }
  }
}
