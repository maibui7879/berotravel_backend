import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { ChatController } from './chat.controller';
import { ChatMessage } from './entities/chat-message.entity';
import { JwtModule } from '@nestjs/jwt';
import { User } from '../users/entities/user.entity';
import { JourneysModule } from '../journey/journey.module';
import { ChatConversation } from './entities/chat.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatMessage, ChatConversation, User]),
    JwtModule.register({}), 
    forwardRef(() => JourneysModule)
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway],
  exports: [ChatService],
})
export class ChatModule {}