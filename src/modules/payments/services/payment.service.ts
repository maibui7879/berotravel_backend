import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ObjectId } from 'mongodb';

import { Payment, PaymentStatus, PaymentMethod, Payout, Refund } from '../entities/payment.entity';
import {
  InitiatePaymentDto,
  PaymentCallbackDto,
  CreatePaymentIntentDto,
  PaymentResponseDto,
} from '../dto/payment.dto';
import Stripe from 'stripe';
import { VnpayService } from './vnpay.service';
import { MomoService } from './momo.service';
import { ZalopayService } from './zalopay.service';

/**
 * Payment Service
 * 
 * Handles:
 * - Payment gateway integration (Stripe, VNPay, MoMo, ZaloPay)
 * - Payment status tracking
 * - Webhook handling
 * - Commission & payout calculation
 */
@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private stripe: Stripe;

  // Configuration
  private readonly COMMISSION_RATE = 0.15; // 15% commission
  private readonly SUPPORTED_GATEWAYS = ['STRIPE', 'VNPAY', 'MOMO', 'ZALOPAY'];

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: MongoRepository<Payment>,
    @InjectRepository(Payout)
    private readonly payoutRepo: MongoRepository<Payout>,
    @InjectRepository(Refund)
    private readonly refundRepo: MongoRepository<Refund>,
    private configService: ConfigService,
    private vnpayService: VnpayService,
    private momoService: MomoService,
    private zalopayService: ZalopayService,
  ) {
    // Initialize Stripe
    const stripeKey = this.configService.get('STRIPE_SECRET_KEY');
    if (stripeKey) {
      this.stripe = new Stripe(stripeKey, {
        apiVersion: '2023-10-16' as any,
      });
    }
  }

  /**
   * Initiate payment - create payment intent tại gateway
   */
  async initiatePayment(
    userId: string,
    dto: InitiatePaymentDto,
  ): Promise<PaymentResponseDto> {
    this.logger.log(`Initiating payment for user ${userId}, booking ${dto.booking_id}`);

    // Validate gateway
    if (!this.SUPPORTED_GATEWAYS.includes(dto.gateway)) {
      throw new BadRequestException(`Gateway ${dto.gateway} not supported`);
    }

    // Create payment record
    const payment = this.paymentRepo.create({
      user_id: userId,
      booking_id: dto.booking_id,
      amount: dto.amount,
      currency: dto.currency,
      payment_method: dto.payment_method,
      gateway: dto.gateway,
      status: PaymentStatus.PENDING,
      order_info: `Booking ${dto.booking_id}`,
      return_url: dto.return_url || this.configService.get('PAYMENT_RETURN_URL'),
      notify_url: this.configService.get('PAYMENT_WEBHOOK_URL'),
      created_at: new Date(),
      updated_at: new Date(),
    });

    await this.paymentRepo.save(payment);

    // Route to appropriate gateway
    switch (dto.gateway.toUpperCase()) {
      case 'STRIPE':
        return this.initiateStripePayment(payment);

      case 'VNPAY':
        return this.initiateVNPayPayment(payment);

      case 'MOMO':
        return this.initiateMoMoPayment(payment);

      case 'ZALOPAY':
        return this.initiateZaloPayPayment(payment);

      default:
        throw new BadRequestException(`Gateway ${dto.gateway} not implemented`);
    }
  }

  /**
   * Handle payment webhook/callback
   */
  async handlePaymentCallback(dto: PaymentCallbackDto): Promise<void> {
    this.logger.log(`Processing payment callback: ${dto.transaction_id}`);

    const payment = await this.paymentRepo.findOne({
      where: { transaction_id: dto.transaction_id } as any,
    });

    if (!payment) {
      this.logger.warn(`Payment not found for transaction ${dto.transaction_id}`);
      throw new NotFoundException('Payment not found');
    }

    // Verify signature (gateway-specific)
    // TODO: Implement signature verification

    // Update payment status based on gateway response
    const isSuccess = this.isPaymentSuccessful(dto, payment.gateway);

    if (isSuccess) {
      payment.status = PaymentStatus.COMPLETED;
      payment.completed_at = new Date();
      this.logger.log(`Payment ${payment._id} marked as COMPLETED`);

      // TODO: Trigger booking confirmation, send email, etc
    } else {
      payment.status = PaymentStatus.FAILED;
      payment.error_message = this.getErrorMessage(dto, payment.gateway);
      payment.error_code = this.getErrorCode(dto, payment.gateway);
      this.logger.error(`Payment ${payment._id} marked as FAILED: ${payment.error_message}`);
    }

    payment.gateway_response = dto as any;
    payment.updated_at = new Date();

    await this.paymentRepo.save(payment);
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    const payment = await this.paymentRepo.findOne({
      where: { _id: new ObjectId(paymentId) } as any,
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return payment.status;
  }

  /**
   * Process refund
   */
  async requestRefund(userId: string, bookingId: string, reason: string): Promise<void> {
    this.logger.log(`User ${userId} requesting refund for booking ${bookingId}`);

    // Find completed payment for this booking
    const payment = await this.paymentRepo.findOne({
      where: {
        booking_id: bookingId,
        status: PaymentStatus.COMPLETED,
      } as any,
    });

    if (!payment) {
      throw new BadRequestException('No completed payment found for this booking');
    }

    // Create refund request
    const refund = this.refundRepo.create({
      payment_id: payment._id.toString(),
      booking_id: bookingId,
      user_id: userId,
      amount: payment.amount,
      reason,
      status: 'REQUESTED',
      created_at: new Date(),
      updated_at: new Date(),
    });

    await this.refundRepo.save(refund);
    this.logger.log(`Refund request created: ${refund._id}`);
  }

  /**
   * Calculate and create payout for merchant
   */
  async calculateMerchantPayout(
    merchantId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<Payout> {
    this.logger.log(`Calculating payout for merchant ${merchantId}`);

    // TODO: Query bookings table and sum revenue for this merchant
    // This assumes you have proper relationships set up
    const totalRevenue = 0; // Placeholder - implement proper calculation

    const commissionAmount = totalRevenue * this.COMMISSION_RATE;
    const payoutAmount = totalRevenue - commissionAmount;

    const payout = this.payoutRepo.create({
      merchant_id: merchantId,
      period_start: periodStart,
      period_end: periodEnd,
      total_revenue: totalRevenue,
      commission_rate: this.COMMISSION_RATE,
      commission_amount: commissionAmount,
      payout_amount: payoutAmount,
      status: 'PENDING',
      created_at: new Date(),
      updated_at: new Date(),
      bookings: [], // TODO: Add booking references
    });

    await this.payoutRepo.save(payout);
    return payout;
  }

  // ============ GATEWAY IMPLEMENTATIONS ============

  private async initiateStripePayment(payment: Payment): Promise<PaymentResponseDto> {
    if (!this.stripe) {
      throw new Error('Stripe not configured');
    }

    try {
      const intent = await this.stripe.paymentIntents.create({
        amount: Math.round(payment.amount * 100), // Convert to cents
        currency: payment.currency.toLowerCase(),
        metadata: {
          booking_id: payment.booking_id,
          user_id: payment.user_id,
          payment_id: payment._id.toString(),
        },
        description: payment.order_info,
      });

      payment.transaction_id = intent.id;
      payment.status = PaymentStatus.PROCESSING;
      await this.paymentRepo.save(payment);

      return {
        payment_id: payment._id.toString(),
        booking_id: payment.booking_id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        gateway: payment.gateway,
        transaction_id: intent.id,
        created_at: payment.created_at,
      };
    } catch (error) {
      this.logger.error('Stripe payment initiation failed:', error);
      payment.status = PaymentStatus.FAILED;
      payment.error_message = error.message;
      await this.paymentRepo.save(payment);
      throw error;
    }
  }

  private async initiateVNPayPayment(payment: Payment): Promise<PaymentResponseDto> {
    try {
      const paymentUrl = this.vnpayService.generatePaymentUrl(
        payment._id.toString(),
        payment.amount,
        payment.order_info,
        payment.return_url,
      );

      payment.status = PaymentStatus.PROCESSING;
      payment.payment_url = paymentUrl;
      await this.paymentRepo.save(payment);

      this.logger.log(`VNPay payment initialized for payment ${payment._id}`);

      return {
        payment_id: payment._id.toString(),
        booking_id: payment.booking_id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        gateway: payment.gateway,
        payment_url: paymentUrl,
        created_at: payment.created_at,
      };
    } catch (error) {
      this.logger.error('VNPay payment initiation failed:', error);
      payment.status = PaymentStatus.FAILED;
      payment.error_message = error.message;
      await this.paymentRepo.save(payment);
      throw error;
    }
  }

  private async initiateMoMoPayment(payment: Payment): Promise<PaymentResponseDto> {
    try {
      const result = await this.momoService.createPaymentRequest(
        payment._id.toString(),
        payment.amount,
        payment.order_info,
        payment.return_url,
        payment.notify_url,
      );

      if (result.responseCode !== '0') {
        throw new Error(`MoMo error: ${result.responseCode}`);
      }

      payment.status = PaymentStatus.PROCESSING;
      payment.transaction_id = result.requestId;
      payment.payment_url = result.payUrl;
      await this.paymentRepo.save(payment);

      this.logger.log(`MoMo payment initialized for payment ${payment._id}`);

      return {
        payment_id: payment._id.toString(),
        booking_id: payment.booking_id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        gateway: payment.gateway,
        payment_url: result.payUrl,
        transaction_id: result.requestId,
        created_at: payment.created_at,
      };
    } catch (error) {
      this.logger.error('MoMo payment initiation failed:', error);
      payment.status = PaymentStatus.FAILED;
      payment.error_message = error.message;
      await this.paymentRepo.save(payment);
      throw error;
    }
  }

  private async initiateZaloPayPayment(payment: Payment): Promise<PaymentResponseDto> {
    try {
      const appTransId = this.zalopayService.generateAppTransId();

      const result = await this.zalopayService.createPaymentRequest(
        appTransId,
        payment.amount,
        payment.order_info,
        payment.return_url,
      );

      if (result.returncode !== 1) {
        throw new Error(`ZaloPay error: ${result.returnmessage}`);
      }

      payment.status = PaymentStatus.PROCESSING;
      payment.transaction_id = appTransId;
      payment.payment_url = result.zalolink;
      await this.paymentRepo.save(payment);

      this.logger.log(`ZaloPay payment initialized for payment ${payment._id}`);

      return {
        payment_id: payment._id.toString(),
        booking_id: payment.booking_id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        gateway: payment.gateway,
        payment_url: result.zalolink,
        transaction_id: appTransId,
        created_at: payment.created_at,
      };
    } catch (error) {
      this.logger.error('ZaloPay payment initiation failed:', error);
      payment.status = PaymentStatus.FAILED;
      payment.error_message = error.message;
      await this.paymentRepo.save(payment);
      throw error;
    }
  }

  // ============ HELPER METHODS ============

  private isPaymentSuccessful(dto: PaymentCallbackDto, gateway: string): boolean {
    if (gateway === 'VNPAY') {
      return dto.response_code === '00'; // VNPay success code
    }

    if (gateway === 'STRIPE') {
      return dto.status === 'succeeded';
    }

    // MoMo & ZaloPay checks
    return dto.response_code === '0' || dto.response_code === '00';
  }

  private getErrorMessage(dto: PaymentCallbackDto, gateway: string): string {
    if (gateway === 'VNPAY') {
      const vnpayErrors: Record<string, string> = {
        '01': 'Bank server is under maintenance',
        '02': 'Invalid payment URL',
        '09': 'Payment session expired',
        '10': 'Card not yet registered',
        '11': 'User has blocked transaction',
        '12': 'Insufficient funds',
      };
      return vnpayErrors[dto.response_code] || 'Unknown error';
    }

    return dto.response_code || 'Payment failed';
  }

  private getErrorCode(dto: PaymentCallbackDto, gateway: string): string {
    return dto.response_code || 'UNKNOWN_ERROR';
  }
}
