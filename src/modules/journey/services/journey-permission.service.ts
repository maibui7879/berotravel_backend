import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Journey, JourneyMemberRole, JourneyMember } from '../entities/journey.entity';

/**
 * Service để kiểm tra quyền hạn chi tiết trong Journey
 * - HOST: Toàn quyền quản lý
 * - MEMBER: Có thể chỉnh sửa lộ trình, quản lý budget
 * - VIEWER: Chỉ xem, không thể chỉnh sửa gì
 */
@Injectable()
export class JourneyPermissionService {
  constructor(
    @InjectRepository(Journey) private readonly journeyRepo: MongoRepository<Journey>,
  ) {}

  /**
   * Lấy thông tin role của user trong journey
   * @returns JourneyMemberRole hoặc null nếu user không phải member
   */
  async getUserRole(journeyId: string, userId: string): Promise<JourneyMemberRole | null> {
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
    if (!journey) throw new NotFoundException('Hành trình không tồn tại');

    // Owner luôn là HOST
    if (journey.owner_id === userId) {
      return JourneyMemberRole.HOST;
    }

    // Tìm member
    const member = journey.members?.find(m => m.user_id === userId);
    return member?.role || null;
  }

  /**
   * Kiểm tra user có phải HOST không
   */
  async isHost(journeyId: string, userId: string): Promise<boolean> {
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
    if (!journey) return false;
    return journey.owner_id === userId;
  }

  /**
   * Kiểm tra user có phải MEMBER hoặc HOST không (có quyền chỉnh sửa)
   */
  async canEdit(journeyId: string, userId: string): Promise<boolean> {
    const role = await this.getUserRole(journeyId, userId);
    return role === JourneyMemberRole.HOST || role === JourneyMemberRole.MEMBER;
  }

  /**
   * Kiểm tra user có phải VIEWER (chỉ xem) không
   */
  async isViewer(journeyId: string, userId: string): Promise<boolean> {
    const role = await this.getUserRole(journeyId, userId);
    return role === JourneyMemberRole.VIEWER;
  }

  /**
   * Guard: Đảm bảo user có quyền chỉnh sửa
   * VIEWER không được phép gọi các API chỉnh sửa
   */
  async requireEditPermission(journeyId: string, userId: string, actionName: string = 'Hành động'): Promise<void> {
    const role = await this.getUserRole(journeyId, userId);

    if (role === null) {
      throw new ForbiddenException('Bạn không phải thành viên của hành trình này');
    }

    if (role === JourneyMemberRole.VIEWER) {
      throw new ForbiddenException(`VIEWER không có quyền thực hiện: ${actionName}. Chỉ HOST và MEMBER mới có thể chỉnh sửa.`);
    }
  }

  /**
   * Guard: Đảm bảo user là HOST hoặc được phép quản lý thành viên
   * Chỉ HOST mới có thể add/remove/manage members
   */
  async requireHostPermission(journeyId: string, userId: string, actionName: string = 'Hành động'): Promise<void> {
    const isHost = await this.isHost(journeyId, userId);

    if (!isHost) {
      throw new ForbiddenException(`${actionName} chỉ có quyền thực hiện bởi HOST (chủ chuyến đi)`);
    }
  }

  /**
   * Guard: Đảm bảo user là HOST hoặc MEMBER
   * Dùng cho các hành động như add stop, update budget
   */
  async requireMemberPermission(journeyId: string, userId: string, actionName: string = 'Hành động'): Promise<void> {
    await this.requireEditPermission(journeyId, userId, actionName);
  }

  /**
   * Lấy danh sách members theo role
   */
  async getMembersByRole(journeyId: string, role: JourneyMemberRole): Promise<JourneyMember[]> {
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
    if (!journey) throw new NotFoundException('Hành trình không tồn tại');

    return (journey.members || []).filter(m => m.role === role);
  }

  /**
   * Kiểm tra xem journey có HOST không (phải có ít nhất 1 HOST)
   */
  async hasHost(journeyId: string): Promise<boolean> {
    const hosts = await this.getMembersByRole(journeyId, JourneyMemberRole.HOST);
    // Nếu không có HOST trong members, thử check owner_id
    if (hosts.length === 0) {
      const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
      return journey?.owner_id !== null && journey?.owner_id !== undefined;
    }
    return hosts.length > 0;
  }

  /**
   * Lấy list các HOST/Member có thể nhận quyền
   * (Dùng để show danh sách khi HOST muốn chuyển quyền)
   */
  async getEligibleHostCandidates(journeyId: string, excludeUserId?: string): Promise<JourneyMember[]> {
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
    if (!journey) throw new NotFoundException('Hành trình không tồn tại');

    let candidates = journey.members || [];

    // Loại bỏ VIEWER - chỉ MEMBER và HOST có thể nhận quyền
    candidates = candidates.filter(m => m.role !== JourneyMemberRole.VIEWER);

    // Loại bỏ user được chỉ định
    if (excludeUserId) {
      candidates = candidates.filter(m => m.user_id !== excludeUserId);
    }

    return candidates;
  }
}
