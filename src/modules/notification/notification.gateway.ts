import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({
  namespace: '/notifications', // Namespace riêng
  cors: { origin: '*' },
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // 1. KẾT NỐI & JOIN ROOM CÁ NHÂN
  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.query.token as string;
      if (!token) throw new Error('No token');

      const secret = this.configService.get<string>('JWT_SECRET');
      const payload = this.jwtService.verify(token, { secret });

      // [QUAN TRỌNG] Join vào room mang tên User ID của chính mình
      client.join(payload.sub); 
      
      console.log(`User ${payload.sub} connected to Notifications`);
    } catch (e) {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    // console.log(`Client disconnected: ${client.id}`);
  }

  // 2. HÀM GỬI THÔNG BÁO (Được Service gọi)
  sendToUser(userId: string, notification: any) {
    // Bắn sự kiện 'new_notification' tới room userId
    this.server.to(userId).emit('new_notification', notification);
  }
}