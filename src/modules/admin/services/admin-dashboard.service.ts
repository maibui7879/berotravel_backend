import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';

import { Payment, Payout, PaymentStatus } from '../../payments/entities/payment.entity';
import { Booking } from '../../bookings/entities/booking.entity';
import { Auth } from '../../auth/entities/auth.entity';
import { Place } from '../../places/entities/place.entity';
import { NotificationType } from '../../notification/entities/notification.entity';
import { NotificationsService } from '../../notification/notification.service';
import { MerchantRequest, RequestStatus } from '../../users/entities/merchant-request.entity';
import { Role } from '../../../common/constants';
import { User } from '../../users/entities/user.entity';
import { ForumPost, ForumComment } from '../../forum/entities/forum.entity';
import { ForumReport, ReportStatus } from '../../forum/entities/forum-report.entity';
import { PlaceStatus } from '../../../common/constants';
@Injectable()
export class AdminDashboardService {
  private readonly logger = new Logger(AdminDashboardService.name);

  constructor(
    @InjectRepository(Payment) private readonly paymentRepo: MongoRepository<Payment>,
    @InjectRepository(Payout) private readonly payoutRepo: MongoRepository<Payout>,
    @InjectRepository(Booking) private readonly bookingRepo: MongoRepository<Booking>,
    @InjectRepository(Auth) private readonly authRepo: MongoRepository<Auth>,
    @InjectRepository(Place) private readonly placeRepo: MongoRepository<Place>,
    @InjectRepository(User) private readonly userRepo: MongoRepository<User>,
    @InjectRepository(MerchantRequest) private readonly merchantRequestRepo: MongoRepository<MerchantRequest>,
    @InjectRepository(ForumPost) private readonly forumPostRepo: MongoRepository<ForumPost>,
    @InjectRepository(ForumComment) private readonly forumCommentRepo: MongoRepository<ForumComment>,
    @InjectRepository(ForumReport) private readonly reportRepo: MongoRepository<ForumReport>,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Get dashboard overview statistics
   */
async getDashboardOverview() {
    const [
      // Kết quả của các stats cũ
      totalUsers,
      totalPlaces,
      totalBookings,
      totalRevenue,
      pendingPayments,
      
      // Kết quả của các stats mới (Pending Tasks)
      pendingPlaces,
      pendingMerchants,
      pendingReports,
      
      // Kết quả của các stats mới (Community)
      totalPosts,
      totalComments,
      
      // Kết quả của biểu đồ phân bổ
      userRoleDistributionRaw,
      placeStatusDistributionRaw
    ] = await Promise.all([
      // 1. Các truy vấn gốc
      this.userRepo.count(),
      this.placeRepo.count(),
      this.bookingRepo.count(),
      this.getTotalRevenue(),
      this.paymentRepo.count({ where: { status: PaymentStatus.PENDING } as any }),
      
      // 2. Truy vấn Tasks chờ duyệt
      this.placeRepo.count({ where: { status: PlaceStatus.PENDING } as any }),
      this.merchantRequestRepo.count({ where: { status: RequestStatus.PENDING } as any }),
      this.reportRepo.count({ where: { status: ReportStatus.PENDING } as any }),
      
      // 3. Truy vấn Tương tác cộng đồng
      this.forumPostRepo.count(),
      this.forumCommentRepo.count(),
      
      // 4. Aggregation cho biểu đồ
      this.userRepo.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]).toArray(),
      this.placeRepo.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]).toArray()
    ]);

    // Tính toán giá trị trung bình
    const avgBookingValue = totalBookings > 0 ? totalRevenue / totalBookings : 0;

    // Format lại dữ liệu biểu đồ cho Frontend dễ đọc
    const userRoles = userRoleDistributionRaw.map(d => ({
      role: d._id || 'USER',
      count: d.count
    }));

    const placeStatuses = placeStatusDistributionRaw.map(d => ({
      status: d._id || 'UNKNOWN',
      count: d.count
    }));

    // TRẢ VỀ PAYLOAD TỔNG HỢP
    return {
      // Nhóm 1: Doanh thu & Dữ liệu tổng quan (Giữ nguyên cấu trúc cũ để không lỗi FE)
      totalUsers,
      totalPlaces,
      totalBookings,
      totalRevenue,
      pendingPayments,
      activeUsers24h: totalUsers, // (Lưu ý: Mockup - Sau này có bảng session thì thay thế)
      avgBookingValue: Math.round(avgBookingValue * 100) / 100,

      // Nhóm 2: To-Do List cho Admin (Dùng để gắn Badges/Thông báo đỏ)
      pendingTasks: {
        places: pendingPlaces,
        merchants: pendingMerchants,
        reports: pendingReports,
        total: pendingPlaces + pendingMerchants + pendingReports
      },

      // Nhóm 3: Chỉ số cộng đồng (Dùng cho các thẻ thống kê phụ)
      communityStats: {
        totalPosts,
        totalComments,
      },

      // Nhóm 4: Dữ liệu vẽ biểu đồ (Pie Charts/Donut Charts)
      distributions: {
        userRoles,
        placeStatuses
      }
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

    const users = await this.userRepo.find({
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
      const date = new Date(u.createdAt).toISOString().split('T')[0];
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

  async getAllUsers(page: number = 1, limit: number = 10) {
    const [data, total] = await this.userRepo.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { created_at: 'DESC' } as any
    });
    return { data, meta: { total, page, limit, last_page: Math.ceil(total / limit) } };
  }

  async getUserById(id: string) {
    const user = await this.userRepo.findOne({ where: { _id: new ObjectId(id) } });
    if (!user) throw new NotFoundException('Người dùng không tồn tại');
    return user;
  }

  async updateUser(id: string, data: any) {
    await this.userRepo.update(new ObjectId(id), data);
    return this.getUserById(id);
  }

  async deleteUser(id: string) {
    // Lưu ý: Cân nhắc việc xóa Auth nếu có liên kết
    await this.userRepo.delete(new ObjectId(id));
    return { success: true, message: 'Đã xóa người dùng thành công' };
  }

  // ================= ADMIN: QUẢN LÝ PLACE (CRUD) =================

  async getAllPlaces(page: number = 1, limit: number = 10) {
    const [data, total] = await this.placeRepo.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { created_at: 'DESC' } as any
    });
    return { data, meta: { total, page, limit, last_page: Math.ceil(total / limit) } };
  }

  async getPlaceById(id: string) {
    const place = await this.placeRepo.findOne({ where: { _id: new ObjectId(id) } });
    if (!place) throw new NotFoundException('Địa điểm không tồn tại');
    return place;
  }

  async updatePlace(id: string, data: any) {
    await this.placeRepo.update(new ObjectId(id), data);
    return this.getPlaceById(id);
  }

  async deletePlace(id: string) {
    await this.placeRepo.delete(new ObjectId(id));
    return { success: true, message: 'Đã xóa địa điểm thành công' };
  }

  // ================= ADMIN: QUẢN LÝ FORUM (REPORTS & COMMENTS) =================

  async getForumReports(page: number = 1, limit: number = 10) {
    const [reports, total] = await this.reportRepo.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { created_at: 'DESC' } as any
    });

    // Lấy thêm thông tin bài viết cho từng report
    const data = await Promise.all(reports.map(async (report) => {
      const post = await this.forumPostRepo.findOne({ where: { _id: new ObjectId(report.post_id) } });
      return { ...report, post_title: post?.title, post_content: post?.content };
    }));

    return { data, meta: { total, page, limit, last_page: Math.ceil(total / limit) } };
  }

  async resolveForumReport(reportId: string, action: 'DELETE_POST' | 'DISMISS') {
    const report = await this.reportRepo.findOne({ where: { _id: new ObjectId(reportId) } });
    if (!report) throw new NotFoundException('Báo cáo không tồn tại');

    if (action === 'DELETE_POST') {
      // Xóa bài viết và comment liên quan
      await this.forumPostRepo.delete(new ObjectId(report.post_id));
      await this.forumCommentRepo.delete({ post_id: report.post_id } as any);
      
      report.status = ReportStatus.RESOLVED;
      
      // Thông báo cho tác giả bài viết
      this.notificationsService.createAndSend({
        recipient_id: report.author_id,
        sender_id: 'admin',
        type: NotificationType.SYSTEM,
        title: 'Bài viết đã bị xóa',
        message: `Bài viết của bạn đã bị xóa do vi phạm tiêu chuẩn cộng đồng.`,
      });
    } else {
      report.status = ReportStatus.DISMISSED;
    }

    await this.reportRepo.save(report);
    return { success: true, message: 'Đã xử lý báo cáo' };
  }

  async deleteForumComment(commentId: string) {
    const comment = await this.forumCommentRepo.findOne({ where: { _id: new ObjectId(commentId) } });
    if (!comment) throw new NotFoundException('Bình luận không tồn tại');
    
    await this.forumCommentRepo.delete(new ObjectId(commentId));

    // Cập nhật lại stats comments của bài viết
    const post = await this.forumPostRepo.findOne({ where: { _id: new ObjectId(comment.post_id) } });
    if (post) {
      post.stats.comments = Math.max(0, post.stats.comments - 1);
      await this.forumPostRepo.save(post);
    }

    return { success: true, message: 'Đã xóa bình luận' };
  }

}
