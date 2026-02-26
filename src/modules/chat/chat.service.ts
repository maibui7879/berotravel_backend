import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ChatMessage, MessageType } from './entities/chat-message.entity';
import { ChatConversation, ConversationType } from './entities/chat.entity';
import { ObjectId } from 'mongodb';
import { SendMessageDto, SearchChatDto } from './dto/chat.dto';
import { JourneysService } from '../journey/services/journey.service';
import { User } from '../users/entities/user.entity'; 

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
  ) {}

  // 1. Lấy danh sách hội thoại của user
  async getUserConversations(userId: string) {
    return await this.conversationRepo.find({
      where: {
        participant_ids: userId // Mảng có chứa userId
      } as any,
      order: { updated_at: 'DESC' }
    });
  }

  // 2. Tìm hoặc tạo phòng chat 1-1
  async getOrCreateDirectRoom(user1Id: string, user2Id: string): Promise<ChatConversation> {
    let room = await this.conversationRepo.findOne({
      where: {
        type: ConversationType.DIRECT,
        participant_ids: { $all: [user1Id, user2Id] } as any
      }
    });

    if (!room) {
      room = this.conversationRepo.create({
        type: ConversationType.DIRECT,
        participant_ids: [user1Id, user2Id],
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
      const isMember = journey.members.some(m => m.user_id === userId);
      if (!isMember) throw new BadRequestException('Bạn không phải thành viên của hành trình này');
      
      let room = await this.conversationRepo.findOne({ where: { journey_id: dto.journey_id } });
      if (!room) {
        // Khởi tạo phòng cho chuyến đi nếu chưa có, đưa toàn bộ ID vào participant_ids
        const memberIds = journey.members.map(m => m.user_id);
        room = this.conversationRepo.create({ 
          type: ConversationType.JOURNEY, 
          journey_id: dto.journey_id,
          participant_ids: memberIds
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
      reply_to_id: dto.reply_to_id
    });

    const savedMsg = await this.chatRepo.save(message);

    // Cập nhật last_message của Conversation
    await this.conversationRepo.update(new ObjectId(roomId), { 
      last_message: dto.content || `[${dto.type}]`,
      updated_at: new Date()
    });

    return savedMsg;
  }

  // KIỂM TRA QUYỀN TRUY CẬP PHÒNG
  private async checkUserInRoom(roomId: string, userId: string) {
    const room = await this.conversationRepo.findOne({ where: { _id: new ObjectId(roomId) } });
    if (!room) throw new BadRequestException('Phòng chat không tồn tại');
    if (room.participant_ids && !room.participant_ids.includes(userId)) {
      throw new ForbiddenException('Bạn không có quyền truy cập vào phòng chat này');
    }
    return room;
  }

  // 4. Lấy danh sách tin nhắn
  async getMessages(roomId: string, userId: string, limit = 50) {
    await this.checkUserInRoom(roomId, userId);

    const messages = await this.chatRepo.find({
      where: { room_id: roomId },
      order: { created_at: 'DESC' },
      take: limit,
    } as any);
    return messages.reverse();
  }

  // 5. Kho Ảnh
  async getRoomImages(roomId: string, userId: string) {
    await this.checkUserInRoom(roomId, userId);
    return await this.chatRepo.find({
      where: { room_id: roomId, type: MessageType.IMAGE },
      order: { created_at: 'DESC' }
    } as any);
  }

  // 6. Kho Bình chọn
  async getRoomPolls(roomId: string, userId: string) {
    await this.checkUserInRoom(roomId, userId);
    return await this.chatRepo.find({
      where: { room_id: roomId, type: MessageType.POLL },
      order: { created_at: 'DESC' }
    } as any);
  }

  // 7. Tìm kiếm tin nhắn
  async searchMessages(roomId: string, userId: string, queryDto: SearchChatDto) {
    await this.checkUserInRoom(roomId, userId);

    const query: any = { room_id: roomId };
    if (queryDto.keyword) query.content = { $regex: queryDto.keyword, $options: 'i' };
    if (queryDto.sender_id) query.sender_id = queryDto.sender_id;

    return await this.chatRepo.find({
      where: query,
      order: { created_at: 'DESC' }
    } as any);
  }

  // 8. Vote Poll
  async votePoll(messageId: string, optionId: string, userId: string) {
    const message = await this.chatRepo.findOne({ where: { _id: new ObjectId(messageId) } });
    if (!message || message.type !== MessageType.POLL) throw new BadRequestException('Tin nhắn không phải Poll');

    const options = message.metadata.options || [];
    options.forEach(opt => {
      if (opt.voters) opt.voters = opt.voters.filter(v => v !== userId);
      else opt.voters = [];
    });

    const selectedOpt = options.find(opt => opt.id === optionId);
    if (selectedOpt) selectedOpt.voters.push(userId);

    message.metadata.options = options;
    await this.chatRepo.update({ _id: new ObjectId(messageId) } as any, { metadata: message.metadata });
    return await this.chatRepo.findOne({ where: { _id: new ObjectId(messageId) } });
  }

  // 9. React Message
  async reactMessage(messageId: string, userId: string, emoji: string) {
    const message = await this.chatRepo.findOne({ where: { _id: new ObjectId(messageId) } });
    if (!message) throw new BadRequestException('Tin nhắn không tồn tại');

    if (!message.reactions) message.reactions = [];

    const existingIndex = message.reactions.findIndex(r => r.userId === userId);
    if (existingIndex > -1) {
      if (message.reactions[existingIndex].emoji === emoji) {
        message.reactions.splice(existingIndex, 1);
      } else {
        message.reactions[existingIndex].emoji = emoji;
      }
    } else {
      message.reactions.push({ userId, emoji });
    }

    await this.chatRepo.update({ _id: new ObjectId(messageId) } as any, { reactions: message.reactions });
    
    return { messageId, reactions: message.reactions, room_id: message.room_id };
  }

  // 10. Xóa tin nhắn
  async deleteMessage(messageId: string) {
      await this.chatRepo.delete(new ObjectId(messageId));
      return { success: true };
  }
}