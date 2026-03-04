import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Booking } from './entities/booking.entity';
import { InventoryUnit } from './entities/inventory-unit.entity';
import { Availability } from './entities/availability.entity';
import { InventoryTransaction, TransactionType } from './entities/inventory-transaction.entity';
import { Voucher, VoucherStatus } from './entities/voucher.entity';
import { Promotion, PromotionStatus } from './entities/promotion.entity';
import { Place } from '../places/entities/place.entity';
import { Role } from '../../common/constants';

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Booking) private readonly bookingRepo: MongoRepository<Booking>,
    @InjectRepository(InventoryUnit) private readonly unitRepo: MongoRepository<InventoryUnit>,
    @InjectRepository(Availability) private readonly availRepo: MongoRepository<Availability>,
    @InjectRepository(InventoryTransaction) private readonly transactionRepo: MongoRepository<InventoryTransaction>,
    @InjectRepository(Voucher) private readonly voucherRepo: MongoRepository<Voucher>,
    @InjectRepository(Promotion) private readonly promotionRepo: MongoRepository<Promotion>,
    @InjectRepository(Place) private readonly placeRepo: MongoRepository<Place>,
  ) {}


  async getPlaceAvailability(placeId: string, checkIn: string, checkOut?: string) {
    const startDate = new Date(new Date(checkIn).setHours(0, 0, 0, 0));
    // Nếu không có checkOut (ví dụ nhà hàng), chỉ tính 1 ngày
    const endDate = checkOut ? new Date(new Date(checkOut).setHours(0, 0, 0, 0)) : new Date(startDate);
    
    // 1. Lấy tất cả các loại phòng/bàn của Place này
    const units = await this.unitRepo.find({ where: { place_id: placeId } });
    if (!units.length) return [];

    // 2. Tạo danh sách các ngày cần kiểm tra
    const dates: Date[] = [];
    const tempDate = new Date(startDate);
    while (tempDate <= endDate) {
      dates.push(new Date(tempDate));
      tempDate.setDate(tempDate.getDate() + 1);
    }

    // 3. Với mỗi Unit, lấy thông tin Availability trong khoảng ngày
    return await Promise.all(units.map(async (unit) => {
      const avails = await this.availRepo.find({
        where: {
          unit_id: unit._id.toString(),
          date: { $gte: startDate, $lte: endDate }
        }
      });

      const availabilityByDate = dates.map(date => {
        const found = avails.find(a => a.date.getTime() === date.getTime());
        const availableCount = found ? found.available_count : unit.total_inventory;
        return {
          date: date.toISOString().split('T')[0],
          available_count: availableCount,
          price: found?.price_override || unit.base_price,
          is_full: availableCount <= 0
        };
      });

      return {
        unit_id: unit._id,
        name: unit.name,
        unit_type: unit.unit_type,
        capacity: unit.capacity,
        base_price: unit.base_price,
        availability: availabilityByDate,
        is_available_all_days: !availabilityByDate.some(d => d.is_full)
      };
    }));
  }

  // ================= NGHIỆP VỤ ĐẶT CHỖ (TRỪ KHO ĐA NGÀY) =================

async create(dto: any, userId: string) {
    const { unit_id, check_in, check_out, time_slot, pax_count } = dto;
    const unit = await this.unitRepo.findOne({ where: { _id: new ObjectId(unit_id) } });
    if (!unit) throw new NotFoundException('Loại hình đặt chỗ không tồn tại');

    // 1. Xác định danh sách các ngày thực tế cần chiếm chỗ
    const startDate = new Date(new Date(check_in).setHours(0, 0, 0, 0));
    const datesToBook: Date[] = [];

    if ((unit.unit_type === 'ROOM' || unit.unit_type === 'HOUSE') && check_out) {
      const endDate = new Date(new Date(check_out).setHours(0, 0, 0, 0));
      // Khách sạn: Chỉ trừ kho đến TRƯỚC ngày check-out
      const tempDate = new Date(startDate);
      while (tempDate < endDate) {
        datesToBook.push(new Date(tempDate));
        tempDate.setDate(tempDate.getDate() + 1);
      }
    } else {
      datesToBook.push(startDate); // Nhà hàng: Chỉ tính 1 ngày
    }

    if (datesToBook.length === 0) throw new BadRequestException('Ngày đặt không hợp lệ');

    // 2. ATOMIC UPDATE & CƠ CHẾ ROLLBACK
    let totalCalculatedPrice = 0;
    const successfullyBookedDates: Date[] = []; // Mảng lưu các ngày đã trừ kho thành công

    try {
      for (const date of datesToBook) {
        const result = await this.availRepo.findOneAndUpdate(
          {
            unit_id: unit_id.toString(),
            date: date,
            time_slot: time_slot || null,
            // Chỉ trừ kho nếu số lượng còn > 0 hoặc document chưa tồn tại
            $or: [{ available_count: { $gt: 0 } }, { _id: { $exists: false } }]
          },
          {
            $inc: { booked_count: 1, available_count: -1 },
            $setOnInsert: {
              unit_id: unit_id.toString(),
              date: date,
              time_slot: time_slot || null,
              available_count: unit.total_inventory - 1,
              booked_count: 1
            }
          },
          { upsert: true, returnDocument: 'after' }
        ) as any;

        const currentAvail = result.value;
        
        // Nếu không trừ được kho (tức là đã hết chỗ)
        if (!currentAvail || currentAvail.available_count < 0) {
          throw new BadRequestException(`Rất tiếc, ngày ${date.toLocaleDateString('vi-VN')} đã hết chỗ`);
        }
        
        // Đánh dấu ngày này đã trừ kho thành công
        successfullyBookedDates.push(date);
        totalCalculatedPrice += currentAvail.price_override || unit.base_price;
      }

      // 3. Lưu đơn đặt chỗ
      const booking = this.bookingRepo.create({
        user_id: userId,
        place_id: unit.place_id.toString(),
        unit_id: unit_id.toString(),
        booking_type: unit.unit_type,
        check_in: startDate,
        check_out: check_out ? new Date(check_out) : undefined,
        time_slot: time_slot || undefined,
        pax_count: Number(pax_count),
        total_price: totalCalculatedPrice,
        status: 'PENDING', // [ĐÃ SỬA]: Vừa tạo xong chỉ được phép PENDING
      } as any);

      return await this.bookingRepo.save(booking);

    } catch (error) {
      // [ROLLBACK] Nếu có lỗi xảy ra (hết kho giữa chừng), phải hoàn lại chỗ cho các ngày đã lỡ trừ trước đó
      if (successfullyBookedDates.length > 0) {
        await Promise.all(
          successfullyBookedDates.map(date => 
            this.availRepo.updateOne(
              { unit_id: unit_id.toString(), date: date, time_slot: time_slot || null },
              { $inc: { booked_count: -1, available_count: 1 } }
            )
          )
        );
      }
      
      // Đẩy lỗi ra ngoài để controller trả về client
      throw error;
    }
  }

  // ================= QUẢN LÝ KHO & ĐƠN HÀNG (GIỮ NGUYÊN) =================

  async createUnit(dto: any) {
    return await this.unitRepo.save(this.unitRepo.create(dto));
  }

  async findUnitsByPlace(placeId: string) {
    return await this.unitRepo.find({ where: { place_id: placeId } });
  }

  async updateUnit(id: string, dto: any, user: any) {
    const unit = await this.unitRepo.findOne({ where: { _id: new ObjectId(id) } });
    if (!unit) throw new NotFoundException('Unit không tồn tại');
    const place = await this.placeRepo.findOne({ where: { _id: new ObjectId(unit.place_id) } });
    if (user.role !== Role.ADMIN && place?.ownerId !== user.sub) throw new ForbiddenException('Không có quyền');
    
    await this.unitRepo.update(new ObjectId(id), dto);
    return this.unitRepo.findOne({ where: { _id: new ObjectId(id) } });
  }

  async deleteUnit(id: string, user: any) {
    const unit = await this.unitRepo.findOne({ where: { _id: new ObjectId(id) } });
    if (!unit) throw new NotFoundException('Unit không tồn tại');
    const place = await this.placeRepo.findOne({ where: { _id: new ObjectId(unit.place_id) } });
    if (user.role !== Role.ADMIN && place?.ownerId !== user.sub) throw new ForbiddenException('Không có quyền');

    await this.unitRepo.delete(new ObjectId(id));
    return { success: true };
  }

  async updatePriceOverride(dto: any, user: any) {
    const { unit_id, date, price_override, time_slot } = dto;
    const targetDate = new Date(new Date(date).setHours(0, 0, 0, 0));
    await this.availRepo.updateOne(
      { unit_id, date: targetDate, time_slot: time_slot || null },
      { $set: { price_override } },
      { upsert: true }
    );
    return { success: true };
  }

  async findMyBookings(userId: string) {
    return await this.bookingRepo.find({ where: { user_id: userId }, order: { created_at: -1 } as any });
  }

  async findByPlace(placeId: string, user: any) {
    const place = await this.placeRepo.findOne({ where: { _id: new ObjectId(placeId) } });
    if (user.role !== Role.ADMIN && place?.ownerId !== user.sub) throw new ForbiddenException('Không có quyền');
    return await this.bookingRepo.find({ where: { place_id: placeId }, order: { created_at: -1 } as any });
  }
  // Cập nhật trạng thái Booking khi thanh toán thành công
  async confirmBooking(bookingId: string) {
    const booking = await this.bookingRepo.findOne({ where: { _id: new ObjectId(bookingId) } });
    if (!booking) return;
    
    booking.status = 'CONFIRMED';
    await this.bookingRepo.save(booking);
  }

  async cancel(id: string, user: any) {
    const booking = await this.bookingRepo.findOne({ where: { _id: new ObjectId(id) } });
    if (!booking) throw new NotFoundException('Đơn không tồn tại');
    if (user.role !== Role.ADMIN && booking.user_id !== user.sub) throw new ForbiddenException('Không có quyền');

    await this.bookingRepo.update(new ObjectId(id), { status: 'CANCELLED' });
    
    // Lưu ý: Để chính xác cần loop qua các ngày đã đặt để hoàn trả available_count (giống logic create)
    await this.availRepo.updateOne(
      { unit_id: booking.unit_id, date: booking.check_in, time_slot: booking.time_slot || null },
      { $inc: { booked_count: -1, available_count: 1 } }
    );
    return { success: true };
  }
  
  async releaseBookingSlot(placeId: string, dateStr: string, quantity: number = 1) {
    // 1. Tìm Inventory Unit của Place
    const units = await this.unitRepo.find({ where: { place_id: placeId } });
    if (!units || units.length === 0) return; 

    // Giả định: Lấy Unit đầu tiên (Hoặc logic phức tạp hơn cần lưu unit_id vào Stop)
    const unit = units[0];

    // 2. Tìm Availability record
    // Lưu ý: Date trong DB lưu dạng Date object (0h00), dateStr truyền vào là chuỗi 'YYYY-MM-DD'
    const targetDate = new Date(new Date(dateStr).setHours(0,0,0,0));

    const availability = await this.availRepo.findOne({ 
        where: { unit_id: unit._id.toString(), date: targetDate } 
    });

    if (availability) {
        // 3. Cộng lại kho
        availability.available_count += quantity;
        availability.booked_count = Math.max(0, (availability.booked_count || 0) - quantity);

        // Cap ở max inventory
        if (availability.available_count > unit.total_inventory) {
            availability.available_count = unit.total_inventory;
        }
        
        await this.availRepo.save(availability);
    }
  }

  // ==========================================
  // INVENTORY MANAGEMENT (MERCHANT)
  // ==========================================

  // Cập nhật số lượng phòng/bàn trống theo ngày thực tế
  async updateInventoryQuantity(
    unitId: string,
    quantity: number,
    dateFrom: string,
    dateTo?: string,
    reason: string = 'MANUAL_UPDATE',
    user?: any
  ) {
    const unit = await this.unitRepo.findOne({ where: { _id: new ObjectId(unitId) } });
    if (!unit) throw new NotFoundException('Loại phòng/bàn không tồn tại');

    // Kiểm quyền: Chỉ merchant chủ sở hữu hoặc admin
    if (user && user.role !== Role.ADMIN) {
      const place = await this.placeRepo.findOne({ where: { _id: new ObjectId(unit.place_id) } });
      if (place?.ownerId !== user.sub) throw new ForbiddenException('Không có quyền quản lý kho này');
    }

    const startDate = new Date(new Date(dateFrom).setHours(0, 0, 0, 0));
    const endDate = dateTo ? new Date(new Date(dateTo).setHours(0, 0, 0, 0)) : startDate;

    const datesToUpdate: Date[] = [];
    const tempDate = new Date(startDate);
    while (tempDate <= endDate) {
      datesToUpdate.push(new Date(tempDate));
      tempDate.setDate(tempDate.getDate() + 1);
    }

    const transactions: InventoryTransaction[] = [];

    for (const date of datesToUpdate) {
      const avail = await this.availRepo.findOne({
        where: { unit_id: unitId, date }
      });

      const currentQuantity = avail?.available_count || unit.total_inventory;
      const quantityBefore = currentQuantity;
      const quantityAfter = Math.max(0, Math.min(unit.total_inventory, currentQuantity + quantity));
      const actualChange = quantityAfter - quantityBefore;

      // Lưu Availability
      if (avail) {
        avail.available_count = quantityAfter;
        await this.availRepo.save(avail);
      } else {
        await this.availRepo.save({
          unit_id: unitId,
          date,
          available_count: quantityAfter,
          booked_count: 0,
        });
      }

      // Lưu Transaction
      const transaction = this.transactionRepo.create({
        place_id: unit.place_id,
        unit_id: unitId,
        transaction_type: quantity > 0 ? TransactionType.RESTOCK : TransactionType.ADJUSTMENT,
        quantity_changed: actualChange,
        quantity_before: quantityBefore,
        quantity_after: quantityAfter,
        date_from: date,
        date_to: date,
        merchant_id: user?.sub,
        reason,
      });

      transactions.push(transaction);
    }

    await this.transactionRepo.insertMany(transactions);

    return {
      success: true,
      message: `Cập nhật ${datesToUpdate.length} ngày thành công`,
      transactions: transactions.length,
    };
  }

  // Lấy lịch sử giao dịch kho
  async getInventoryTransactions(placeId: string, unitId?: string, user?: any) {
    if (user && user.role !== Role.ADMIN) {
      const place = await this.placeRepo.findOne({ where: { _id: new ObjectId(placeId) } });
      if (place?.ownerId !== user.sub) throw new ForbiddenException('Không có quyền');
    }

    const query: any = { place_id: placeId };
    if (unitId) query.unit_id = unitId;

    return await this.transactionRepo.find({
      where: query,
      order: { created_at: -1 } as any,
    });
  }

  // ==========================================
  // VOUCHER MANAGEMENT (MERCHANT)
  // ==========================================

  // Tạo mã giảm giá
  async createVoucher(placeId: string, dto: any, user: any) {
    if (user.role !== Role.MERCHANT && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Chỉ Merchant và Admin mới có thể tạo voucher');
    }

    const place = await this.placeRepo.findOne({ where: { _id: new ObjectId(placeId) } });
    if (!place) throw new NotFoundException('Địa điểm không tồn tại');

    if (user.role === Role.MERCHANT && place.ownerId !== user.sub) {
      throw new ForbiddenException('Không có quyền quản lý voucher của địa điểm này');
    }

    // Kiểm tra mã unique
    const existing = await this.voucherRepo.findOne({
      where: { place_id: placeId, code: dto.code.toUpperCase() },
    });
    if (existing) throw new BadRequestException('Mã voucher đã tồn tại');

    const voucher = this.voucherRepo.create({
      ...dto,
      place_id: placeId,
      code: dto.code.toUpperCase(),
      usage_count: 0,
      status: VoucherStatus.ACTIVE,
    });

    return await this.voucherRepo.save(voucher);
  }

  // Lấy danh sách voucher của merchant
  async getVouchers(placeId: string, user?: any) {
    if (user && user.role === Role.MERCHANT) {
      const place = await this.placeRepo.findOne({ where: { _id: new ObjectId(placeId) } });
      if (place?.ownerId !== user.sub) throw new ForbiddenException('Không có quyền');
    }

    return await this.voucherRepo.find({
      where: { place_id: placeId },
      order: { created_at: -1 } as any,
    });
  }

  // Cập nhật voucher
  async updateVoucher(voucherId: string, dto: any, user?: any) {
    const voucher = await this.voucherRepo.findOne({
      where: { _id: new ObjectId(voucherId) },
    });
    if (!voucher) throw new NotFoundException('Voucher không tồn tại');

    if (user && user.role === Role.MERCHANT) {
      const place = await this.placeRepo.findOne({ where: { _id: new ObjectId(voucher.place_id) } });
      if (place?.ownerId !== user.sub) throw new ForbiddenException('Không có quyền');
    }

    Object.assign(voucher, dto);
    return await this.voucherRepo.save(voucher);
  }

  // Kiểm tra và áp dụng voucher
  async validateVoucher(code: string, placeId: string, orderValue: number) {
    const voucher = await this.voucherRepo.findOne({
      where: { code: code.toUpperCase(), place_id: placeId },
    });

    if (!voucher) throw new NotFoundException('Mã giảm giá không tồn tại');
    if (voucher.status !== VoucherStatus.ACTIVE) throw new BadRequestException('Mã giảm giá không còn hoạt động');

    const now = new Date();
    if (now < voucher.valid_from || now > voucher.valid_until) {
      throw new BadRequestException('Mã giảm giá đã hết hạn');
    }

    if (voucher.min_order_value && orderValue < voucher.min_order_value) {
      throw new BadRequestException(`Giá trị đơn hàng tối thiểu là ${voucher.min_order_value} VND`);
    }

    if (voucher.max_usage && voucher.usage_count >= voucher.max_usage) {
      throw new BadRequestException('Mã giảm giá đã hết lượt sử dụng');
    }

    // Tính toán giảm giá
    let discount = 0;
    if (voucher.type === 'FIXED') {
      discount = voucher.discount_value;
    } else if (voucher.type === 'PERCENT') {
      discount = Math.floor((orderValue * voucher.discount_value) / 100);
      if (voucher.max_discount) {
        discount = Math.min(discount, voucher.max_discount);
      }
    }

    return {
      voucher_id: voucher._id,
      discount_amount: discount,
      final_price: Math.max(0, orderValue - discount),
    };
  }

  // ==========================================
  // PROMOTION MANAGEMENT (MERCHANT)
  // ==========================================

  // Tạo chương trình khuyến mãi (Happy Hour, Flash Sale, v.v.)
  async createPromotion(placeId: string, dto: any, user: any) {
    if (user.role !== Role.MERCHANT && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Chỉ Merchant và Admin mới có thể tạo chương trình khuyến mãi');
    }

    const place = await this.placeRepo.findOne({ where: { _id: new ObjectId(placeId) } });
    if (!place) throw new NotFoundException('Địa điểm không tồn tại');

    if (user.role === Role.MERCHANT && place.ownerId !== user.sub) {
      throw new ForbiddenException('Không có quyền tạo khuyến mãi cho địa điểm này');
    }

    const promotion = this.promotionRepo.create({
      ...dto,
      place_id: placeId,
      status: PromotionStatus.DRAFT,
      total_usage: 0,
    });

    return await this.promotionRepo.save(promotion);
  }

  // Lấy danh sách chương trình khuyến mãi
  async getPromotions(placeId: string, user?: any) {
    if (user && user.role === Role.MERCHANT) {
      const place = await this.placeRepo.findOne({ where: { _id: new ObjectId(placeId) } });
      if (place?.ownerId !== user.sub) throw new ForbiddenException('Không có quyền');
    }

    return await this.promotionRepo.find({
      where: { place_id: placeId },
      order: { created_at: -1 } as any,
    });
  }

  // Kích hoạt/Vô hiệu hóa chương trình khuyến mãi
  async togglePromotion(promotionId: string, status: PromotionStatus, user?: any) {
    const promotion = await this.promotionRepo.findOne({
      where: { _id: new ObjectId(promotionId) },
    });
    if (!promotion) throw new NotFoundException('Chương trình khuyến mãi không tồn tại');

    if (user && user.role === Role.MERCHANT) {
      const place = await this.placeRepo.findOne({ where: { _id: new ObjectId(promotion.place_id) } });
      if (place?.ownerId !== user.sub) throw new ForbiddenException('Không có quyền');
    }

    promotion.status = status;
    return await this.promotionRepo.save(promotion);
  }

  // Kiểm tra chương trình khuyến mãi đang áp dụng
  async getActivePromotions(placeId: string, unitId?: string): Promise<Promotion[]> {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const hour = now.getHours();

    const query: any = {
      place_id: placeId,
      status: PromotionStatus.ACTIVE,
      valid_from: { $lte: now },
      valid_until: { $gte: now },
    };

    const promotions = await this.promotionRepo.find({ where: query });

    return promotions.filter((promo) => {
      // Kiểm tra vế ngày hôm nay
      if (promo.active_days.length > 0 && !promo.active_days.includes(dayOfWeek)) {
        return false;
      }

      // Kiểm tra giờ (nếu là HAPPY_HOUR)
      if (promo.type === 'HAPPY_HOUR' && promo.start_hour !== null && promo.end_hour !== null) {
        if (hour < promo.start_hour || hour >= promo.end_hour) {
          return false;
        }
      }

      // Kiểm tra ngày loại trừ
      if (promo.excluded_dates && promo.excluded_dates.some(d => d.toDateString() === now.toDateString())) {
        return false;
      }

      // Kiểm tra Unit applicable
      if (unitId && promo.applicable_units.length > 0 && !promo.applicable_units.includes(unitId)) {
        return false;
      }

      return true;
    });
  }
  
}