import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { Role } from '../../common/constants';
import { Public } from '../../common/decorators/public.decorator';
import { GetCurrentUser } from '../../common/decorators/get-current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/role.guard';
import { CreateBookingDto } from './dto/create-booking.dto';
import { 
  ApiTags, 
  ApiOperation, 
  ApiBearerAuth, 
  ApiResponse, 
  ApiParam, 
  ApiBody,
  ApiQuery
} from '@nestjs/swagger';
import { Booking } from './entities/booking.entity';
import { InventoryUnit } from './entities/inventory-unit.entity';
import { Voucher } from './entities/voucher.entity';
import { Promotion } from './entities/promotion.entity';
import { InventoryTransaction } from './entities/inventory-transaction.entity';
import { 
  CreateInventoryUnitDto, 
  UpdatePriceOverrideDto, 
  UpdateInventoryQuantityDto, 
  TogglePromotionDto,
  ValidateVoucherDto 
} from './dto/merchant-booking.dto';

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
  @ApiResponse({ status: 201, type: InventoryUnit })
  // [SỬA]: Thêm @GetCurrentUser() user: any
  createUnit(@Body() dto: CreateInventoryUnitDto, @GetCurrentUser() user: any) {
    return this.bookingsService.createUnit(dto, user);
  }

  @Public()
  @Get('units/place/:placeId')
  @ApiOperation({ summary: 'Lấy danh sách phòng/bàn của một địa điểm (Công khai)' })
  @ApiParam({ name: 'placeId', description: 'ID của địa điểm' })
  @ApiResponse({ status: 200, type: [InventoryUnit] })
  findUnits(@Param('placeId') placeId: string) {
    return this.bookingsService.findUnitsByPlace(placeId);
  }

  @Patch('units/:id')
  @Roles(Role.ADMIN, Role.MERCHANT)
  @UseGuards(RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật thông tin loại phòng/bàn' })
  updateUnit(@Param('id') id: string, @Body() dto: Partial<CreateInventoryUnitDto>, @GetCurrentUser() user: any) {
    return this.bookingsService.updateUnit(id, dto, user);
  }

  @Delete('units/:id')
  @Roles(Role.ADMIN, Role.MERCHANT)
  @UseGuards(RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa loại phòng/bàn' })
  removeUnit(@Param('id') id: string, @GetCurrentUser() user: any) {
    return this.bookingsService.deleteUnit(id, user);
  }

  // --- QUẢN LÝ GIÁ & TRỐNG ---

  @Patch('availability/price')
  @Roles(Role.ADMIN, Role.MERCHANT)
  @UseGuards(RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sửa giá cho ngày cụ thể' })
  setPrice(@Body() dto: UpdatePriceOverrideDto, @GetCurrentUser() user: any) {
    return this.bookingsService.updatePriceOverride(dto, user);
  }

  @Public()
  @Get('availability/place/:placeId')
  @ApiOperation({ summary: 'Xem tình trạng trống của TOÀN BỘ địa điểm theo ngày' })
  @ApiQuery({ name: 'check_in', example: '2026-01-01' })
  @ApiQuery({ name: 'check_out', example: '2026-01-05', required: false })
  getPlaceAvail(
    @Param('placeId') placeId: string,
    @Query('check_in') checkIn: string,
    @Query('check_out') checkOut: string,
  ) {
    return this.bookingsService.getPlaceAvailability(placeId, checkIn, checkOut);
  }

  // --- NGHIỆP VỤ BOOKING ---

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Người dùng đặt chỗ' })
  @ApiResponse({ status: 201, description: 'Đặt chỗ thành công', type: Booking })
  @ApiResponse({ status: 400, description: 'Hết chỗ hoặc dữ liệu không hợp lệ' })
  create(@Body() dto: CreateBookingDto, @GetCurrentUser('sub') userId: string) {
    return this.bookingsService.create(dto, userId);
  }

  @Get('my-bookings')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xem danh sách đơn đặt của tôi' })
  @ApiResponse({ status: 200, type: [Booking] })
  findMyBookings(@GetCurrentUser('sub') userId: string) {
    return this.bookingsService.findMyBookings(userId);
  }

  @Get('place/:placeId')
  @Roles(Role.ADMIN, Role.MERCHANT)
  @UseGuards(RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Merchant xem các đơn của chỗ mình' })
  @ApiResponse({ status: 200, type: [Booking] })
  findByPlace(@Param('placeId') placeId: string, @GetCurrentUser() user: any) {
    return this.bookingsService.findByPlace(placeId, user);
  }

  @Patch(':id/cancel')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Hủy đơn đặt chỗ' })
  cancel(@Param('id') id: string, @GetCurrentUser() user: any) {
    return this.bookingsService.cancel(id, user);
  }

  // --- INVENTORY MANAGEMENT ---

  @Patch('inventory/:unitId/update-quantity')
  @Roles(Role.ADMIN, Role.MERCHANT)
  @UseGuards(RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật số lượng trống theo ngày' })
  updateInventoryQuantity(
    @Param('unitId') unitId: string,
    @Body() dto: UpdateInventoryQuantityDto,
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
  @ApiOperation({ summary: 'Xem lịch sử giao dịch kho' })
  @ApiResponse({ status: 200, type: [InventoryTransaction] })
  getInventoryTransactions(
    @Param('placeId') placeId: string,
    @Query('unitId') unitId?: string,
    @GetCurrentUser() user?: any
  ) {
    return this.bookingsService.getInventoryTransactions(placeId, unitId, user);
  }

  // --- VOUCHER & PROMOTIONS ---

  @Post(':placeId/vouchers')
  @Roles(Role.ADMIN, Role.MERCHANT)
  @UseGuards(RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Merchant tạo mã giảm giá' })
  @ApiResponse({ status: 201, type: Voucher })
  createVoucher(@Param('placeId') placeId: string, @Body() dto: any, @GetCurrentUser() user: any) {
    return this.bookingsService.createVoucher(placeId, dto, user);
  }

  @Post('vouchers/:code/validate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Kiểm tra & áp dụng mã giảm giá' })
  validateVoucher(
    @Param('code') code: string,
    @Body() dto: ValidateVoucherDto,
  ) {
    return this.bookingsService.validateVoucher(code, dto.place_id, dto.orderValue);
  }

  @Post(':placeId/promotions')
  @Roles(Role.ADMIN, Role.MERCHANT)
  @UseGuards(RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Merchant tạo chương trình khuyến mãi' })
  @ApiResponse({ status: 201, type: Promotion })
  createPromotion(@Param('placeId') placeId: string, @Body() dto: any, @GetCurrentUser() user: any) {
    return this.bookingsService.createPromotion(placeId, dto, user);
  }

  @Patch('promotions/:promotionId/toggle')
  @Roles(Role.ADMIN, Role.MERCHANT)
  @UseGuards(RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Kích hoạt/Vô hiệu hóa chương trình khuyến mãi' })
  togglePromotion(
    @Param('promotionId') promotionId: string,
    @Body() dto: TogglePromotionDto,
    @GetCurrentUser() user?: any
  ) {
    return this.bookingsService.togglePromotion(promotionId, dto.status, user);
  }

  @Public()
  @Get(':placeId/promotions/active')
  @ApiOperation({ summary: 'Lấy danh sách khuyến mãi đang áp dụng' })
  @ApiResponse({ status: 200, type: [Promotion] })
  getActivePromotions(@Param('placeId') placeId: string, @Query('unitId') unitId?: string) {
    return this.bookingsService.getActivePromotions(placeId, unitId);
  }
}