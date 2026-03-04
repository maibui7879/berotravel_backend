import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { Role } from '../../common/constants';
import { Public } from '../../common/decorators/public.decorator';
import { GetCurrentUser } from '../../common/decorators/get-current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/role.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CreateBookingDto } from './dto/create-booking.dto';

@ApiTags('Bookings & Inventory')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  // --- QUẢN LÝ KHO (MERCHANT) ---

  @Post('units')
  @Roles(Role.ADMIN, Role.MERCHANT)
  @UseGuards(RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo loại phòng/bàn (Merchant)' })
  createUnit(@Body() dto: any) {
    return this.bookingsService.createUnit(dto);
  }

  @Public()
  @Get('units/place/:placeId')
  @ApiOperation({ summary: 'Lấy danh sách phòng/bàn của một địa điểm (Công khai)' })
  findUnits(@Param('placeId') placeId: string) {
    return this.bookingsService.findUnitsByPlace(placeId);
  }

  @Patch('units/:id')
  @Roles(Role.ADMIN, Role.MERCHANT)
  @UseGuards(RolesGuard)
  @ApiBearerAuth()
  updateUnit(@Param('id') id: string, @Body() dto: any, @GetCurrentUser() user: any) {
    return this.bookingsService.updateUnit(id, dto, user);
  }

  @Delete('units/:id')
  @Roles(Role.ADMIN, Role.MERCHANT)
  @UseGuards(RolesGuard)
  @ApiBearerAuth()
  removeUnit(@Param('id') id: string, @GetCurrentUser() user: any) {
    return this.bookingsService.deleteUnit(id, user);
  }

  // --- QUẢN LÝ GIÁ & TRỐNG ---

  @Patch('availability/price')
  @Roles(Role.ADMIN, Role.MERCHANT)
  @UseGuards(RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sửa giá cho ngày cụ thể' })
  setPrice(@Body() dto: any, @GetCurrentUser() user: any) {
    return this.bookingsService.updatePriceOverride(dto, user);
  }

  @Public()
  @Get('availability/place/:placeId')
  @ApiOperation({ summary: 'Xem tình trạng trống của TOÀN BỘ địa điểm theo ngày' })
  getPlaceAvail(
    @Param('placeId') placeId: string,
    @Query('check_in') checkIn: string,
    @Query('check_out') checkOut: string,
  ) {
    return this.bookingsService.getPlaceAvailability(placeId, checkIn, checkOut);
  }

  // --- NGHIỆP VỤ BOOKING (USER & MERCHANT) ---

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Người dùng đặt chỗ' })
  create(@Body() dto: CreateBookingDto, @GetCurrentUser('sub') userId: string) {
    return this.bookingsService.create(dto, userId);
  }

  @Get('my-bookings')
  @ApiBearerAuth()
  findMyBookings(@GetCurrentUser('sub') userId: string) {
    return this.bookingsService.findMyBookings(userId);
  }

  @Get('place/:placeId')
  @Roles(Role.ADMIN, Role.MERCHANT)
  @UseGuards(RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Merchant xem các đơn của chỗ mình' })
  findByPlace(@Param('placeId') placeId: string, @GetCurrentUser() user: any) {
    return this.bookingsService.findByPlace(placeId, user);
  }


  @Patch(':id/cancel')
  @ApiBearerAuth()
  cancel(@Param('id') id: string, @GetCurrentUser() user: any) {
    return this.bookingsService.cancel(id, user);
  }

  // ==========================================
  // INVENTORY MANAGEMENT (MERCHANT)
  // ==========================================

  @Patch('inventory/:unitId/update-quantity')
  @Roles(Role.ADMIN, Role.MERCHANT)
  @UseGuards(RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Merchant cập nhật số lượng phòng/bàn trống theo ngày (Real-time)' })
  updateInventoryQuantity(
    @Param('unitId') unitId: string,
    @Body() dto: any, // { quantity, dateFrom, dateTo?, reason? }
    @GetCurrentUser() user: any
  ) {
    return this.bookingsService.updateInventoryQuantity(
      unitId,
      dto.quantity,
      dto.dateFrom,
      dto.dateTo,
      dto.reason || 'MANUAL_UPDATE',
      user
    );
  }

  @Get('inventory/:placeId/transactions')
  @Roles(Role.ADMIN, Role.MERCHANT)
  @UseGuards(RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xem lịch sử giao dịch kho (Inventory Transactions)' })
  getInventoryTransactions(
    @Param('placeId') placeId: string,
    @Query('unitId') unitId?: string,
    @GetCurrentUser() user?: any
  ) {
    return this.bookingsService.getInventoryTransactions(placeId, unitId, user);
  }

  // ==========================================
  // VOUCHER MANAGEMENT (MERCHANT)
  // ==========================================

  @Post(':placeId/vouchers')
  @Roles(Role.ADMIN, Role.MERCHANT)
  @UseGuards(RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Merchant tạo mã giảm giá' })
  createVoucher(
    @Param('placeId') placeId: string,
    @Body() dto: any,
    @GetCurrentUser() user: any
  ) {
    return this.bookingsService.createVoucher(placeId, dto, user);
  }

  @Get(':placeId/vouchers')
  @Roles(Role.ADMIN, Role.MERCHANT)
  @UseGuards(RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xem danh sách voucher của địa điểm' })
  getVouchers(
    @Param('placeId') placeId: string,
    @GetCurrentUser() user?: any
  ) {
    return this.bookingsService.getVouchers(placeId, user);
  }

  @Patch('vouchers/:voucherId')
  @Roles(Role.ADMIN, Role.MERCHANT)
  @UseGuards(RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật voucher' })
  updateVoucher(
    @Param('voucherId') voucherId: string,
    @Body() dto: any,
    @GetCurrentUser() user?: any
  ) {
    return this.bookingsService.updateVoucher(voucherId, dto, user);
  }

  @Post('vouchers/:code/validate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Kiểm tra & áp dụng mã giảm giá' })
  validateVoucher(
    @Param('code') code: string,
    @Body() dto: any, // { placeId, orderValue }
  ) {
    return this.bookingsService.validateVoucher(code, dto.placeId, dto.orderValue);
  }

  // ==========================================
  // PROMOTION MANAGEMENT (MERCHANT)
  // ==========================================

  @Post(':placeId/promotions')
  @Roles(Role.ADMIN, Role.MERCHANT)
  @UseGuards(RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Merchant tạo chương trình khuyến mãi (Happy Hour, Flash Sale, v.v.)' })
  createPromotion(
    @Param('placeId') placeId: string,
    @Body() dto: any,
    @GetCurrentUser() user: any
  ) {
    return this.bookingsService.createPromotion(placeId, dto, user);
  }

  @Get(':placeId/promotions')
  @Roles(Role.ADMIN, Role.MERCHANT)
  @UseGuards(RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xem danh sách chương trình khuyến mãi' })
  getPromotions(
    @Param('placeId') placeId: string,
    @GetCurrentUser() user?: any
  ) {
    return this.bookingsService.getPromotions(placeId, user);
  }

  @Patch('promotions/:promotionId/toggle')
  @Roles(Role.ADMIN, Role.MERCHANT)
  @UseGuards(RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Kích hoạt/Vô hiệu hóa chương trình khuyến mãi' })
  togglePromotion(
    @Param('promotionId') promotionId: string,
    @Body() dto: any, // { status: 'ACTIVE' | 'PAUSED' | 'ENDED' }
    @GetCurrentUser() user?: any
  ) {
    return this.bookingsService.togglePromotion(promotionId, dto.status, user);
  }

  @Public()
  @Get(':placeId/promotions/active')
  @ApiOperation({ summary: 'Lấy danh sách khuyến mãi đang áp dụng ngay bây giờ' })
  getActivePromotions(
    @Param('placeId') placeId: string,
    @Query('unitId') unitId?: string
  ) {
    return this.bookingsService.getActivePromotions(placeId, unitId);
  }
}