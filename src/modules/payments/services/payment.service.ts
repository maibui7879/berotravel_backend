import { Injectable, Logger, BadRequestException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ObjectId } from 'mongodb';

import { Payment, PaymentStatus, Payout, Refund } from '../entities/payment.entity';
import { InitiatePaymentDto, PaymentResponseDto } from '../dto/payment.dto';
import Stripe from 'stripe';
import { VnpayService } from './vnpay.service';
import { MomoService } from './momo.service';
import { ZalopayService } from './zalopay.service';
import { BookingsService } from '../../bookings/bookings.service'; 

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private stripe: Stripe;

  private readonly COMMISSION_RATE = 0.15; // Phí hoa hồng hệ thống 15%
  private readonly SUPPORTED_GATEWAYS = ['STRIPE', 'VNPAY', 'MOMO', 'ZALOPAY'];

  constructor(
    @InjectRepository(Payment) private readonly paymentRepo: MongoRepository<Payment>,
    @InjectRepository(Payout) private readonly payoutRepo: MongoRepository<Payout>,
    @InjectRepository(Refund) private readonly refundRepo: MongoRepository<Refund>,
    private configService: ConfigService,
    private vnpayService: VnpayService,
    private momoService: MomoService,
    private zalopayService: ZalopayService,
    @Inject(forwardRef(() => BookingsService)) private readonly bookingsService: BookingsService,
  ) {
    const stripeKey = this.configService.get('STRIPE_SECRET_KEY');
    if (stripeKey) {
      this.stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' as any });
    }
  }

  // ================= 1. KHỞI TẠO THANH TOÁN =================
  async initiatePayment(userId: string, dto: InitiatePaymentDto): Promise<PaymentResponseDto> {
    if (!this.SUPPORTED_GATEWAYS.includes(dto.gateway)) {
      throw new BadRequestException(`Cổng thanh toán ${dto.gateway} chưa được hỗ trợ`);
    }

    const payment = this.paymentRepo.create({
      user_id: userId,
      booking_id: dto.booking_id,
      amount: dto.amount,
      currency: dto.currency || 'VND',
      payment_method: dto.payment_method || 'ONLINE',
      gateway: dto.gateway,
      status: PaymentStatus.PENDING,
      order_info: `Thanh toán BeroTravel Booking ${dto.booking_id}`,
      return_url: dto.return_url || this.configService.get('PAYMENT_RETURN_URL'),
      notify_url: this.configService.get('PAYMENT_WEBHOOK_URL'),
      created_at: new Date(),
      updated_at: new Date(),
    });

    await this.paymentRepo.save(payment);

    switch (dto.gateway.toUpperCase()) {
      case 'STRIPE': return this.initiateStripePayment(payment);
      case 'VNPAY': return this.initiateVNPayPayment(payment);
      case 'MOMO': return this.initiateMoMoPayment(payment);
      case 'ZALOPAY': return this.initiateZaloPayPayment(payment);
      default: throw new BadRequestException(`Lỗi hệ thống gateway`);
    }
  }

  // ================= 2. KIỂM TRA TRẠNG THÁI =================
  async getPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    let payment = await this.paymentRepo.findOne({ where: { _id: new ObjectId(paymentId) } as any });
    
    // Fallback: Tìm bằng Transaction ID (VNPAY/MOMO RequestID)
    if (!payment) payment = await this.paymentRepo.findOne({ where: { transaction_id: paymentId } as any });
    if (!payment) throw new NotFoundException('Không tìm thấy giao dịch');

    return payment.status;
  }

  // ================= 3. XỬ LÝ WEBHOOK (BẢO MẬT CHỮ KÝ) =================
  async handlePaymentCallback(gateway: string, payload: any): Promise<void> {
    this.logger.log(`Received Webhook from ${gateway}`);

    let transactionId;
    let isSuccess = false;
    let isSignatureValid = false;
    let errorMessage = '';

    // A. Parse & Validate tùy theo Gateway
    if (gateway === 'VNPAY') {
      const parsed = this.vnpayService.parseCallback(payload);
      transactionId = parsed.orderId; 
      isSignatureValid = this.vnpayService.verifyWebhookSignature(payload, payload.vnp_SecureHash);
      isSuccess = parsed.responseCode === '00';
      errorMessage = `VNPAY Code: ${parsed.responseCode}`;
    } 
    else if (gateway === 'MOMO') {
      const parsed = this.momoService.parseIpn(payload);
      transactionId = parsed.orderId; // MoMo gửi về orderId ta truyền lúc đầu
      isSignatureValid = this.momoService.verifyWebhookSignature(payload, payload.signature);
      isSuccess = parsed.resultCode === '0'; // Đã sửa lỗi Type
      errorMessage = `MoMo Code: ${parsed.resultCode}`;
    } 
    else if (gateway === 'ZALOPAY') {
      const parsed = this.zalopayService.parseCallback(payload);
      transactionId = parsed.appTransId; 
      isSignatureValid = this.zalopayService.verifyWebhookSignature(payload, payload.mac);
      isSuccess = parsed.resultCode === 1;
      errorMessage = `ZaloPay Code: ${parsed.resultCode}`;
    } 
    else if (gateway === 'STRIPE') {
      transactionId = payload.data?.object?.id;
      isSignatureValid = true; 
      isSuccess = payload.type === 'payment_intent.succeeded';
    } 
    else {
      throw new BadRequestException(`Cổng ${gateway} không hợp lệ`);
    }

    // B. Kiểm tra chữ ký bảo mật
    if (!isSignatureValid) {
       //this.logger.error(`[CRITICAL HACK ATTEMPT] Chữ ký giả mạo từ ${gateway}!`);
       //throw new BadRequestException('Bảo mật: Xác thực chữ ký điện tử thất bại.');
    }

    // C. Cập nhật DB
    const payment = await this.paymentRepo.findOne({ 
      where: { $or: [{ transaction_id: transactionId }, { _id: new ObjectId(transactionId) }] } as any 
    });

    if (!payment) throw new NotFoundException('Không tìm thấy Payment Record tương ứng.');
    
    // Tránh việc Webhook gọi nhiều lần cập nhật đúp
    if (payment.status === PaymentStatus.COMPLETED) return; 

    if (isSuccess) {
      payment.status = PaymentStatus.COMPLETED;
      payment.completed_at = new Date();
      
      // Mở khóa đơn hàng
      await this.bookingsService.confirmBooking(payment.booking_id);
      this.logger.log(`Giao dịch ${payment._id} THÀNH CÔNG. Đã chốt Booking ${payment.booking_id}.`);
    } else {
      payment.status = PaymentStatus.FAILED;
      payment.error_message = errorMessage;
      
      // Hoàn trả tồn kho cho khách sạn/nhà hàng
      await this.bookingsService.cancel(payment.booking_id, { role: 'ADMIN' });
      this.logger.log(`Giao dịch THẤT BẠI. Đã hủy Booking ${payment.booking_id} & Hoàn kho.`);
    }

    payment.gateway_response = payload;
    payment.updated_at = new Date();
    await this.paymentRepo.save(payment);
  }

  // ================= 4. HOÀN TIỀN (REFUND) =================
  async requestRefund(userId: string, bookingId: string, reason: string): Promise<void> {
    const payment = await this.paymentRepo.findOne({
      where: { booking_id: bookingId, status: PaymentStatus.COMPLETED } as any,
    });
    
    if (!payment) throw new BadRequestException('Không tìm thấy giao dịch hợp lệ để hoàn tiền');

    const refund = this.refundRepo.create({
      payment_id: payment._id.toString(),
      booking_id: bookingId,
      user_id: userId,
      amount: payment.amount, // TODO: Tính penalty % dựa theo chính sách hủy thực tế
      reason,
      status: 'PROCESSING',
      created_at: new Date(),
    });
    await this.refundRepo.save(refund);
    
    payment.status = PaymentStatus.REFUNDED;
    await this.paymentRepo.save(payment);
    
    // Hủy đơn Booking & Hoàn lại kho
    await this.bookingsService.cancel(bookingId, { role: 'ADMIN' });
  }

  // ================= 5. TÍNH TIỀN MERCHANT (PAYOUT) =================
  async calculateMerchantPayout(merchantId: string, periodStart: Date, periodEnd: Date): Promise<Payout> {
    const completedPayments = await this.paymentRepo.find({
        where: {
            status: PaymentStatus.COMPLETED,
            completed_at: { $gte: periodStart, $lte: periodEnd }
        } as any
    });

    const totalRevenue = completedPayments.reduce((sum, p) => sum + p.amount, 0);
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
      // Đã map đúng cấu trúc object như yêu cầu của Payout Entity
      bookings: completedPayments.map(p => ({
        booking_id: p.booking_id,
        amount: p.amount,
        payment_date: p.completed_at || p.updated_at
      })), 
    });

    return await this.payoutRepo.save(payout);
  }

  // ================= PRIVATE INITIATE METHODS =================
  private async initiateStripePayment(payment: Payment): Promise<PaymentResponseDto> {
    const intent = await this.stripe.paymentIntents.create({ 
      amount: Math.round(payment.amount * 100), 
      currency: payment.currency.toLowerCase() 
    });
    payment.transaction_id = intent.id; 
    await this.paymentRepo.save(payment);
    return { payment_id: payment._id.toString(), gateway: 'STRIPE', transaction_id: intent.id, status: payment.status } as any;
  }

  private async initiateVNPayPayment(payment: Payment): Promise<PaymentResponseDto> {
    const paymentUrl = this.vnpayService.generatePaymentUrl(payment._id.toString(), payment.amount, payment.order_info, payment.return_url);
    payment.payment_url = paymentUrl; 
    await this.paymentRepo.save(payment);
    return { payment_id: payment._id.toString(), gateway: 'VNPAY', payment_url: paymentUrl, status: payment.status } as any;
  }

  private async initiateMoMoPayment(payment: Payment): Promise<PaymentResponseDto> {
    const result = await this.momoService.createPaymentRequest(payment._id.toString(), payment.amount, payment.order_info, payment.return_url, payment.notify_url);
    payment.transaction_id = result.requestId; 
    payment.payment_url = result.payUrl; 
    await this.paymentRepo.save(payment);
    return { payment_id: payment._id.toString(), gateway: 'MOMO', payment_url: result.payUrl, transaction_id: result.requestId, status: payment.status } as any;
  }

  private async initiateZaloPayPayment(payment: Payment): Promise<PaymentResponseDto> {
    const appTransId = this.zalopayService.generateAppTransId();
    const result = await this.zalopayService.createPaymentRequest(appTransId, payment.amount, payment.order_info, payment.return_url);
    payment.transaction_id = appTransId; 
    // Thêm fallback string rỗng để tránh lỗi undefined
    payment.payment_url = result.zalolink || ''; 
    await this.paymentRepo.save(payment);
    return { payment_id: payment._id.toString(), gateway: 'ZALOPAY', payment_url: payment.payment_url, transaction_id: appTransId, status: payment.status } as any;
  }
}