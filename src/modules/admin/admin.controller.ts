import { Controller, Get, Query, UseGuards, Param, Patch, Body, Post, Delete } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiBody } from '@nestjs/swagger';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { PlacesService } from '../places/places.service';
import { RolesGuard } from '../../common/guards/role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AtGuard } from '../../common/guards/at.guard';
import { Role, PlaceStatus } from '../../common/constants';
import { GetCurrentUser } from '../../common/decorators/get-current-user.decorator';

interface CurrentUser {
  sub: string;
  role: Role;
}

/**
 * Admin Dashboard Controller
 * Endpoints for admin statistics and reporting
 */
@ApiTags('Admin')
@Controller('admin')
@UseGuards(AtGuard, RolesGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(
    private readonly dashboardService: AdminDashboardService,
    private readonly placesService: PlacesService,
  ) {}

  /**
   * GET /admin/dashboard/overview
   * Get dashboard overview statistics
   */
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({
    summary: 'Get dashboard overview',
    description: 'Get key statistics for admin dashboard',
  })
  @Get('dashboard/overview')
  async getDashboardOverview() {
    return this.dashboardService.getDashboardOverview();
  }

  /**
   * GET /admin/revenue/stats
   * Get revenue statistics
   */
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({
    summary: 'Get revenue statistics',
    description: 'Get revenue stats for a date range',
  })
  @Get('revenue/stats')
  async getRevenueStats(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.dashboardService.getRevenueStats(
      new Date(startDate),
      new Date(endDate),
    );
  }

  /**
   * GET /admin/revenue/daily-trend
   * Get daily revenue trend
   */
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({
    summary: 'Get revenue trend',
    description: 'Get daily revenue trend for specified days',
  })
  @Get('revenue/daily-trend')
  async getDailyRevenueTrend(@Query('days') days: string = '7') {
    return this.dashboardService.getDailyRevenueTrend(parseInt(days) || 7);
  }

  /**
   * GET /admin/merchants/top
   * Get top merchants by revenue
   */
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({
    summary: 'Get top merchants',
    description: 'Get top merchants by revenue',
  })
  @Get('merchants/top')
  async getTopMerchants(@Query('limit') limit: string = '10') {
    return this.dashboardService.getTopMerchants(parseInt(limit) || 10);
  }

  /**
   * GET /admin/bookings/stats
   * Get booking statistics
   */
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({
    summary: 'Get booking statistics',
    description: 'Get booking stats for a date range',
  })
  @Get('bookings/stats')
  async getBookingStats(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.dashboardService.getBookingStats(
      new Date(startDate),
      new Date(endDate),
    );
  }

  /**
   * GET /admin/users/growth
   * Get user growth trend
   */
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({
    summary: 'Get user growth trend',
    description: 'Get daily user signup trend',
  })
  @Get('users/growth')
  async getUserGrowthTrend(@Query('days') days: string = '30') {
    return this.dashboardService.getUserGrowthTrend(parseInt(days) || 30);
  }

  /**
   * GET /admin/payouts/stats
   * Get payout statistics
   */
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({
    summary: 'Get payout statistics',
    description: 'Get payout stats for a date range',
  })
  @Get('payouts/stats')
  async getPayoutStats(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.dashboardService.getPayoutStats(
      new Date(startDate),
      new Date(endDate),
    );
  }

  // ================= PLACES ADMIN ENDPOINTS =================

  @Get('places/pending-creations')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'ADMIN: Lấy danh sách địa điểm mới chờ duyệt' })
  getPendingPlaces() {
    return this.placesService.getPendingPlaces();
  }

  @Get('places/pending-edits')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'ADMIN: Lấy danh sách yêu cầu chỉnh sửa chờ duyệt' })
  getPendingEditRequests() {
    return this.placesService.getPendingEditRequests();
  }

  @Patch('places/creations/:id/verify')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'ADMIN: Duyệt hoặc Từ chối địa điểm mới' })
  @ApiBody({ schema: { type: 'object', properties: { status: { type: 'string', enum: ['APPROVED', 'REJECTED'] } } } })
  verifyPlace(
    @Param('id') id: string,
    @Body('status') status: PlaceStatus.APPROVED | PlaceStatus.REJECTED,
    @GetCurrentUser() user: CurrentUser
  ) {
    return this.placesService.verifyPlace(id, status, user);
  }

  @Patch('places/edits/:requestId/approve')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'ADMIN: Chấp thuận yêu cầu chỉnh sửa' })
  approveEditRequest(@Param('requestId') requestId: string, @GetCurrentUser() user: CurrentUser) {
    return this.placesService.approveEditRequest(requestId, user);
  }

  @Patch('places/edits/:requestId/reject')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'ADMIN: Từ chối yêu cầu chỉnh sửa' })
  @ApiBody({ schema: { type: 'object', properties: { reason: { type: 'string' } } } })
  rejectEditRequest(
    @Param('requestId') requestId: string,
    @Body('reason') reason: string,
    @GetCurrentUser() user: CurrentUser
  ) {
    return this.placesService.rejectEditRequest(requestId, reason, user);
  }

  @Get('places/pending-claims')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'ADMIN: Lấy danh sách yêu cầu xác nhận chủ sở hữu chờ duyệt' })
  getPendingClaimRequests() {
    return this.placesService.getPendingClaimRequests();
  }

  @Patch('places/claims/:id/approve')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'ADMIN: Chấp thuận yêu cầu xác nhận chủ sở hữu' })
  approveClaim(
    @Param('id') id: string,
    @GetCurrentUser() admin: CurrentUser
  ) {
    return this.placesService.approveClaim(id, admin);
  }

  @Patch('places/claims/:id/reject')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'ADMIN: Từ chối yêu cầu xác nhận chủ sở hữu' })
  @ApiBody({ schema: { type: 'object', properties: { reason: { type: 'string' } } } })
  rejectClaim(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @GetCurrentUser() admin: CurrentUser
  ) {
    return this.placesService.rejectClaim(id, reason, admin);
  }

  // ================= MERCHANT ADMIN ENDPOINTS =================
  @ApiOperation({ summary: 'Lấy danh sách các yêu cầu nâng cấp Merchant đang chờ duyệt' })
  getPendingMerchantRequests() {
    return this.dashboardService.getPendingMerchantRequests();
  }

@Patch('merchant-requests/:id/approve')
  @ApiOperation({ summary: 'Phê duyệt yêu cầu nâng cấp lên Merchant' })
  approveMerchantRequest(
    @Param('id') id: string,
    @GetCurrentUser('sub') adminId: string,
  ) {
    return this.dashboardService.approveMerchantRequest(id, adminId);
  }

  @Get('users')
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'ADMIN: Lấy danh sách tất cả Users' })
  getAllUsers(@Query('page') page: string = '1', @Query('limit') limit: string = '10') {
    return this.dashboardService.getAllUsers(+page, +limit);
  }

  @Get('users/:id')
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'ADMIN: Xem chi tiết 1 User' })
  getUserById(@Param('id') id: string) {
    return this.dashboardService.getUserById(id);
  }

  @Patch('users/:id')
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'ADMIN: Cập nhật thông tin User (Tùy ý)' })
  updateUser(@Param('id') id: string, @Body() data: any) {
    return this.dashboardService.updateUser(id, data);
  }

  @Delete('users/:id')
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'ADMIN: Xóa User khỏi hệ thống' })
  deleteUser(@Param('id') id: string) {
    return this.dashboardService.deleteUser(id);
  }

  // ================= ADMIN: CRUD PLACES =================

  @Get('places')
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'ADMIN: Lấy danh sách tất cả Places' })
  getAllPlaces(@Query('page') page: string = '1', @Query('limit') limit: string = '10') {
    return this.dashboardService.getAllPlaces(+page, +limit);
  }

  @Get('places/:id')
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'ADMIN: Xem chi tiết 1 Place' })
  getPlaceById(@Param('id') id: string) {
    return this.dashboardService.getPlaceById(id);
  }

  @Patch('places/:id')
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'ADMIN: Cập nhật thông tin Place (Tùy ý/Không cần xác thực Owner)' })
  updatePlace(@Param('id') id: string, @Body() data: any) {
    return this.dashboardService.updatePlace(id, data);
  }

  @Delete('places/:id')
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'ADMIN: Xóa Place khỏi hệ thống' })
  deletePlace(@Param('id') id: string) {
    return this.dashboardService.deletePlace(id);
  }

  // ================= ADMIN: FORUM & REPORTS =================

  @Get('forum/reports')
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'ADMIN: Xem danh sách báo cáo vi phạm diễn đàn' })
  getForumReports(@Query('page') page: string = '1', @Query('limit') limit: string = '10') {
    return this.dashboardService.getForumReports(+page, +limit);
  }

  @Patch('forum/reports/:id/resolve')
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'ADMIN: Xử lý báo cáo vi phạm (Xóa bài hoặc Bỏ qua)' })
  @ApiBody({ schema: { properties: { action: { type: 'string', enum: ['DELETE_POST', 'DISMISS'] } } } })
  resolveForumReport(
    @Param('id') id: string, 
    @Body('action') action: 'DELETE_POST' | 'DISMISS'
  ) {
    return this.dashboardService.resolveForumReport(id, action);
  }

  @Delete('forum/comments/:id')
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'ADMIN: Xóa trực tiếp một bình luận vi phạm' })
  deleteForumComment(@Param('id') id: string) {
    return this.dashboardService.deleteForumComment(id);
  }
}
