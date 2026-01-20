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
import { ConfigService } from '@nestjs/config'; // <--- 1. IMPORT CONFIG SERVICE
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

  // 1. AUTH & CONNECTION
  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.query.token as string;
      if (!token) throw new Error('No token');

      const secret = this.configService.get<string>('JWT_SECRET'); 

      // Verify token với secret lấy từ file .env
      const payload = this.jwtService.verify(token, { secret }); 
      
      client.data.user = payload; 
      console.log(`User ${payload.sub} connected`);
    } catch (e) {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`User disconnected: ${client.id}`);
  }

  // 2. JOIN ROOM
  @SubscribeMessage('join_room')
  handleJoinRoom(@ConnectedSocket() client: Socket, @MessageBody() data: { group_id: string }) {
    if (client.data.user) {
      client.join(data.group_id);
    }
  }

  // 3. SEND MESSAGE
  @SubscribeMessage('send_message')
  async handleSendMessage(@ConnectedSocket() client: Socket, @MessageBody() dto: SendMessageDto) {
    try {
      const userId = client.data.user.sub;
      const savedMsg = await this.chatService.saveMessage(userId, dto);
      this.server.to(dto.group_id).emit('receive_message', savedMsg);
    } catch (error) {
      client.emit('error', { message: error.message });
    }
  }
  
  // 4. VOTE POLL
  @SubscribeMessage('vote_poll')
  async handleVotePoll(@ConnectedSocket() client: Socket, @MessageBody() dto: VotePollDto) {
    try {
      const userId = client.data.user.sub;
      const updatedMsg = await this.chatService.votePoll(dto.message_id, dto.option_id, userId);
      this.server.to(dto.group_id).emit('poll_updated', updatedMsg);
    } catch (error) {
      client.emit('error', { message: error.message });
    }
  }

  // 5. REACT MESSAGE
  @SubscribeMessage('react_message')
  async handleReactMessage(@ConnectedSocket() client: Socket, @MessageBody() dto: ReactMessageDto) {
    try {
      const userId = client.data.user.sub;
      
      // Gọi service xử lý
      const result = await this.chatService.reactMessage(dto.message_id, userId, dto.emoji);
      
      // Bắn sự kiện cho cả phòng biết để update UI
      this.server.to(dto.group_id).emit('reaction_updated', result);
      
    } catch (error) {
      console.error(error);
      client.emit('error', { message: error.message });
    }
  }
}