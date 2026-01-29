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

    // Check existing
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
      if (existing.status === FriendStatus.PENDING) throw new BadRequestException('Đã có lời mời đang chờ');
      if (existing.status === FriendStatus.BLOCKED) throw new BadRequestException('Không thể gửi lời mời');
    }

    const friendship = this.friendRepo.create({
      requester_id: requesterId,
      recipient_id: recipientId,
      status: FriendStatus.PENDING
    });

    return await this.friendRepo.save(friendship);
  }

  // 2. Chấp nhận / Chặn / Từ chối
  async respondRequest(userId: string, friendshipId: string, status: FriendStatus) {
    const friendship = await this.friendRepo.findOne({ where: { _id: new ObjectId(friendshipId) } });
    
    if (!friendship) throw new NotFoundException('Lời mời không tồn tại');
    if (friendship.recipient_id !== userId) throw new BadRequestException('Bạn không có quyền xử lý lời mời này');
    if (friendship.status !== FriendStatus.PENDING) throw new BadRequestException('Lời mời đã được xử lý trước đó');

    // Nếu từ chối thì xóa luôn record để có thể gửi lại sau này (hoặc giữ lại làm lịch sử tùy logic)
    // Ở đây giả sử Accept
    friendship.status = status;
    await this.friendRepo.save(friendship);

    // [TODO] Nếu Accepted -> Sync vào UserTravelProfile.friend_ids để thuật toán gợi ý chạy nhanh hơn
    
    return { success: true, status };
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
}