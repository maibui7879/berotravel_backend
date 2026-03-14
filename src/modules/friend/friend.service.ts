import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Friendship, FriendStatus } from './entities/friendship.entity';
import { User } from '../users/entities/user.entity';
import { ChatService } from '../chat/chat.service';

@Injectable()
export class FriendsService {
  constructor(
    @InjectRepository(Friendship) private readonly friendRepo: MongoRepository<Friendship>,
    @InjectRepository(User) private readonly userRepo: MongoRepository<User>,
    private readonly chatService: ChatService,
  ) {}

  // ==========================================
  // 1. GỬI LỜI MỜI KẾT BẠN
  // ==========================================
  async sendRequest(requesterId: string, recipientId: string) {
    if (requesterId === recipientId) {
      throw new BadRequestException('Không thể kết bạn với chính mình');
    }

    const recipient = await this.userRepo.findOne({ where: { _id: new ObjectId(recipientId) } });
    if (!recipient) {
      throw new NotFoundException('Người dùng không tồn tại');
    }

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
      if (existing.status === FriendStatus.ACCEPTED) {
        throw new BadRequestException('Đã là bạn bè');
      }
      if (existing.status === FriendStatus.BLOCKED) {
        throw new BadRequestException('Không thể gửi lời mời. Người dùng này đã bị chặn hoặc đã chặn bạn.');
      }

      // Xử lý logic chồng chéo khi có lời mời đang chờ (PENDING)
      if (existing.status === FriendStatus.PENDING) {
        // TH1: Mình là người NHẬN của lời mời cũ, mà giờ lại gửi lại -> Tự động CHẤP NHẬN
        if (existing.recipient_id === requesterId) {
          existing.status = FriendStatus.ACCEPTED;
          await this.friendRepo.save(existing);
          
          // Tự động tạo room chat
          await this.chatService.getOrCreateDirectRoom(existing.requester_id, existing.recipient_id);
          
          return { success: true, status: FriendStatus.ACCEPTED, message: 'Hai bạn đã trở thành bạn bè', chat_created: true };
        }
        
        // TH2: Mình là người GỬI của lời mời cũ -> Báo lỗi
        throw new BadRequestException('Bạn đã gửi lời mời này trước đó rồi');
      }
    }

    // Nếu chưa có dữ liệu, tạo mới lời mời
    const friendship = this.friendRepo.create({
      requester_id: requesterId,
      recipient_id: recipientId,
      status: FriendStatus.PENDING
    });

    await this.friendRepo.save(friendship);
    
    return { success: true, status: FriendStatus.PENDING, message: 'Đã gửi lời mời kết bạn' };
  }

  // ==========================================
  // 2. PHẢN HỒI LỜI MỜI KẾT BẠN (Chấp nhận / Từ chối)
  // ==========================================
  async respondRequest(userId: string, friendshipId: string, status: FriendStatus) {
    const friendship = await this.friendRepo.findOne({ where: { _id: new ObjectId(friendshipId) } });
    
    if (!friendship) throw new NotFoundException('Lời mời không tồn tại');
    if (friendship.recipient_id !== userId) throw new BadRequestException('Bạn không có quyền xử lý lời mời này');
    if (friendship.status !== FriendStatus.PENDING) throw new BadRequestException('Lời mời này đã được xử lý rồi');

    // Chấp nhận
    if (status === FriendStatus.ACCEPTED) {
      friendship.status = FriendStatus.ACCEPTED;
      await this.friendRepo.save(friendship);
      
      // Tự động tạo room chat cho 2 người bạn
      await this.chatService.getOrCreateDirectRoom(friendship.requester_id, friendship.recipient_id);
      
      return { success: true, status: FriendStatus.ACCEPTED, message: 'Đã chấp nhận lời mời', chat_created: true };
    } 
    // Từ chối (Xóa bản ghi)
    else {
      await this.friendRepo.delete(friendship._id);
      return { success: true, message: 'Đã từ chối lời mời' };
    }
  }

  // ==========================================
  // 3. HỦY KẾT BẠN
  // ==========================================
  async unfriend(userId: string, targetId: string) {
    const friendship = await this.friendRepo.findOne({
      where: {
        $or: [
          { requester_id: userId, recipient_id: targetId, status: FriendStatus.ACCEPTED },
          { requester_id: targetId, recipient_id: userId, status: FriendStatus.ACCEPTED }
        ]
      } as any
    });
    
    if (!friendship) {
      throw new BadRequestException('Hai người hiện không phải là bạn bè');
    }

    await this.friendRepo.delete(friendship._id);
    return { success: true, message: 'Đã hủy kết bạn' };
  }

  // ==========================================
  // 4. LẤY DANH SÁCH BẠN BÈ (ACCEPTED)
  // ==========================================
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

    if (connections.length === 0) return [];

    // Lấy ra ID của người bạn
    const friendIds = connections.map(c => 
      c.requester_id === userId ? c.recipient_id : c.requester_id
    );

    // Query thông tin User của những người bạn đó
    const friends = await this.userRepo.find({
      where: { _id: { $in: friendIds.map(id => new ObjectId(id)) } } as any,
      select: ['_id', 'fullName', 'avatar', 'email'] // Chỉ lấy thông tin cơ bản để bảo mật
    });

    return friends.map(friend => ({
  _id: friend._id,
  fullName: friend.fullName,
  email: friend.email,
  avatar: friend.avatar || null 
  }));
  }

  // ==========================================
  // 5. LẤY DANH SÁCH LỜI MỜI CHƯA XỬ LÝ (PENDING)
  // ==========================================
  async getPendingRequests(userId: string) {
    // Chỉ lấy những lời mời mà mình là người NHẬN
    const requests = await this.friendRepo.find({
      where: { recipient_id: userId, status: FriendStatus.PENDING }
    });

    if (requests.length === 0) return [];

    // Populate thông tin người GỬI
    const senderIds = requests.map(r => new ObjectId(r.requester_id));
    const senders = await this.userRepo.find({
      where: { _id: { $in: senderIds } } as any,
      select: ['_id', 'fullName', 'avatar']
    });

    // Map dữ liệu lại để trả về cho Front-end
    return requests.map(req => {
      const senderInfo = senders.find(s => s._id.toString() === req.requester_id);
      return { 
        id: req._id, // ID của lời mời
        requester_id: req.requester_id,
        recipient_id: req.recipient_id,
        status: req.status,
        created_at: (req as any).created_at,
        sender: senderInfo || null // Dữ liệu của người gửi
      };
    });
  }

  // ==========================================
  // 6. CHẶN NGƯỜI DÙNG (BLOCK)
  // ==========================================
  async blockUser(userId: string, targetId: string) {
    if (userId === targetId) {
      throw new BadRequestException('Không thể tự chặn chính mình');
    }

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
      // Nếu đã bị chặn sẵn thì không làm gì thêm
      if (friendship.status === FriendStatus.BLOCKED && friendship.requester_id === userId) {
        return { success: true, message: 'Người dùng này đã bị chặn từ trước' };
      }

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

    await this.friendRepo.save(friendship);
    return { success: true, message: 'Đã chặn người dùng' };
  }

  // ==========================================
  // 7. BỎ CHẶN NGƯỜI DÙNG (UNBLOCK)
  // ==========================================
  async unblock(userId: string, targetId: string) {
    const friendship = await this.friendRepo.findOne({
      where: {
        requester_id: userId, // Chỉ người block mới có quyền gỡ block
        recipient_id: targetId,
        status: FriendStatus.BLOCKED
      } as any
    });

    if (!friendship) {
      throw new NotFoundException('Không tìm thấy bản ghi chặn người dùng này (hoặc bạn không phải người chặn)');
    }

    // Xóa bản ghi block, hai người quay về trạng thái "người lạ"
    await this.friendRepo.delete(friendship._id);
    return { success: true, message: 'Đã gỡ chặn thành công' };
  }
}