import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Notification } from './entities/notification.entity';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationsGateway } from './notification.gateway';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notifRepo: MongoRepository<Notification>,
    private readonly notificationsGateway: NotificationsGateway, // Inject Gateway
  ) {}

  // 1. TẠO & GỬI THÔNG BÁO (Dùng nội bộ cho các Service khác gọi)
  async createAndSend(dto: CreateNotificationDto) {
    // A. Lưu vào DB
    const notif = this.notifRepo.create({
      ...dto,
      is_read: false,
    });
    const savedNotif = await this.notifRepo.save(notif);

    // B. Bắn Socket Realtime
    this.notificationsGateway.sendToUser(dto.recipient_id, savedNotif);

    return savedNotif;
  }

  // 2. LẤY DANH SÁCH THÔNG BÁO CỦA USER
  async getUserNotifications(userId: string, limit = 20) {
    return await this.notifRepo.find({
      where: { recipient_id: userId },
      order: { created_at: 'DESC' },
      take: limit,
    } as any);
  }

  // 3. ĐÁNH DẤU ĐÃ ĐỌC
  async markAsRead(id: string, userId: string) {
    const notif = await this.notifRepo.findOne({ where: { _id: new ObjectId(id) } });
    if (!notif) throw new NotFoundException('Thông báo không tồn tại');

    if (notif.recipient_id !== userId) {
        throw new NotFoundException('Bạn không sở hữu thông báo này');
    }

    notif.is_read = true;
    return await this.notifRepo.save(notif);
  }

  // 4. ĐÁNH DẤU ĐÃ ĐỌC TẤT CẢ
  async markAllAsRead(userId: string) {
    await this.notifRepo.updateMany(
      { recipient_id: userId, is_read: false },
      { $set: { is_read: true } }
    );
    return { success: true };
  }
}