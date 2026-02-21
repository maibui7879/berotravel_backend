import { Controller, Get, Query, UseGuards, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { RolesGuard } from '../../common/guards/role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AtGuard } from '../../common/guards/at.guard';
import { Role } from '../../common/constants';

/**
 * Admin Dashboard Controller
 * Endpoints for admin statistics and reporting
 */
@ApiTags('Admin')
@Controller('admin')
@UseGuards(AtGuard, RolesGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

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
}
