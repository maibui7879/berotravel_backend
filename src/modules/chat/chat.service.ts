import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ChatMessage, MessageType } from './entities/chat-message.entity';
import { ObjectId } from 'mongodb';
import { SendMessageDto, SearchChatDto } from './dto/chat.dto';
import { JourneysService } from '../journey/services/journey.service';
import { User } from '../users/entities/user.entity'; 

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatMessage)
    private readonly chatRepo: MongoRepository<ChatMessage>,
    
    @InjectRepository(User)
    private readonly userRepo: MongoRepository<User>,

    private readonly journeysService: JourneysService,
  ) {}

  // [UPDATED] Save message with journey_id instead of group_id
  async saveMessage(userId: string, dto: SendMessageDto) {
    // Check user có trong journey không
    const journey = await this.journeysService.findOne(dto.journey_id);
    const isMember = journey.members.some(m => m.user_id === userId);
    if (!isMember) throw new BadRequestException('Bạn không phải thành viên của hành trình này');

    const sender = await this.userRepo.findOne({ where: { _id: new ObjectId(userId) } });

    const message = this.chatRepo.create({
      journey_id: dto.journey_id,
      sender_id: userId,
      sender_name: sender?.fullName || 'Unknown',
      sender_avatar: sender?.avatar || undefined,
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

  // [UPDATED] Get messages with journey_id
  async getMessages(journeyId: string, userId: string, limit = 50) {
    const journey = await this.journeysService.findOne(journeyId);
    const isMember = journey.members.some(m => m.user_id === userId);
    if (!isMember) throw new BadRequestException('Bạn không phải thành viên của hành trình này');

    const messages = await this.chatRepo.find({
      where: { journey_id: journeyId },
      order: { created_at: 'DESC' },
      take: limit,
    } as any);
    return messages.reverse();
  }

  // [UPDATED] Get journey images
  async getJourneyImages(journeyId: string, userId: string) {
    const journey = await this.journeysService.findOne(journeyId);
    const isMember = journey.members.some(m => m.user_id === userId);
    if (!isMember) throw new BadRequestException('Bạn không phải thành viên của hành trình này');

    return await this.chatRepo.find({
      where: { journey_id: journeyId, type: MessageType.IMAGE },
      order: { created_at: 'DESC' }
    } as any);
  }

  // [UPDATED] Get journey polls
  async getJourneyPolls(journeyId: string, userId: string) {
    const journey = await this.journeysService.findOne(journeyId);
    const isMember = journey.members.some(m => m.user_id === userId);
    if (!isMember) throw new BadRequestException('Bạn không phải thành viên của hành trình này');

    return await this.chatRepo.find({
      where: { journey_id: journeyId, type: MessageType.POLL },
      order: { created_at: 'DESC' }
    } as any);
  }

  // [UPDATED] Search messages in journey
  async searchMessages(journeyId: string, userId: string, queryDto: SearchChatDto) {
    const journey = await this.journeysService.findOne(journeyId);
    const isMember = journey.members.some(m => m.user_id === userId);
    if (!isMember) throw new BadRequestException('Bạn không phải thành viên của hành trình này');

    const query: any = { journey_id: journeyId };
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