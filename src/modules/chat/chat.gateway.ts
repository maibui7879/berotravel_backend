import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config'; 
import { SendMessageDto, VotePollDto, ReactMessageDto } from './dto/chat.dto';

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: '*' },
})
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
      
      // Mọi user sau khi connect đều tự động Join vào kênh riêng tư của mình (nhận noti 1-1 toàn cầu)
      const personalRoom = `user_${payload.sub}`;
      client.join(personalRoom);
      
      console.log(`User ${payload.sub} connected & joined global socket ${personalRoom}`);
    } catch (e) {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`User disconnected: ${client.id}`);
  }

  // Client mở một phòng chat cụ thể (màn hình chat)
  @SubscribeMessage('join_room')
  handleJoinRoom(@ConnectedSocket() client: Socket, @MessageBody() data: { room_id: string }) {
    if (client.data.user && data.room_id) {
      const roomIdStr = `room_${data.room_id}`;
      client.join(roomIdStr);
      console.log(`User ${client.data.user.sub} is now active in room ${data.room_id}`);
    }
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(@ConnectedSocket() client: Socket, @MessageBody() dto: SendMessageDto) {
    try {
      const userId = client.data.user.sub;
      // Lưu vào DB
      const savedMsg = await this.chatService.saveMessage(userId, dto);
      
      // Phát tới kênh chung của phòng chat (Dành cho những người ĐANG mở màn hình chat này)
      const targetRoom = `room_${savedMsg.room_id}`;
      this.server.to(targetRoom).emit('receive_message', savedMsg);

      // Nếu là chat 1-1, bắt buộc phải bắn notification (popup) cho cả user nhận (dù chưa mở màn hình chat)
      if (dto.receiver_id) {
        this.server.to(`user_${dto.receiver_id}`).emit('new_message_alert', savedMsg);
        // Bắn lại cho sender để đồng bộ nếu họ đăng nhập nhiều device
        this.server.to(`user_${userId}`).emit('new_message_alert', savedMsg); 
      }

    } catch (error) {
      client.emit('error', { message: error.message });
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