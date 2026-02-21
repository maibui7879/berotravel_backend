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
      console.log(`User ${payload.sub} connected`);
    } catch (e) {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`User disconnected: ${client.id}`);
  }

  @SubscribeMessage('join_room')
  handleJoinRoom(@ConnectedSocket() client: Socket, @MessageBody() data: { journey_id: string }) {
    if (client.data.user) {
      const roomId = `journey_${data.journey_id}`;
      client.join(roomId);
      console.log(`User ${client.data.user.sub} joined journey ${data.journey_id}`);
    }
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(@ConnectedSocket() client: Socket, @MessageBody() dto: SendMessageDto) {
    try {
      const userId = client.data.user.sub;
      const savedMsg = await this.chatService.saveMessage(userId, dto);
      const roomId = `journey_${dto.journey_id}`;
      this.server.to(roomId).emit('receive_message', savedMsg);
    } catch (error) {
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('vote_poll')
  async handleVotePoll(@ConnectedSocket() client: Socket, @MessageBody() dto: VotePollDto) {
    try {
      const userId = client.data.user.sub;
      const updatedMsg = await this.chatService.votePoll(dto.message_id, dto.option_id, userId);
      const roomId = `journey_${dto.journey_id}`;
      this.server.to(roomId).emit('poll_updated', updatedMsg);
    } catch (error) {
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('react_message')
  async handleReactMessage(@ConnectedSocket() client: Socket, @MessageBody() dto: ReactMessageDto) {
    try {
      const userId = client.data.user.sub;
      
      const result = await this.chatService.reactMessage(dto.message_id, userId, dto.emoji);

      const roomId = `journey_${dto.journey_id}`;
      this.server.to(roomId).emit('reaction_updated', result);
      
    } catch (error) {
      console.error(error);
      client.emit('error', { message: error.message });
    }
  }
}