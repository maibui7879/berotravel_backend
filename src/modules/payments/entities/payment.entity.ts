import { Entity, ObjectIdColumn, Column } from 'typeorm';
import { ObjectId } from 'mongodb';

export enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

export enum PaymentMethod {
  CREDIT_CARD = 'CREDIT_CARD',
  DEBIT_CARD = 'DEBIT_CARD',
  VNPAY = 'VNPAY',
  MOMO = 'MOMO',
  ZALOPAY = 'ZALOPAY',
  BANK_TRANSFER = 'BANK_TRANSFER',
  WALLET = 'WALLET',
}

/**
 * Payment Transaction Entity
 * Records all payment attempts and status changes
 */
@Entity('payments')
export class Payment {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column()
  booking_id: string; // ObjectId reference

  @Column()
  user_id: string; // ObjectId reference

  @Column()
  amount: number; // Số tiền (VND/USD)

  @Column()
  currency: string; // 'VND', 'USD', etc

  @Column()
  payment_method: PaymentMethod;

  @Column()
  gateway: string; // 'STRIPE', 'VNPAY', 'MOMO', 'ZALOPAY'

  @Column()
  status: PaymentStatus;

  @Column({ nullable: true })
  transaction_id: string; // ID từ payment gateway (unique)

  @Column({ nullable: true })
  reference_code: string; // Mã tham chiếu cho việc theo dõi

  @Column({ nullable: true })
  order_info: string; // Thông tin đơn hàng (gửi tới gateway)

  @Column({ nullable: true })
  return_url: string; // URL return sau payment

  @Column({ nullable: true })
  notify_url: string; // Webhook URL

  @Column({ nullable: true })
  payment_url: string; // URL redirect để user thanh toán

  @Column({ type: 'json', nullable: true })
  gateway_response: Record<string, any>; // Response từ payment gateway

  @Column({ nullable: true })
  error_message: string;

  @Column({ nullable: true })
  error_code: string;

  @Column()
  created_at: Date;

  @Column({ nullable: true })
  completed_at: Date;

  @Column()
  updated_at: Date;

  @Column({ default: null })
  deleted_at?: Date;
}

/**
 * Payout Entity
 * Records payouts to merchants
 */
@Entity('payouts')
export class Payout {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column()
  merchant_id: string; // Place owner user_id

  @Column()
  period_start: Date; // Kỳ thanh toán bắt đầu

  @Column()
  period_end: Date; // Kỳ thanh toán kết thúc

  @Column()
  total_revenue: number; // Tổng doanh thu từ bookings

  @Column()
  commission_rate: number; // % commission (e.g., 0.15 = 15%)

  @Column()
  commission_amount: number; // Số tiền commission Bero lấy

  @Column()
  payout_amount: number; // Số tiền merchant nhận

  @Column()
  status: 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

  @Column({ nullable: true })
  payout_method: string; // 'BANK_TRANSFER', 'WALLET', etc

  @Column({ nullable: true })
  bank_account: string; // XXXX...XXXX (masked)

  @Column({ nullable: true })
  transaction_id: string; // ID từ payment provider

  @Column({ type: 'json', nullable: true })
  bookings: Array<{
    booking_id: string;
    amount: number;
    payment_date: Date;
  }>;

  @Column()
  created_at: Date;

  @Column({ nullable: true })
  completed_at: Date;

  @Column()
  updated_at: Date;
}

/**
 * Refund Entity
 * Tracks refund requests and processing
 */
@Entity('refunds')
export class Refund {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column()
  payment_id: string; // Reference to Payment

  @Column()
  booking_id: string; // Reference to Booking

  @Column()
  user_id: string;

  @Column()
  amount: number;

  @Column()
  reason: string;

  @Column()
  status: 'REQUESTED' | 'APPROVED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED';

  @Column({ nullable: true })
  approved_by: string; // Admin user_id

  @Column({ nullable: true })
  rejection_reason: string;

  @Column({ nullable: true })
  refund_transaction_id: string; // ID from payment provider

  @Column()
  created_at: Date;

  @Column({ nullable: true })
  completed_at: Date;

  @Column()
  updated_at: Date;
}
