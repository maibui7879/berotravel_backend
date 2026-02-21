import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { ConfigService } from '@nestjs/config';

import { Payout, Payment, PaymentStatus } from '../entities/payment.entity';
import { PayoutCalculationDto, PayoutResponseDto } from '../dto/payment.dto';

/**
 * Payout Service
 * Handles merchant payouts, commission calculations, and settlements
 */
@Injectable()
export class PayoutService {
  private readonly logger = new Logger(PayoutService.name);
  private readonly defaultCommissionRate: number;

  constructor(
    @InjectRepository(Payout)
    private readonly payoutRepo: MongoRepository<Payout>,
    @InjectRepository(Payment)
    private readonly paymentRepo: MongoRepository<Payment>,
    private configService: ConfigService,
  ) {
    this.defaultCommissionRate =
      parseFloat(this.configService.get('MERCHANT_COMMISSION_RATE', '0.15')) || 0.15;
  }

  /**
   * Calculate and create payout for merchant for a specific period
   */
  async calculateMerchantPayout(
    merchantId: string,
    periodStart: Date,
    periodEnd: Date,
    customCommissionRate?: number,
  ): Promise<PayoutResponseDto> {
    this.logger.log(
      `Calculating payout for merchant ${merchantId}: ${periodStart.toISOString()} - ${periodEnd.toISOString()}`,
    );

    // 1. Find all completed payments for this merchant's bookings in the period
    // Note: This assumes bookings have a merchant_id field
    // Query all completed payments
    const payments = await this.paymentRepo.find({
      where: {
        status: PaymentStatus.COMPLETED,
        completed_at: {
          $gte: periodStart,
          $lte: periodEnd,
        },
      } as any,
      take: 1000,
    });

    // Filter by merchant (would need to join with bookings table)
    // For now: sum all completed payments
    let totalRevenue = 0;
    const bookingIds: string[] = [];

    payments.forEach(payment => {
      totalRevenue += payment.amount;
      bookingIds.push(payment.booking_id);
    });

    // 2. Calculate commission and payout amount
    const commissionRate = customCommissionRate || this.defaultCommissionRate;
    const commissionAmount = totalRevenue * commissionRate;
    const payoutAmount = totalRevenue - commissionAmount;

    // 3. Create payout record
    const payout = this.payoutRepo.create({
      merchant_id: merchantId,
      period_start: periodStart,
      period_end: periodEnd,
      total_revenue: totalRevenue,
      commission_rate: commissionRate,
      commission_amount: Math.round(commissionAmount * 100) / 100,
      payout_amount: Math.round(payoutAmount * 100) / 100,
      status: 'PENDING',
      bookings: payments.map(p => ({
        booking_id: p.booking_id,
        amount: p.amount,
        payment_date: p.completed_at,
      })),
      created_at: new Date(),
      updated_at: new Date(),
    });

    await this.payoutRepo.save(payout);

    this.logger.log(
      `Payout created: ${payout._id}, Amount: ${payout.payout_amount}`,
    );

    return {
      payout_id: payout._id.toString(),
      merchant_id: merchantId,
      period: {
        start: periodStart,
        end: periodEnd,
      },
      total_revenue: payout.total_revenue,
      commission_rate: payout.commission_rate,
      commission_amount: payout.commission_amount,
      payout_amount: payout.payout_amount,
      status: payout.status,
      created_at: payout.created_at,
    };
  }

  /**
   * Get payout details
   */
  async getPayoutDetails(payoutId: string): Promise<Payout> {
    const payout = await this.payoutRepo.findOne({
      where: { _id: new ObjectId(payoutId) } as any,
    });

    if (!payout) {
      throw new NotFoundException('Payout not found');
    }

    return payout;
  }

  /**
   * List merchant payouts
   */
  async getMerchantPayouts(
    merchantId: string,
    skip: number = 0,
    limit: number = 20,
  ): Promise<{ data: Payout[]; total: number }> {
    const [data, total] = await Promise.all([
      this.payoutRepo.find({
        where: { merchant_id: merchantId } as any,
        skip,
        take: limit,
        order: { created_at: 'DESC' } as any,
      }),
      this.payoutRepo.count({ where: { merchant_id: merchantId } } as any),
    ]);

    return { data, total };
  }

  /**
   * Approve payout (admin action)
   */
  async approvePayout(
    payoutId: string,
    approvedBy: string,
    payoutMethod: string = 'BANK_TRANSFER',
  ): Promise<Payout> {
    const payout = await this.getPayoutDetails(payoutId);

    if (payout.status !== 'PENDING') {
      throw new BadRequestException(
        `Cannot approve payout in status: ${payout.status}`,
      );
    }

    payout.status = 'CONFIRMED';
    payout.payout_method = payoutMethod;
    payout.updated_at = new Date();

    await this.payoutRepo.save(payout);

    this.logger.log(`Payout ${payoutId} approved by ${approvedBy}`);

    return payout;
  }

  /**
   * Mark payout as processing (when payment initiated)
   */
  async markAsProcessing(payoutId: string, transactionId?: string): Promise<Payout> {
    const payout = await this.getPayoutDetails(payoutId);

    if (payout.status !== 'CONFIRMED') {
      throw new BadRequestException(
        `Cannot process payout in status: ${payout.status}`,
      );
    }

    payout.status = 'PROCESSING';
    if (transactionId) {
      payout.transaction_id = transactionId;
    }
    payout.updated_at = new Date();

    await this.payoutRepo.save(payout);

    this.logger.log(`Payout ${payoutId} marked as PROCESSING`);

    return payout;
  }

  /**
   * Mark payout as completed
   */
  async markAsCompleted(payoutId: string): Promise<Payout> {
    const payout = await this.getPayoutDetails(payoutId);

    if (payout.status !== 'PROCESSING') {
      throw new BadRequestException(
        `Cannot complete payout in status: ${payout.status}`,
      );
    }

    payout.status = 'COMPLETED';
    payout.completed_at = new Date();
    payout.updated_at = new Date();

    await this.payoutRepo.save(payout);

    this.logger.log(`Payout ${payoutId} completed`);

    return payout;
  }

  /**
   * Mark payout as failed
   */
  async markAsFailed(payoutId: string, reason: string): Promise<Payout> {
    const payout = await this.getPayoutDetails(payoutId);

    payout.status = 'FAILED';
    payout.updated_at = new Date();
    payout.updated_at = new Date(); // Extra field for reason if needed

    await this.payoutRepo.save(payout);

    this.logger.log(`Payout ${payoutId} failed: ${reason}`);

    return payout;
  }

  /**
   * Get revenue report for admin
   */
  async getRevenueReport(
    periodStart: Date,
    periodEnd: Date,
  ): Promise<{
    period: { start: Date; end: Date };
    totalRevenue: number;
    totalCommission: number;
    totalPayout: number;
    payoutCount: number;
    completedCount: number;
    pendingCount: number;
    failedCount: number;
  }> {
    const payouts = await this.payoutRepo.find({
      where: {
        period_start: { $gte: periodStart } as any,
        period_end: { $lte: periodEnd } as any,
      } as any,
    });

    const stats = {
      totalRevenue: 0,
      totalCommission: 0,
      totalPayout: 0,
      completedCount: 0,
      pendingCount: 0,
      failedCount: 0,
    };

    payouts.forEach(payout => {
      stats.totalRevenue += payout.total_revenue;
      stats.totalCommission += payout.commission_amount;
      stats.totalPayout += payout.payout_amount;

      if (payout.status === 'COMPLETED') stats.completedCount++;
      else if (payout.status === 'PENDING') stats.pendingCount++;
      else if (payout.status === 'FAILED') stats.failedCount++;
    });

    return {
      period: { start: periodStart, end: periodEnd },
      payoutCount: payouts.length,
      ...stats,
    };
  }

  /**
   * Calculate average commission rate for merchant
   */
  async getMerchantStats(merchantId: string): Promise<{
    totalPayouts: number;
    totalEarnings: number;
    totalCommissionPaid: number;
    averagePayoutAmount: number;
    payoutsByStatus: Record<string, number>;
  }> {
    const payouts = await this.payoutRepo.find({
      where: { merchant_id: merchantId } as any,
    });

    const stats = {
      totalPayouts: payouts.length,
      totalEarnings: 0,
      totalCommissionPaid: 0,
      averagePayoutAmount: 0,
      payoutsByStatus: {
        PENDING: 0,
        CONFIRMED: 0,
        PROCESSING: 0,
        COMPLETED: 0,
        FAILED: 0,
      },
    };

    payouts.forEach(payout => {
      stats.totalEarnings += payout.payout_amount;
      stats.totalCommissionPaid += payout.commission_amount;

      const status = payout.status as keyof typeof stats.payoutsByStatus;
      if (status in stats.payoutsByStatus) {
        stats.payoutsByStatus[status]++;
      }
    });

    if (payouts.length > 0) {
      stats.averagePayoutAmount = stats.totalEarnings / payouts.length;
    }

    return stats;
  }
}
