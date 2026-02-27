import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Friendship, FriendStatus } from './entities/friendship.entity';
import { User } from '../users/entities/user.entity';
@Injectable()
export class FriendsService {
  constructor(
    @InjectRepository(Friendship) private readonly friendRepo: MongoRepository<Friendship>,
    @InjectRepository(User) private readonly userRepo: MongoRepository<User>,
  ) {}

  // 1. Gửi lời mời kết bạn
  async sendRequest(requesterId: string, recipientId: string) {
    if (requesterId === recipientId) throw new BadRequestException('Không thể kết bạn với chính mình');

    const recipient = await this.userRepo.findOne({ where: { _id: new ObjectId(recipientId) } });
    if (!recipient) throw new NotFoundException('Người dùng không tồn tại');

    // Kiểm tra mối quan hệ hiện tại giữa 2 người
    const existing = await this.friendRepo.findOne({
      where: {
        $or: [
          { requester_id: requesterId, recipient_id: recipientId },
          { requester_id: recipientId, recipient_id: requesterId }
        ]
      } as any
    });

    if (existing) {
      if (existing.status === FriendStatus.ACCEPTED) throw new BadRequestException('Đã là bạn bè');
      if (existing.status === FriendStatus.BLOCKED) throw new BadRequestException('Không thể gửi lời mời');

      // Xử lý logic chồng chéo
      if (existing.status === FriendStatus.PENDING) {
        // Nếu mình là người NHẬN của lời mời cũ, mà giờ lại gửi lại -> Tự động CHẤP NHẬN
        if (existing.recipient_id === requesterId) {
          existing.status = FriendStatus.ACCEPTED;
          await this.friendRepo.save(existing);
          return { success: true, status: FriendStatus.ACCEPTED, message: 'Hai bạn đã trở thành bạn bè' };
        }
        // Nếu mình là người GỬI của lời mời cũ -> Báo lỗi như cũ
        throw new BadRequestException('Bạn đã gửi lời mời này trước đó rồi');
      }
    }

    // Nếu chưa có dữ liệu, tạo mới như bình thường
    const friendship = this.friendRepo.create({
      requester_id: requesterId,
      recipient_id: recipientId,
      status: FriendStatus.PENDING
    });

    return await this.friendRepo.save(friendship);
  }

async respondRequest(userId: string, friendshipId: string, status: FriendStatus) {
  const friendship = await this.friendRepo.findOne({ where: { _id: new ObjectId(friendshipId) } });
  
  if (!friendship) throw new NotFoundException('Lời mời không tồn tại');
  if (friendship.recipient_id !== userId) throw new BadRequestException('Bạn không có quyền xử lý');
  if (friendship.status !== FriendStatus.PENDING) throw new BadRequestException('Lời mời đã xử lý rồi');

  if (status === FriendStatus.ACCEPTED) {
    friendship.status = FriendStatus.ACCEPTED;
    await this.friendRepo.save(friendship);
    return { success: true, status: FriendStatus.ACCEPTED };
  } else {
    await this.friendRepo.delete(friendship._id);
    return { success: true, message: 'Đã từ chối lời mời' };
  }
}

// 6. Tính năng Chặn người dùng (Tách riêng)
async blockUser(userId: string, targetId: string) {
  if (userId === targetId) throw new BadRequestException('Không thể tự chặn chính mình');

  // Kiểm tra xem đã có mối quan hệ nào chưa (bạn bè, pending, hoặc đã block)
  let friendship = await this.friendRepo.findOne({
    where: {
      $or: [
        { requester_id: userId, recipient_id: targetId },
        { requester_id: targetId, recipient_id: userId }
      ]
    } as any
  });

  if (friendship) {
    // Cập nhật lại: người thực hiện block luôn là requester_id trong bản ghi BLOCKED
    friendship.requester_id = userId;
    friendship.recipient_id = targetId;
    friendship.status = FriendStatus.BLOCKED;
  } else {
    // Tạo mới bản ghi block
    friendship = this.friendRepo.create({
      requester_id: userId,
      recipient_id: targetId,
      status: FriendStatus.BLOCKED
    });
  }

  return await this.friendRepo.save(friendship);
}
  // 3. Hủy kết bạn
  async unfriend(userId: string, targetId: string) {
    const friendship = await this.friendRepo.findOne({
        where: {
          $or: [
            { requester_id: userId, recipient_id: targetId },
            { requester_id: targetId, recipient_id: userId }
          ]
        } as any
    });
    
    if (friendship) {
        await this.friendRepo.delete(friendship._id);
    }
    return { success: true };
  }

  // 4. Lấy danh sách bạn bè
  async getMyFriends(userId: string) {
    // Tìm tất cả record có dính tới mình và status = ACCEPTED
    const connections = await this.friendRepo.find({
        where: {
            $or: [
                { requester_id: userId, status: FriendStatus.ACCEPTED },
                { recipient_id: userId, status: FriendStatus.ACCEPTED }
            ]
        } as any
    });

    // Lấy ra ID của người kia
    const friendIds = connections.map(c => 
        c.requester_id === userId ? c.recipient_id : c.requester_id
    );

    if (friendIds.length === 0) return [];

    // Query User Info
    const friends = await this.userRepo.find({
        where: { _id: { $in: friendIds.map(id => new ObjectId(id)) } } as any,
        select: ['_id', 'fullName', 'avatar', 'email'] // Chỉ lấy info cơ bản
    });

    return friends;
  }

  // 5. Lấy danh sách lời mời đã nhận (Pending Requests)
  async getPendingRequests(userId: string) {
    const requests = await this.friendRepo.find({
        where: { recipient_id: userId, status: FriendStatus.PENDING }
    });

    // Populate info người gửi
    const senderIds = requests.map(r => new ObjectId(r.requester_id));
    const senders = await this.userRepo.find({
        where: { _id: { $in: senderIds } } as any,
        select: ['_id', 'fullName', 'avatar']
    });

    return requests.map(req => {
        const sender = senders.find(s => s._id.toString() === req.requester_id);
        return { ...req, sender };
    });
  }
  async unblock(userId: string, targetId: string) {
  const friendship = await this.friendRepo.findOne({
    where: {
      requester_id: userId,
      recipient_id: targetId,
      status: FriendStatus.BLOCKED
    } as any
  });

  if (!friendship) {
    throw new NotFoundException('Không tìm thấy bản ghi chặn người dùng này');
  }

  await this.friendRepo.delete(friendship._id);
  return { success: true, message: 'Đã gỡ chặn thành công' };
}

}