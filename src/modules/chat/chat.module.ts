import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { ChatController } from './chat.controller';
import { ChatMessage } from './entities/chat-message.entity';
import { JwtModule } from '@nestjs/jwt';
import { GroupsModule } from '../group/group.module'; 
import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatMessage, User]),
    JwtModule.register({}), 
    GroupsModule 
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway],
})
export class ChatModule {}