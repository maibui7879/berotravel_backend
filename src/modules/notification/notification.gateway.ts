import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { UseFilters } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WsCatchAllFilter } from '../../common/filters/ws-exception.filter';

@WebSocketGateway({
  namespace: '/notifications', 
  cors: { origin: '*' },
})
@UseFilters(new WsCatchAllFilter())
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.query.token as string;
      if (!token) throw new Error('No token');

      const secret = this.configService.get<string>('JWT_SECRET');
      const payload = this.jwtService.verify(token, { secret });

      client.join(payload.sub); 
      
      console.log(`User ${payload.sub} connected to Notifications`);
    } catch (e) {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
  }

  sendToUser(userId: string, notification: any) {
    this.server.to(userId).emit('new_notification', notification);
  }
}