import { IsString, IsNumber, IsEnum, IsOptional, IsUrl } from 'class-validator';
import { PaymentMethod, PaymentStatus } from '../entities/payment.entity';

/**
 * DTOs for Payment Operations
 */

export class InitiatePaymentDto {
  @IsString()
  booking_id: string;

  @IsNumber()
  amount: number;

  @IsString()
  @IsOptional()
  currency?: string = 'VND';

  @IsEnum(PaymentMethod)
  payment_method: PaymentMethod;

  @IsString()
  gateway: string; // 'STRIPE', 'VNPAY', 'MOMO', 'ZALOPAY'

  @IsUrl()
  @IsOptional()
  return_url?: string;
}

export class PaymentCallbackDto {
  @IsString()
  transaction_id: string;

  @IsString()
  order_info: string;

  @IsEnum(['00', '01', '02', '09', '10', '11', '12'])
  response_code: string; // VNPay response codes

  @IsNumber()
  @IsOptional()
  amount?: number;

  @IsString()
  @IsOptional()
  order_id?: string;

  @IsString()
  @IsOptional()
  bank_code?: string;

  @IsString()
  @IsOptional()
  bank_tran_no?: string;

  @IsString()
  @IsOptional()
  card_type?: string;

  // Stripe callback fields
  @IsString()
  @IsOptional()
  payment_intent_id?: string;

  @IsString()
  @IsOptional()
  charge_id?: string;

  @IsString()
  @IsOptional()
  status?: string;

  // Generic fields
  @IsNumber()
  @IsOptional()
  timestamp?: number;

  @IsString()
  @IsOptional()
  signature?: string; // For webhook verification
}

export class CreatePaymentIntentDto {
  @IsString()
  booking_id: string;

  @IsNumber()
  amount: number;

  @IsEnum(['STRIPE', 'VNPAY', 'MOMO', 'ZALOPAY'])
  gateway: string;

  @IsString()
  @IsOptional()
  currency?: string = 'VND';

  @IsString()
  @IsOptional()
  description?: string;
}

export class PaymentResponseDto {
  payment_id: string;
  booking_id: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  gateway: string;
  payment_url?: string; // For redirect payments
  transaction_id?: string;
  created_at: Date;
}

export class PayoutCalculationDto {
  merchant_id: string;
  period_start: Date;
  period_end: Date;
  commission_rate?: number; // Default 15%
}

export class PayoutResponseDto {
  payout_id: string;
  merchant_id: string;
  period: {
    start: Date;
    end: Date;
  };
  total_revenue: number;
  commission_rate: number;
  commission_amount: number;
  payout_amount: number;
  status: string;
  created_at: Date;
}

export class RefundRequestDto {
  @IsString()
  booking_id: string;

  @IsString()
  reason: string;

  @IsNumber()
  @IsOptional()
  amount?: number; // Partial refund
}

export class RefundResponseDto {
  refund_id: string;
  booking_id: string;
  payment_id: string;
  amount: number;
  status: string;
  reason: string;
  created_at: Date;
  estimated_completion: Date;
}
