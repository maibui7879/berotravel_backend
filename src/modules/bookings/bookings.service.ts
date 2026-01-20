import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Booking } from './entities/booking.entity';
import { InventoryUnit } from './entities/inventory-unit.entity';
import { Availability } from './entities/availability.entity';
import { Place } from '../places/entities/place.entity';
import { Role } from 'src/common/constants';

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Booking) private readonly bookingRepo: MongoRepository<Booking>,
    @InjectRepository(InventoryUnit) private readonly unitRepo: MongoRepository<InventoryUnit>,
    @InjectRepository(Availability) private readonly availRepo: MongoRepository<Availability>,
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
      // Khách sạn: Chỉ trừ kho đến TRƯỚC ngày check-out (ngày trả phòng khách mới có thể vào)
      const tempDate = new Date(startDate);
      while (tempDate < endDate) {
        datesToBook.push(new Date(tempDate));
        tempDate.setDate(tempDate.getDate() + 1);
      }
    } else {
      datesToBook.push(startDate); // Nhà hàng: Chỉ tính 1 ngày
    }

    if (datesToBook.length === 0) throw new BadRequestException('Ngày đặt không hợp lệ');

    // 2. ATOMIC UPDATE cho từng ngày
    let totalCalculatedPrice = 0;
    for (const date of datesToBook) {
      const result = await this.availRepo.findOneAndUpdate(
        {
          unit_id: unit_id.toString(),
          date: date,
          time_slot: time_slot || null,
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
      if (!currentAvail || currentAvail.available_count < 0) {
        throw new BadRequestException(`Rất tiếc, ngày ${date.toLocaleDateString()} đã hết chỗ`);
      }
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
      status: 'CONFIRMED',
    } as any);

    return await this.bookingRepo.save(booking);
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
}