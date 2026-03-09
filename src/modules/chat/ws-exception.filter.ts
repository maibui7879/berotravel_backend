import { Catch, ArgumentsHost, HttpException } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@Catch()
export class WsCatchAllFilter extends BaseWsExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const client = host.switchToWs().getClient<Socket>();
    
    let errorMessage = 'Lỗi hệ thống';
    let errorDetails: any = null;

    // Xử lý nếu lỗi là các chuẩn Exception của NestJS hoặc lỗi thông thường
    if (exception instanceof HttpException) {
      const response = exception.getResponse() as any;
      errorMessage = response.message || exception.message;
      errorDetails = response;
    } else if (exception instanceof WsException) {
      errorMessage = exception.getError() as any;
    } else if (exception?.message) {
      errorMessage = exception.message;
    }

    // In log ra terminal để backend dễ debug
    console.error('❌ WS ERROR CATCHER:', errorMessage);

    // Bắn sự kiện lỗi về cho Postman hiển thị, giữ nguyên kết nối
    client.emit('error', { 
      message: errorMessage,
      details: errorDetails,
      type: 'Unhandled_Exception',
      timestamp: new Date().toISOString()
    });
  }
}
