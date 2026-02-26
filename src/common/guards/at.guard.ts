import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class AtGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  // Bắt buộc gọi super.canActivate để Passport luôn luôn chạy hàm giải mã Token
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  // Can thiệp vào kết quả sau khi giải mã
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    // Nếu có lỗi (ví dụ token hết hạn) hoặc không có user (không gửi token)
    if (err || !user) {
      // Nếu là API Public -> Trả về null (Cho phép đi tiếp với thân phận Guest)
      if (isPublic) {
        return null;
      }
      // Nếu API Private -> Ném lỗi 401 như bình thường
      throw err || new UnauthorizedException('Bạn chưa đăng nhập hoặc Token không hợp lệ');
    }

    // Nếu token chuẩn, trả về user để các Decorator @GetCurrentUser hứng được
    return user;
  }
}