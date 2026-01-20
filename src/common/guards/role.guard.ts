import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role, ROLES_KEY } from '../constants';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 1. Lấy danh sách các Roles được phép truy cập từ Decorator
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Nếu API không gắn @Roles, cho phép đi qua
    if (!requiredRoles) {
      return true;
    }

    // 2. Lấy thông tin User từ Request (đã được AtGuard giải mã từ Token)
    const { user } = context.switchToHttp().getRequest();

    // 3. Kiểm tra quyền
    const hasRole = requiredRoles.some((role) => user.role?.includes(role));
    
    if (!hasRole) {
      throw new ForbiddenException('Bạn không có quyền truy cập tính năng này');
    }

    return true;
  }
}