import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { UseFilters } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config'; 
import { SendMessageDto, VotePollDto, ReactMessageDto } from './dto/chat.dto';
import { WsCatchAllFilter } from '../../common/filters/ws-exception.filter';

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: '*' },
})
@UseFilters(new WsCatchAllFilter())
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService, 
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.query.token as string;
      if (!token) throw new Error('No token');

      const secret = this.configService.get<string>('JWT_SECRET'); 
      const payload = this.jwtService.verify(token, { secret }); 
      
      client.data.user = payload; 

      const personalRoom = `user_${payload.sub}`;
      client.join(personalRoom);
      
      console.log(`User ${payload.sub} connected & joined global socket ${personalRoom}`);
    } catch (e) {
      console.error('❌ LỖI KẾT NỐI SOCKET:', e.message); 
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`User disconnected: ${client.id}`);
  }

@SubscribeMessage('join_room')
async handleJoinRoom(@ConnectedSocket() client: Socket, @MessageBody() data: { room_id?: string, journey_id?: string }) {
    try {
      const userId = client.data.user?.sub;
      if (!userId) return;

      let targetRoomId = data.room_id;

      if (!targetRoomId && data.journey_id) {
        targetRoomId = await this.chatService.getOrCreateJourneyRoom(data.journey_id, userId);
      }

      if (targetRoomId) {
        await this.chatService.checkUserInRoom(targetRoomId, userId);

        const roomIdStr = `room_${targetRoomId}`;
        client.join(roomIdStr);
        console.log(`User ${userId} joined socket room: ${roomIdStr}`);
        
        client.emit('room_joined_success', { room_id: targetRoomId });
      } else {
        client.emit('error', { message: 'Phải cung cấp room_id hoặc journey_id' });
      }
    } catch (error) {
      console.error('Lỗi khi join room:', error.message);
      client.emit('error', { message: error.message });
    }
  }
  
  @SubscribeMessage('send_message')
  async handleSendMessage(@ConnectedSocket() client: Socket, @MessageBody() dto: SendMessageDto) {
    try {
      console.log('--> Nhận lệnh send_message từ:', client.data.user.sub);
      const userId = client.data.user.sub;

      const savedMsg = await this.chatService.saveMessage(userId, dto);

      const targetRoom = `room_${savedMsg.room_id}`;
      this.server.to(targetRoom).emit('receive_message', savedMsg);

      client.emit('message_sent_success', savedMsg);

      if (dto.receiver_id) {
        this.server.to(`user_${dto.receiver_id}`).emit('new_message_alert', savedMsg);
        this.server.to(`user_${userId}`).emit('new_message_alert', savedMsg); 
      }

    } catch (error) {
      console.error('Lỗi tại Gateway:', error.message);
      client.emit('error', { message: error.message, stack: error.stack }); 
    }
  }

  @SubscribeMessage('vote_poll')
  async handleVotePoll(@ConnectedSocket() client: Socket, @MessageBody() dto: VotePollDto) {
    try {
      const userId = client.data.user.sub;
      const updatedMsg = await this.chatService.votePoll(dto.message_id, dto.option_id, userId);
      
      if (updatedMsg) {
        const targetRoom = `room_${updatedMsg.room_id}`;
        this.server.to(targetRoom).emit('poll_updated', updatedMsg);
      }
    } catch (error) {
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('react_message')
  async handleReactMessage(@ConnectedSocket() client: Socket, @MessageBody() dto: ReactMessageDto) {
    try {
      const userId = client.data.user.sub;
      const result = await this.chatService.reactMessage(dto.message_id, userId, dto.emoji);

      const targetRoom = `room_${result.room_id}`;
      this.server.to(targetRoom).emit('reaction_updated', result);
      
    } catch (error) {
      console.error(error);
      client.emit('error', { message: error.message });
    }
  }
}