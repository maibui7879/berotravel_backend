import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ChatMessage, MessageType } from './entities/chat-message.entity';
import { ChatConversation, ConversationType } from './entities/chat.entity';
import { ObjectId } from 'mongodb';
import { SendMessageDto, SearchChatDto } from './dto/chat.dto';
import { JourneysService } from '../journey/services/journey.service';
import { User } from '../users/entities/user.entity';
import { NotificationsService } from '../notification/notification.service';
import { NotificationType } from '../notification/entities/notification.entity'; // Sửa lại đường dẫn relative cho chuẩn
@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatMessage)
    private readonly chatRepo: MongoRepository<ChatMessage>,

    @InjectRepository(ChatConversation)
    private readonly conversationRepo: MongoRepository<ChatConversation>,

    @InjectRepository(User)
    private readonly userRepo: MongoRepository<User>,

    private readonly journeysService: JourneysService,

    private readonly notificationsService: NotificationsService,
  ) {}

  // 1. Lấy danh sách hội thoại của user
  async getUserConversations(userId: string) {
    return await this.conversationRepo.find({
      where: {
        participant_ids: userId,
      } as any,
      order: { updated_at: 'DESC' },
    });
  }

  // 2. Tìm hoặc tạo phòng chat 1-1
  async getOrCreateDirectRoom(user1Id: string, user2Id: string): Promise<ChatConversation> {
    const u1 = String(user1Id);
    const u2 = String(user2Id);

    let room = await this.conversationRepo.findOne({
      where: {
        type: ConversationType.DIRECT,
        $or: [{ participant_ids: [u1, u2] }, { participant_ids: [u2, u1] }],
      } as any,
    });

    if (!room) {
      room = this.conversationRepo.create({
        type: ConversationType.DIRECT,
        participant_ids: [u1, u2],
      });
      room = await this.conversationRepo.save(room);
    }
    return room;
  }

  // 3. Lưu tin nhắn (Đa năng cho cả Nhóm & Cá nhân)
  async saveMessage(userId: string, dto: SendMessageDto) {
    let roomId = dto.room_id;
    let roomType = ConversationType.DIRECT;

    // A. Nếu nhắn vào chuyến đi (Journey)
    if (dto.journey_id) {
      const journey = await this.journeysService.findOne(dto.journey_id);
      if (!journey) throw new BadRequestException('Không tìm thấy chuyến đi');

      const members = journey.members || [];

      // Kiểm tra thành viên
      const isMember = members.some((m) => {
        if (!m) return false;
        const idInDb = m.user_id || (m as any).userId || m;
        return String(idInDb) === String(userId);
      });

      // Đặc cách cho chủ chuyến đi
      const isOwner = journey.owner_id && String(journey.owner_id) === String(userId);

      if (!isMember && !isOwner) {
        throw new BadRequestException('Bạn không phải thành viên của hành trình này');
      }

      let room = await this.conversationRepo.findOne({ where: { journey_id: dto.journey_id } });
      if (!room) {
        // Khởi tạo phòng cho chuyến đi nếu chưa có
        const memberIds = members.map((m) => String(m.user_id || (m as any).userId || m));
        if (journey.owner_id && !memberIds.includes(String(journey.owner_id))) {
          memberIds.push(String(journey.owner_id));
        }

        room = this.conversationRepo.create({
          type: ConversationType.JOURNEY,
          journey_id: dto.journey_id,
          participant_ids: memberIds,
        });
        room = await this.conversationRepo.save(room);
      }
      roomId = String(room._id);
      roomType = ConversationType.JOURNEY;
    }
    // B. Nếu nhắn 1-1
    else if (dto.receiver_id) {
      const room = await this.getOrCreateDirectRoom(userId, dto.receiver_id);
      roomId = String(room._id);
    }
    // C. Hoặc đã biết roomId trước
    else if (!roomId) {
      throw new BadRequestException('Phải cung cấp journey_id, receiver_id hoặc room_id');
    }

    const sender = await this.userRepo.findOne({ where: { _id: new ObjectId(userId) } });

    // Tạo tin nhắn mới
    const message = this.chatRepo.create({
      room_id: roomId,
      room_type: roomType,
      sender_id: userId,
      sender_name: sender?.fullName || 'Unknown',
      sender_avatar: sender?.avatar || undefined,
      content: dto.content || '',
      type: dto.type,
      metadata: dto.metadata,
      reply_to_id: dto.reply_to_id,
    });

    const savedMsg = await this.chatRepo.save(message);

    if (dto.receiver_id) {
      await this.notificationsService.createAndSend({
        recipient_id: dto.receiver_id,
        sender_id: userId,
        sender_avatar: sender?.avatar,
        type: NotificationType.NEW_MESSAGE, // Enum có sẵn trong notification.entity.ts
        title: `Tin nhắn mới từ ${sender?.fullName}`,
        message: dto.content || 'Bạn có một hình ảnh mới',
        metadata: { room_id: roomId, type: 'DIRECT_CHAT' }
      });
    }
    // Cập nhật last_message của Conversation
    await this.conversationRepo.update(new ObjectId(roomId), {
      last_message: dto.content || `[${dto.type}]`,
      updated_at: new Date(),
    });

    return savedMsg;
  }

  // KIỂM TRA QUYỀN TRUY CẬP PHÒNG
public async checkUserInRoom(roomId: string, userId: string) {
    const room = await this.conversationRepo.findOne({ where: { _id: new ObjectId(roomId) } });
    if (!room) throw new BadRequestException('Phòng chat không tồn tại');

    // [VÁ LỖI ĐỒNG BỘ MEMBER]: Kiểm tra với phòng chat Hành trình
    if (room.type === ConversationType.JOURNEY && room.journey_id) {
       // Lấy thông tin chuyến đi mới nhất
       const journey = await this.journeysService.findOne(room.journey_id).catch(() => null);
       if (!journey) throw new ForbiddenException('Chuyến đi không tồn tại');
       
       const isMember = journey.members.some(m => String(m.user_id) === String(userId));
       const isOwner = String(journey.owner_id) === String(userId);
       
       if (!isMember && !isOwner) {
         throw new ForbiddenException('Bạn không còn là thành viên của hành trình này');
       }
       
       // Tự động đồng bộ mảng participant_ids cho bảng Chat
       const newParticipantIds = journey.members.map(m => String(m.user_id));
       if (journey.owner_id && !newParticipantIds.includes(String(journey.owner_id))) {
         newParticipantIds.push(String(journey.owner_id));
       }
       
       // So sánh, nếu danh sách cũ bị lệch so với danh sách mới thì lưu lại
       if (JSON.stringify(room.participant_ids) !== JSON.stringify(newParticipantIds)) {
          room.participant_ids = newParticipantIds;
          await this.conversationRepo.save(room);
       }
    } 
    // Nếu là phòng chat 1-1 (DIRECT)
    else {
      if (room.participant_ids && !room.participant_ids.includes(userId)) {
        throw new ForbiddenException('Bạn không có quyền truy cập vào phòng chat này');
      }
    }

    return room;
  }

  // 4. Lấy danh sách tin nhắn - Đã sửa lỗi Lookup & Collection name
  async getMessages(roomId: string, userId: string, limit = 50) {
    await this.checkUserInRoom(roomId, userId);

    return await this.chatRepo
      .aggregate([
        { $match: { room_id: roomId } },
        {
          $addFields: {
            // Ép kiểu sender_id về ObjectId để so khớp với users._id
            sender_id_obj: { $toObjectId: '$sender_id' },
          },
        },
        {
          $lookup: {
            from: 'users', // Collection chính xác là 'users'
            localField: 'sender_id_obj',
            foreignField: '_id',
            as: 'senderDetails',
          },
        },
        {
          $unwind: {
            path: '$senderDetails',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 1,
            room_id: 1,
            room_type: 1,
            sender_id: 1,
            content: 1,
            type: 1,
            metadata: 1,
            reply_to_id: 1,
            reactions: 1,
            created_at: 1,
            sender: {
              id: '$senderDetails._id',
              fullName: '$senderDetails.fullName',
              avatar: '$senderDetails.avatar',
            },
          },
        },
        { $sort: { created_at: 1 } },
        { $limit: limit },
      ])
      .toArray();
  }

  // 5. Kho Ảnh
  async getRoomImages(roomId: string, userId: string) {
    await this.checkUserInRoom(roomId, userId);

    return await this.chatRepo
      .aggregate([
        { $match: { room_id: roomId, type: MessageType.IMAGE } },
        {
          $addFields: {
            sender_id_obj: { $toObjectId: '$sender_id' },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: 'sender_id_obj',
            foreignField: '_id',
            as: 'senderDetails',
          },
        },
        {
          $unwind: {
            path: '$senderDetails',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 1,
            room_id: 1,
            sender_id: 1,
            content: 1,
            type: 1,
            metadata: 1,
            created_at: 1,
            sender: {
              id: '$senderDetails._id',
              fullName: '$senderDetails.fullName',
              avatar: '$senderDetails.avatar',
            },
          },
        },
        { $sort: { created_at: -1 } },
      ])
      .toArray();
  }

  // 6. Kho Bình chọn
  async getRoomPolls(roomId: string, userId: string) {
    await this.checkUserInRoom(roomId, userId);

    return await this.chatRepo
      .aggregate([
        { $match: { room_id: roomId, type: MessageType.POLL } },
        {
          $addFields: {
            sender_id_obj: { $toObjectId: '$sender_id' },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: 'sender_id_obj',
            foreignField: '_id',
            as: 'senderDetails',
          },
        },
        {
          $unwind: {
            path: '$senderDetails',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 1,
            room_id: 1,
            sender_id: 1,
            content: 1,
            type: 1,
            metadata: 1,
            created_at: 1,
            sender: {
              id: '$senderDetails._id',
              fullName: '$senderDetails.fullName',
              avatar: '$senderDetails.avatar',
            },
          },
        },
        { $sort: { created_at: -1 } },
      ])
      .toArray();
  }

  // 7. Tìm kiếm tin nhắn
  async searchMessages(roomId: string, userId: string, queryDto: SearchChatDto) {
    await this.checkUserInRoom(roomId, userId);

    const query: any = { room_id: roomId };
    if (queryDto.keyword) query.content = { $regex: queryDto.keyword, $options: 'i' };
    if (queryDto.sender_id) query.sender_id = queryDto.sender_id;

    return await this.chatRepo
      .aggregate([
        { $match: query },
        {
          $addFields: {
            sender_id_obj: { $toObjectId: '$sender_id' },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: 'sender_id_obj',
            foreignField: '_id',
            as: 'senderDetails',
          },
        },
        {
          $unwind: {
            path: '$senderDetails',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 1,
            room_id: 1,
            sender_id: 1,
            content: 1,
            type: 1,
            metadata: 1,
            created_at: 1,
            sender: {
              id: '$senderDetails._id',
              fullName: '$senderDetails.fullName',
              avatar: '$senderDetails.avatar',
            },
          },
        },
        { $sort: { created_at: -1 } },
      ])
      .toArray();
  }

  // 8. Vote Poll
  async votePoll(messageId: string, optionId: string, userId: string) {
    const message = await this.chatRepo.findOne({ where: { _id: new ObjectId(messageId) } });
    if (!message || message.type !== MessageType.POLL) throw new BadRequestException('Tin nhắn không phải Poll');

    const options = message.metadata.options || [];
    options.forEach((opt) => {
      if (opt.voters) opt.voters = opt.voters.filter((v) => v !== userId);
      else opt.voters = [];
    });

    const selectedOpt = options.find((opt) => opt.id === optionId);
    if (selectedOpt) selectedOpt.voters.push(userId);

    message.metadata.options = options;
    return await this.chatRepo.save(message);
  }

  // 9. React Message
  async reactMessage(messageId: string, userId: string, emoji: string) {
    const message = await this.chatRepo.findOne({ where: { _id: new ObjectId(messageId) } });
    if (!message) throw new BadRequestException('Tin nhắn không tồn tại');

    if (!message.reactions) message.reactions = [];

    const existingIndex = message.reactions.findIndex((r) => r.userId === userId);
    if (existingIndex > -1) {
      if (message.reactions[existingIndex].emoji === emoji) {
        message.reactions.splice(existingIndex, 1);
      } else {
        message.reactions[existingIndex].emoji = emoji;
      }
    } else {
      message.reactions.push({ userId, emoji });
    }

    await this.chatRepo.save(message);

    return { messageId, reactions: message.reactions, room_id: message.room_id };
  }

  // Tìm hoặc tạo phòng chat cho Chuyến đi (Journey)
  async getOrCreateJourneyRoom(journeyId: string, userId: string): Promise<string> {
    const journey = await this.journeysService.findOne(journeyId);
    if (!journey) throw new BadRequestException('Không tìm thấy chuyến đi');

    const members = journey.members || [];
    const isMember = members.some((m) => {
      if (!m) return false;
      const idInDb = m.user_id || (m as any).userId || m;
      return String(idInDb) === String(userId);
    });
    const isOwner = journey.owner_id && String(journey.owner_id) === String(userId);

    if (!isMember && !isOwner) {
      throw new ForbiddenException('Bạn không phải thành viên của hành trình này');
    }

    let room = await this.conversationRepo.findOne({ where: { journey_id: journeyId } });
    if (!room) {
      const memberIds = members.map((m) => String(m.user_id || (m as any).userId || m));
      if (journey.owner_id && !memberIds.includes(String(journey.owner_id))) {
        memberIds.push(String(journey.owner_id));
      }

      room = this.conversationRepo.create({
        type: ConversationType.JOURNEY,
        journey_id: journeyId,
        participant_ids: memberIds,
      });
      room = await this.conversationRepo.save(room);
    }

    const rawId = room._id || (room as any).id;
    return rawId ? rawId.toString() : String(rawId);
  }

  // 10. Xóa tin nhắn
  async deleteMessage(messageId: string) {
    await this.chatRepo.delete(new ObjectId(messageId));
    return { success: true };
  }
}