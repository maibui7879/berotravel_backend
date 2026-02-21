import { IsString, IsNumber, IsEnum, IsOptional, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, PaymentStatus } from '../entities/payment.entity';

/**
 * DTOs for Payment Operations
 */

export class InitiatePaymentDto {
  @ApiProperty({ description: 'ID của booking cần thanh toán', example: '65b12c3d4f5e6a7b8c9d0e1f' })
  @IsString()
  booking_id: string;

  @ApiProperty({ description: 'Số tiền cần thanh toán', example: 1500000 })
  @IsNumber()
  amount: number;

  @ApiPropertyOptional({ description: 'Loại tiền tệ', default: 'VND', example: 'VND' })
  @IsString()
  @IsOptional()
  currency?: string = 'VND';

  @ApiProperty({ description: 'Phương thức thanh toán', enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  payment_method: PaymentMethod;

  @ApiProperty({ description: 'Cổng thanh toán', enum: ['STRIPE', 'VNPAY', 'MOMO', 'ZALOPAY'], example: 'VNPAY' })
  @IsString()
  gateway: string;

  @ApiPropertyOptional({ description: 'Đường dẫn chuyển hướng sau khi thanh toán thành công/thất bại', example: 'https://berotravel.com/checkout/success' })
  @IsUrl()
  @IsOptional()
  return_url?: string;
}

export class PaymentResponseDto {
  @ApiProperty({ example: 'pay_123456789' })
  payment_id: string;

  @ApiProperty({ example: '65b12c3d4f5e6a7b8c9d0e1f' })
  booking_id: string;

  @ApiProperty({ example: 1500000 })
  amount: number;

  @ApiProperty({ example: 'VND' })
  currency: string;

  @ApiProperty({ enum: PaymentStatus, example: PaymentStatus.PENDING })
  status: PaymentStatus;

  @ApiProperty({ example: 'VNPAY' })
  gateway: string;

  @ApiPropertyOptional({ description: 'Link URL để người dùng mở trang thanh toán', example: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_Amount=1500000...' })
  payment_url?: string;

  @ApiPropertyOptional({ description: 'Mã giao dịch từ đối tác' })
  transaction_id?: string;

  @ApiProperty({ type: Date })
  created_at: Date;
}

export class RefundRequestDto {
  @ApiProperty({ description: 'ID của booking muốn hoàn tiền', example: '65b12c3d4f5e6a7b8c9d0e1f' })
  @IsString()
  booking_id: string;

  @ApiProperty({ description: 'Lý do xin hoàn tiền', example: 'Thay đổi kế hoạch phút chót' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({ description: 'Số tiền muốn hoàn (để trống nếu muốn hoàn toàn bộ)', example: 500000 })
  @IsNumber()
  @IsOptional()
  amount?: number; // Partial refund
}

export class RefundResponseDto {
  @ApiProperty()
  refund_id: string;
  @ApiProperty()
  booking_id: string;
  @ApiProperty()
  payment_id: string;
  @ApiProperty()
  amount: number;
  @ApiProperty()
  status: string;
  @ApiProperty()
  reason: string;
  @ApiProperty()
  created_at: Date;
  @ApiProperty()
  estimated_completion: Date;
}

export class PaymentCallbackDto {
  @ApiProperty()
  @IsString()
  transaction_id: string;

  @ApiProperty()
  @IsString()
  order_info: string;

  @ApiProperty({ enum: ['00', '01', '02', '09', '10', '11', '12'] })
  @IsEnum(['00', '01', '02', '09', '10', '11', '12'])
  response_code: string; 

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  amount?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  order_id?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  bank_code?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  bank_tran_no?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  card_type?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  payment_intent_id?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  charge_id?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  timestamp?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  signature?: string; 
}

export class CreatePaymentIntentDto {
  @ApiProperty()
  @IsString()
  booking_id: string;

  @ApiProperty()
  @IsNumber()
  amount: number;

  @ApiProperty({ enum: ['STRIPE', 'VNPAY', 'MOMO', 'ZALOPAY'] })
  @IsEnum(['STRIPE', 'VNPAY', 'MOMO', 'ZALOPAY'])
  gateway: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  currency?: string = 'VND';

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;
}

export class PayoutCalculationDto {
  @ApiProperty()
  merchant_id: string;
  @ApiProperty()
  period_start: Date;
  @ApiProperty()
  period_end: Date;
  @ApiPropertyOptional()
  commission_rate?: number; 
}

export class PayoutResponseDto {
  @ApiProperty()
  payout_id: string;
  @ApiProperty()
  merchant_id: string;
  @ApiProperty()
  period: any;
  @ApiProperty()
  total_revenue: number;
  @ApiProperty()
  commission_rate: number;
  @ApiProperty()
  commission_amount: number;
  @ApiProperty()
  payout_amount: number;
  @ApiProperty()
  status: string;
  @ApiProperty()
  created_at: Date;
}