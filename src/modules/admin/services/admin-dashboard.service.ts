import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { Payment, Payout, PaymentStatus } from '../../payments/entities/payment.entity';
import { Booking } from '../../bookings/entities/booking.entity';
import { Auth } from '../../auth/entities/auth.entity';
import { Place } from '../../places/entities/place.entity';
import { NotificationType } from 'src/modules/notification/entities/notification.entity';
import { NotificationsService } from 'src/modules/notification/notification.service';
import { MerchantRequest, RequestStatus } from '../../users/entities/merchant-request.entity';
import { Role } from '../../../common/constants';
import { User } from '../../users/entities/user.entity';
import { ObjectId } from 'mongodb';

/**
 * Admin Dashboard Service
 * Provides statistics and analytics for admin dashboard
 */
@Injectable()
export class AdminDashboardService {
  private readonly logger = new Logger(AdminDashboardService.name);

  constructor(
    
    @InjectRepository(Payment)
    private readonly paymentRepo: MongoRepository<Payment>,
    @InjectRepository(Payout)
    private readonly payoutRepo: MongoRepository<Payout>,
    @InjectRepository(Booking)
    private readonly bookingRepo: MongoRepository<Booking>,
    @InjectRepository(Auth)
    private readonly authRepo: MongoRepository<Auth>,
    @InjectRepository(Place)
    private readonly placeRepo: MongoRepository<Place>,
    @InjectRepository(User)
    private readonly userRepo: MongoRepository<User>,
    @InjectRepository(MerchantRequest)
    private readonly merchantRequestRepo: MongoRepository<MerchantRequest>,

    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Get dashboard overview statistics
   */
  async getDashboardOverview(): Promise<{
    totalUsers: number;
    totalPlaces: number;
    totalBookings: number;
    totalRevenue: number;
    pendingPayments: number;
    activeUsers24h: number;
    avgBookingValue: number;
  }> {
    const [
      totalUsers,
      totalPlaces,
      totalBookings,
      totalRevenue,
      pendingPayments,
    ] = await Promise.all([
      this.authRepo.count(),
      this.placeRepo.count(),
      this.bookingRepo.count(),
      this.getTotalRevenue(),
      this.paymentRepo.count({
        where: { status: PaymentStatus.PENDING } as any,
      }),
    ]);

    const avgBookingValue = totalBookings > 0 ? totalRevenue / totalBookings : 0;

    return {
      totalUsers,
      totalPlaces,
      totalBookings,
      totalRevenue,
      pendingPayments,
      activeUsers24h: 0, // TODO: Calculate from sessions
      avgBookingValue: Math.round(avgBookingValue * 100) / 100,
    };
  }

  /**
   * Get revenue statistics for date range
   */
  async getRevenueStats(
    startDate: Date,
    endDate: Date,
  ): Promise<{
    totalRevenue: number;
    bookingsCount: number;
    averageOrderValue: number;
    successRate: number;
    paymentsByGateway: Record<string, number>;
  }> {
    const completedPayments = await this.paymentRepo.find({
      where: {
        status: PaymentStatus.COMPLETED,
        completed_at: {
          $gte: startDate,
          $lte: endDate,
        },
      } as any,
    });

    const totalRevenue = completedPayments.reduce(
      (sum, p) => sum + p.amount,
      0,
    );
    const bookingsCount = completedPayments.length;
    const averageOrderValue =
      bookingsCount > 0 ? totalRevenue / bookingsCount : 0;

    // Calculate success rate
    const allPayments = await this.paymentRepo.find({
      where: {
        created_at: {
          $gte: startDate,
          $lte: endDate,
        },
      } as any,
    });

    const successRate =
      allPayments.length > 0
        ? (completedPayments.length / allPayments.length) * 100
        : 0;

    // Group by gateway
    const paymentsByGateway: Record<string, number> = {};
    completedPayments.forEach(p => {
      paymentsByGateway[p.gateway] = (paymentsByGateway[p.gateway] || 0) + p.amount;
    });

    return {
      totalRevenue,
      bookingsCount,
      averageOrderValue: Math.round(averageOrderValue * 100) / 100,
      successRate: Math.round(successRate * 100) / 100,
      paymentsByGateway,
    };
  }

  /**
   * Get daily revenue trend
   */
  async getDailyRevenueTrend(
    days: number = 7,
  ): Promise<Array<{ date: string; revenue: number; bookings: number }>> {
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);

    const payments = await this.paymentRepo.find({
      where: {
        status: PaymentStatus.COMPLETED,
        completed_at: {
          $gte: startDate,
          $lte: endDate,
        },
      } as any,
    });

    // Group by date
    const byDate: Record<string, { revenue: number; count: number }> = {};

    payments.forEach(p => {
      const date = new Date(p.completed_at).toISOString().split('T')[0];
      if (!byDate[date]) {
        byDate[date] = { revenue: 0, count: 0 };
      }
      byDate[date].revenue += p.amount;
      byDate[date].count++;
    });

    // Format response
    const result: Array<{ date: string; revenue: number; bookings: number }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(endDate);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      result.push({
        date: dateStr,
        revenue: byDate[dateStr]?.revenue || 0,
        bookings: byDate[dateStr]?.count || 0,
      });
    }

    return result;
  }

  /**
   * Get top merchants by revenue
   */
  async getTopMerchants(
    limit: number = 10,
  ): Promise<Array<{ merchantId: string; totalRevenue: number; bookings: number }>> {
    const payouts = await this.payoutRepo.find({
      take: limit * 2, // Get more than limit to filter
      order: { total_revenue: 'DESC' } as any,
    });

    // Group by merchant
    const byMerchant: Record<string, { revenue: number; bookings: number }> = {};

    payouts.forEach(p => {
      if (!byMerchant[p.merchant_id]) {
        byMerchant[p.merchant_id] = { revenue: 0, bookings: 0 };
      }
      byMerchant[p.merchant_id].revenue += p.total_revenue;
      byMerchant[p.merchant_id].bookings += p.bookings?.length || 0;
    });

    return Object.entries(byMerchant)
      .map(([merchantId, data]) => ({
        merchantId,
        totalRevenue: data.revenue,
        bookings: data.bookings,
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, limit);
  }

  /**
   * Get booking statistics
   */
  async getBookingStats(
    startDate: Date,
    endDate: Date,
  ): Promise<{
    totalBookings: number;
    completedBookings: number;
    cancelledBookings: number;
    pendingBookings: number;
    cancellationRate: number;
  }> {
    const bookings = await this.bookingRepo.find({
      where: {
        created_at: {
          $gte: startDate,
          $lte: endDate,
        },
      } as any,
    } as any);

    const stats = {
      totalBookings: bookings.length,
      completedBookings: 0,
      cancelledBookings: 0,
      pendingBookings: 0,
      cancellationRate: 0,
    };

    bookings.forEach(b => {
      if (b.status === 'COMPLETED') stats.completedBookings++;
      else if (b.status === 'CANCELLED') stats.cancelledBookings++;
      else stats.pendingBookings++;
    });

    stats.cancellationRate =
      stats.totalBookings > 0
        ? Math.round((stats.cancelledBookings / stats.totalBookings) * 10000) / 100
        : 0;

    return stats;
  }

  /**
   * Get user growth statistics
   */
  async getUserGrowthTrend(
    days: number = 30,
  ): Promise<Array<{ date: string; newUsers: number; totalUsers: number }>> {
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);

    const users = await this.authRepo.find({
      where: {
        created_at: {
          $gte: startDate,
          $lte: endDate,
        },
      } as any,
    } as any);

    // Group by date
    const byDate: Record<string, number> = {};
    users.forEach(u => {
      const date = new Date(u.created_at).toISOString().split('T')[0];
      byDate[date] = (byDate[date] || 0) + 1;
    });

    // Format response with cumulative total
    let cumulativeTotal = 0;
    const result: Array<{ date: string; newUsers: number; totalUsers: number }> = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(endDate);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const newUsers = byDate[dateStr] || 0;
      cumulativeTotal += newUsers;

      result.push({
        date: dateStr,
        newUsers,
        totalUsers: cumulativeTotal,
      });
    }

    return result;
  }

  /**
   * Get payout statistics
   */
  async getPayoutStats(
    startDate: Date,
    endDate: Date,
  ): Promise<{
    totalPayouts: number;
    completedPayouts: number;
    totalAmount: number;
    totalCommission: number;
    avgPayoutAmount: number;
    pendingPayouts: number;
  }> {
    const payouts = await this.payoutRepo.find({
      where: {
        created_at: {
          $gte: startDate,
          $lte: endDate,
        },
      } as any,
    } as any);

    const stats = {
      totalPayouts: payouts.length,
      completedPayouts: 0,
      totalAmount: 0,
      totalCommission: 0,
      avgPayoutAmount: 0,
      pendingPayouts: 0,
    };

    payouts.forEach(p => {
      stats.totalAmount += p.payout_amount;
      stats.totalCommission += p.commission_amount;

      if (p.status === 'COMPLETED') stats.completedPayouts++;
      else if (p.status === 'PENDING') stats.pendingPayouts++;
    });

    stats.avgPayoutAmount =
      payouts.length > 0
        ? Math.round((stats.totalAmount / payouts.length) * 100) / 100
        : 0;

    return stats;
  }

  async approveMerchantRequest(requestId: string, adminId: string) {
  const request = await this.merchantRequestRepo.findOne({ where: { _id: new ObjectId(requestId) } });
  if (!request) throw new NotFoundException('Yêu cầu không tồn tại');

  // 1. Cập nhật trạng thái yêu cầu
  request.status = RequestStatus.APPROVED;
  await this.merchantRequestRepo.save(request);

  // 2. Nâng cấp Role cho User
  const user = await this.userRepo.findOne({ where: { _id: new ObjectId(request.user_id) } });
  if (user) {
    user.role = Role.MERCHANT;
    await this.userRepo.save(user);

    // 3. Thông báo cho người dùng
    this.notificationsService.createAndSend({
      recipient_id: user._id.toString(),
      sender_id: adminId,
      type: NotificationType.SYSTEM,
      title: 'Yêu cầu được phê duyệt',
      message: `Chúc mừng! Bạn hiện đã là Merchant của BeroTravel.`,
    });
  }

  return { success: true };
}
async getPendingMerchantRequests() {
  return await this.merchantRequestRepo.find({
    where: { status: RequestStatus.PENDING } as any,
    order: { created_at: 'DESC' } as any,
  });
}

  // ============ HELPERS ============

  private async getTotalRevenue(): Promise<number> {
    const payments = await this.paymentRepo.find({
      where: { status: PaymentStatus.COMPLETED } as any,
    });

    return payments.reduce((sum, p) => sum + p.amount, 0);
  }


}
