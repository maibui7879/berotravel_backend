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
import { ApiBearerAuth, ApiOperation, ApiTags, ApiResponse, ApiBody, ApiParam } from '@nestjs/swagger';
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
    summary: 'Khởi tạo thanh toán cho Booking',
    description: 'Tạo phiên thanh toán mới (Payment Intent) và trả về đường dẫn thanh toán để frontend redirect người dùng tới VNPay, MoMo, Stripe, v.v.',
  })
  @ApiBody({ type: InitiatePaymentDto })
  @ApiResponse({ status: 201, description: 'Khởi tạo thanh toán thành công.', type: PaymentResponseDto })
  @Post('initiate')
  async initiatePayment(
    @GetCurrentUser('sub') userId: string,
    @Body() dto: InitiatePaymentDto,
  ): Promise<PaymentResponseDto> {
    return this.paymentService.initiatePayment(userId, dto);
  }

  /**
   * GET /payments/:paymentId/status
   * Check payment status
   */
  @ApiOperation({
    summary: 'Kiểm tra trạng thái thanh toán',
    description: 'Lấy trạng thái mới nhất của một giao dịch thanh toán cụ thể.',
  })
  @ApiParam({ name: 'paymentId', description: 'Mã Payment ID cần kiểm tra', example: 'pay_123456789' })
  @ApiResponse({ status: 200, description: 'Trả về trạng thái của giao dịch.' })
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
    summary: 'Yêu cầu hoàn tiền (Refund)',
    description: 'Người dùng gửi yêu cầu hoàn tiền cho một booking đã thanh toán thành công.',
  })
  @ApiBody({ type: RefundRequestDto })
  @ApiResponse({ status: 201, description: 'Yêu cầu hoàn tiền đã được ghi nhận thành công.' })
  @ApiResponse({ status: 400, description: 'Lỗi: Booking không đủ điều kiện hoàn tiền.' })
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

  // =================================================================
  // NHÓM API: WEBHOOKS (Dành cho Server của Đối Tác gọi vào)
  // =================================================================

  @ApiOperation({
    summary: 'VNPay Webhook (Hệ thống tự động gọi)',
    description: 'Endpoint nhận dữ liệu trả về từ hệ thống VNPay sau khi người dùng thanh toán xong.',
  })
  @ApiResponse({ status: 200, description: 'Webhook xử lý thành công.' })
  @Post('webhook/vnpay')
  async vnpayWebhook(@Query() query: any): Promise<{ message: string }> {
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

  @ApiOperation({
    summary: 'Stripe Webhook (Hệ thống tự động gọi)',
    description: 'Endpoint nhận dữ liệu trả về từ hệ thống Stripe events.',
  })
  @ApiResponse({ status: 200, description: 'Webhook xử lý thành công.' })
  @Post('webhook/stripe')
  async stripeWebhook(@Body() event: any): Promise<{ received: boolean }> {
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

  @ApiOperation({
    summary: 'MoMo Webhook (Hệ thống tự động gọi)',
    description: 'Endpoint nhận dữ liệu trả về từ hệ thống ví MoMo.',
  })
  @ApiResponse({ status: 200, description: 'Webhook xử lý thành công.' })
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

  @ApiOperation({
    summary: 'ZaloPay Webhook (Hệ thống tự động gọi)',
    description: 'Endpoint nhận sự kiện thanh toán từ hệ thống ZaloPay.',
  })
  @ApiResponse({ status: 200, description: 'Webhook xử lý thành công.' })
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