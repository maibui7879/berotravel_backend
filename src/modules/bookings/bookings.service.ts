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

  // ================= HIỂN THỊ KHO TRỐNG =================

  async getPlaceAvailability(placeId: string, checkIn: string, checkOut?: string) {
    const startDate = new Date(new Date(checkIn).setHours(0, 0, 0, 0));
    const endDate = checkOut ? new Date(new Date(checkOut).setHours(0, 0, 0, 0)) : new Date(startDate);
    
    // 1. Lấy tất cả các loại phòng/bàn của Place này
    const units = await this.unitRepo.find({ where: { place_id: placeId } });
    if (!units.length) return [];

    // 2. Với mỗi Unit, lấy thông tin Availability trong khoảng ngày
    return await Promise.all(units.map(async (unit) => {
      const dates: Date[] = [];
      const tempDate = new Date(startDate);
      
      // FIX LOGIC NGÀY: Khách sạn (ROOM/HOUSE) không tính đêm của ngày checkout
      const limitDate = (unit.unit_type === 'ROOM' || unit.unit_type === 'HOUSE') && checkOut 
                        ? endDate 
                        : new Date(endDate.getTime() + 1); // +1 để vòng lặp dưới chạy được nếu là nhà hàng

      while (tempDate < limitDate) {
        dates.push(new Date(tempDate));
        tempDate.setDate(tempDate.getDate() + 1);
      }

      const avails = await this.availRepo.find({
        where: {
          unit_id: unit._id.toString(),
          date: { $gte: startDate, $lte: limitDate } 
        }
      });

      // 3. Nhóm theo ngày và tính số lượng khả dụng
      const availabilityByDate = dates.map(date => {
        const founds = avails.filter(a => a.date.getTime() === date.getTime());
        
        // Nếu ko có record nào trong DB, mặc định lấy total_inventory
        let minAvailable = unit.total_inventory;
        if (founds.length > 0) {
           minAvailable = Math.min(...founds.map(f => f.available_count));
        }

        return {
          date: date.toISOString().split('T')[0],
          available_count: minAvailable,
          price: founds[0]?.price_override || unit.base_price,
          is_full: minAvailable <= 0
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
        status: 'PENDING',
      } as any);

      return await this.bookingRepo.save(booking);

    } catch (error) {
      // [ROLLBACK] Nếu có lỗi xảy ra (hết kho giữa chừng), hoàn lại chỗ cho các ngày đã trừ trước đó
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
      
      throw error;
    }
  }

  // ================= QUẢN LÝ KHO & ĐƠN HÀNG =================

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
    if (booking.status === 'CANCELLED') return { success: true }; // Tránh trừ/hủy 2 lần

    await this.bookingRepo.update(new ObjectId(id), { status: 'CANCELLED' });
    
    // TÍNH TOÁN LẠI DANH SÁCH NGÀY ĐỂ HOÀN TRẢ
    const startDate = new Date(booking.check_in);
    const datesToRefund: Date[] = [];

    if ((booking.booking_type === 'ROOM' || booking.booking_type === 'HOUSE') && booking.check_out) {
      const endDate = new Date(booking.check_out);
      const tempDate = new Date(startDate);
      while (tempDate < endDate) {
        datesToRefund.push(new Date(tempDate));
        tempDate.setDate(tempDate.getDate() + 1);
      }
    } else {
      datesToRefund.push(startDate);
    }

    // HOÀN TRẢ ATOMIC CHO TẤT CẢ CÁC NGÀY ĐÃ ĐẶT
    await Promise.all(
      datesToRefund.map(date => 
        this.availRepo.updateOne(
          { unit_id: booking.unit_id, date: date, time_slot: booking.time_slot || null },
          { $inc: { booked_count: -1, available_count: 1 } }
        )
      )
    );

    return { success: true };
  }
  
  // LƯU Ý KHI GỌI: Cần truyền thêm unitId từ service hành trình qua
async releaseBookingSlot(placeId: string, dateStr: string, quantity: number = 1) {
    if (!placeId || !dateStr) return; // Bảo vệ hàm

    // 1. Tìm Inventory Unit của Place
    const units = await this.unitRepo.find({ where: { place_id: placeId } });
    if (!units || units.length === 0) return; 

    // Vì JourneyStop không lưu unit_id cụ thể, tạm thời thao tác trên Unit đầu tiên giống logic cũ của bạn
    const unit = units[0];

    const targetDate = new Date(new Date(dateStr).setHours(0,0,0,0));

    // DÙNG ATOMIC $INC ĐỂ TRÁNH RACE CONDITION
    await this.availRepo.findOneAndUpdate(
      { unit_id: unit._id.toString(), date: targetDate },
      { 
        $inc: { 
          available_count: quantity, 
          booked_count: -quantity 
        } 
      }
    );
  }

  // ==========================================
  // INVENTORY MANAGEMENT (MERCHANT)
  // ==========================================

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

    // Kiểm quyền
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

    // FIX: Sử dụng UpdateOne với Upsert để chống Race Condition
    for (const date of datesToUpdate) {
      await this.availRepo.updateOne(
        { unit_id: unitId, date: date },
        { 
          $inc: { available_count: quantity },
          $setOnInsert: {
             booked_count: 0,
             // Lượng tồn kho mới khi tạo bản ghi = tổng có sẵn + số lượng điều chỉnh (giảm thì thành trừ)
             available_count: unit.total_inventory + quantity 
          }
        },
        { upsert: true }
      );

      const transaction = this.transactionRepo.create({
        place_id: unit.place_id,
        unit_id: unitId,
        transaction_type: quantity > 0 ? TransactionType.RESTOCK : TransactionType.ADJUSTMENT,
        quantity_changed: quantity,
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

  async createVoucher(placeId: string, dto: any, user: any) {
    if (user.role !== Role.MERCHANT && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Chỉ Merchant và Admin mới có thể tạo voucher');
    }

    const place = await this.placeRepo.findOne({ where: { _id: new ObjectId(placeId) } });
    if (!place) throw new NotFoundException('Địa điểm không tồn tại');

    if (user.role === Role.MERCHANT && place.ownerId !== user.sub) {
      throw new ForbiddenException('Không có quyền quản lý voucher của địa điểm này');
    }

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