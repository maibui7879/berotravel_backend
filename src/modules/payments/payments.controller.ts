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
  PaymentResponseDto,
  RefundRequestDto,
} from './dto/payment.dto';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * Khởi tạo thanh toán
   */
  @UseGuards(AtGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Khởi tạo thanh toán cho Booking',
    description: 'Tạo phiên thanh toán mới và trả về đường dẫn redirect đến cổng thanh toán.',
  })
  @ApiBody({ type: InitiatePaymentDto })
  @ApiResponse({ status: 201, description: 'Khởi tạo thành công.', type: PaymentResponseDto })
  @Post('initiate')
  async initiatePayment(
    @GetCurrentUser('sub') userId: string,
    @Body() dto: InitiatePaymentDto,
  ): Promise<PaymentResponseDto> {
    return this.paymentService.initiatePayment(userId, dto);
  }

  /**
   * Kiểm tra trạng thái giao dịch
   */
  @ApiOperation({
    summary: 'Kiểm tra trạng thái thanh toán',
  })
  @ApiParam({ name: 'paymentId', example: '5f9b3b...' })
  @Get(':paymentId/status')
  async getPaymentStatus(@Param('paymentId') paymentId: string) {
    const status = await this.paymentService.getPaymentStatus(paymentId);
    return { payment_id: paymentId, status };
  }

  /**
   * Yêu cầu hoàn tiền
   */
  @UseGuards(AtGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Yêu cầu hoàn tiền (Refund)',
  })
  @ApiBody({ type: RefundRequestDto })
  @Post('refund')
  async requestRefund(
    @GetCurrentUser('sub') userId: string,
    @Body() dto: RefundRequestDto,
  ): Promise<{ message: string }> {
    try {
      await this.paymentService.requestRefund(userId, dto.booking_id, dto.reason);
      return { message: 'Yêu cầu hoàn tiền đã được tiếp nhận.' };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  // =================================================================
  // UNIVERSAL WEBHOOK HANDLER
  // =================================================================
  @ApiOperation({
    summary: 'Universal Webhook Endpoint',
    description: 'Hệ thống tự động phân loại và nhận sự kiện từ các cổng thanh toán.',
  })
  @ApiResponse({ status: 200, description: 'Webhook xử lý thành công.' })
  @Post('webhook/:gateway')
  async handleWebhook(
    @Param('gateway') gateway: string,
    @Body() body: any,
    @Query() query: any
  ): Promise<{ success: boolean; message?: string }> {
    // VNPay thường bắn qua Query, MoMo/ZaloPay/Stripe bắn qua Body
    const payload = Object.keys(body).length > 0 ? body : query;
    
    try {
      await this.paymentService.handlePaymentCallback(gateway.toUpperCase(), payload);
      return { success: true };
    } catch (error) {
      // Luôn trả về 200 cho Gateway để tránh bị gọi lại (retry loop), 
      // Nhưng log lỗi ra hệ thống để Admin xử lý
      console.error(`[WEBHOOK ERROR - ${gateway.toUpperCase()}]`, error.message);
      return { success: false, message: error.message };
    }
  }
}