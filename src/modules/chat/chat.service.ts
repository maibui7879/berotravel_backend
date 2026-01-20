import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ChatMessage, MessageType } from './entities/chat-message.entity';
import { ObjectId } from 'mongodb';
import { SendMessageDto, SearchChatDto } from './dto/chat.dto';
import { GroupsService } from '../group/group.service';
// [FIX 1] Import User Entity
import { User } from '../users/entities/user.entity'; 

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatMessage)
    private readonly chatRepo: MongoRepository<ChatMessage>,
    
    // [FIX 2] Inject User Repository để lấy thông tin người gửi
    @InjectRepository(User)
    private readonly userRepo: MongoRepository<User>,

    private readonly groupsService: GroupsService,
  ) {}

  // 1. LƯU TIN NHẮN (ĐÃ FIX: LƯU KÈM TÊN VÀ AVATAR)
  async saveMessage(userId: string, dto: SendMessageDto) {
    // Check user có trong nhóm không
    await this.groupsService.findOne(dto.group_id, userId); 

    // [FIX 3] Lấy thông tin User
    const sender = await this.userRepo.findOne({ where: { _id: new ObjectId(userId) } });

    const message = this.chatRepo.create({
      group_id: dto.group_id,
      sender_id: userId,
      
      // Map thông tin User vào tin nhắn (Denormalization)
      sender_name: sender?.fullName || 'Unknown',
      sender_avatar: sender?.avatar || undefined, // Giả sử User có field avatar
      // Giả sử User có field avatar

      content: dto.content || '',
      type: dto.type,
      metadata: dto.metadata,
      reply_to_id: dto.reply_to_id
    });

    return await this.chatRepo.save(message);
  }

  // 2. VOTE POLL
  async votePoll(messageId: string, optionId: string, userId: string) {
    const message = await this.chatRepo.findOne({ where: { _id: new ObjectId(messageId) } });
    if (!message || message.type !== MessageType.POLL) throw new BadRequestException('Tin nhắn không phải Poll');

    const options = message.metadata.options || [];
    
    // Logic: Single Choice (Xóa vote cũ -> Thêm vote mới)
    options.forEach(opt => {
      if (opt.voters) {
        opt.voters = opt.voters.filter(v => v !== userId);
      } else {
        opt.voters = [];
      }
    });

    const selectedOpt = options.find(opt => opt.id === optionId);
    if (selectedOpt) selectedOpt.voters.push(userId);

    message.metadata.options = options;
    
    // Update DB
    await this.chatRepo.update({ _id: new ObjectId(messageId) } as any, { metadata: message.metadata });
    return await this.chatRepo.findOne({ where: { _id: new ObjectId(messageId) } });
  }

  // 3. REACT MESSAGE
  async reactMessage(messageId: string, userId: string, emoji: string) {
    const message = await this.chatRepo.findOne({ where: { _id: new ObjectId(messageId) } });
    if (!message) throw new BadRequestException('Tin nhắn không tồn tại');

    if (!message.reactions) message.reactions = [];

    const existingIndex = message.reactions.findIndex(r => r.userId === userId);

    if (existingIndex > -1) {
      if (message.reactions[existingIndex].emoji === emoji) {
        // Toggle Off (Gỡ)
        message.reactions.splice(existingIndex, 1);
      } else {
        // Update mới
        message.reactions[existingIndex].emoji = emoji;
      }
    } else {
      // Add mới
      message.reactions.push({ userId, emoji });
    }

    await this.chatRepo.update({ _id: new ObjectId(messageId) } as any, { reactions: message.reactions });
    
    return { 
      messageId, 
      reactions: message.reactions 
    };
  }

  // 4. LẤY LỊCH SỬ TIN NHẮN
  async getMessages(groupId: string, userId: string, limit = 50) {
    await this.groupsService.findOne(groupId, userId);
    const messages = await this.chatRepo.find({
      where: { group_id: groupId },
      order: { created_at: 'DESC' },
      take: limit,
    } as any);
    return messages.reverse();
  }

  // 5. LẤY KHO ẢNH (GALLERY)
  async getGroupImages(groupId: string, userId: string) {
    await this.groupsService.findOne(groupId, userId);
    return await this.chatRepo.find({
      where: { group_id: groupId, type: MessageType.IMAGE },
      order: { created_at: 'DESC' }
    } as any);
  }

  // 6. LẤY DANH SÁCH POLLS
  async getGroupPolls(groupId: string, userId: string) {
    await this.groupsService.findOne(groupId, userId);
    return await this.chatRepo.find({
      where: { group_id: groupId, type: MessageType.POLL },
      order: { created_at: 'DESC' }
    } as any);
  }

  // 7. TÌM KIẾM TIN NHẮN
  async searchMessages(groupId: string, userId: string, queryDto: SearchChatDto) {
    await this.groupsService.findOne(groupId, userId);

    const query: any = { group_id: groupId };
    if (queryDto.keyword) query.content = { $regex: queryDto.keyword, $options: 'i' };
    if (queryDto.sender_id) query.sender_id = queryDto.sender_id;

    return await this.chatRepo.find({
      where: query,
      order: { created_at: 'DESC' }
    } as any);
  }

  // 8. XÓA TIN NHẮN
  async deleteMessage(messageId: string) {
      await this.chatRepo.delete(new ObjectId(messageId));
      return { success: true };
  }
}