import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { Role } from 'src/common/constants';
import { Public } from 'src/common/decorators/public.decorator';
import { GetCurrentUser } from 'src/common/decorators/get-current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/role.guard';
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
}