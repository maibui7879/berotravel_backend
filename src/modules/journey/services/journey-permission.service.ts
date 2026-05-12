import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Journey, JourneyMemberRole, JourneyMember } from '../entities/journey.entity';

@Injectable()
export class JourneyPermissionService {
  constructor(
    @InjectRepository(Journey) private readonly journeyRepo: MongoRepository<Journey>,
  ) {}

  async getUserRole(journeyId: string, userId: string): Promise<JourneyMemberRole | null> {
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
    if (!journey) throw new NotFoundException('Hành trình không tồn tại');

    if (journey.owner_id === userId) {
      return JourneyMemberRole.HOST;
    }

    const member = journey.members?.find(m => m.user_id === userId);
    return member?.role || null;
  }


  async isHost(journeyId: string, userId: string): Promise<boolean> {
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
    if (!journey) return false;
    return journey.owner_id === userId;
  }

  async canEdit(journeyId: string, userId: string): Promise<boolean> {
    const role = await this.getUserRole(journeyId, userId);
    return role === JourneyMemberRole.HOST || role === JourneyMemberRole.MEMBER;
  }


  async isViewer(journeyId: string, userId: string): Promise<boolean> {
    const role = await this.getUserRole(journeyId, userId);
    return role === JourneyMemberRole.VIEWER;
  }

  async requireEditPermission(journeyId: string, userId: string, actionName: string = 'Hành động'): Promise<void> {
    const role = await this.getUserRole(journeyId, userId);

    if (role === null) {
      throw new ForbiddenException('Bạn không phải thành viên của hành trình này');
    }

    if (role === JourneyMemberRole.VIEWER) {
      throw new ForbiddenException(`VIEWER không có quyền thực hiện: ${actionName}. Chỉ HOST và MEMBER mới có thể chỉnh sửa.`);
    }
  }


  async requireHostPermission(journeyId: string, userId: string, actionName: string = 'Hành động'): Promise<void> {
    const isHost = await this.isHost(journeyId, userId);

    if (!isHost) {
      throw new ForbiddenException(`${actionName} chỉ có quyền thực hiện bởi HOST (chủ chuyến đi)`);
    }
  }


  async requireMemberPermission(journeyId: string, userId: string, actionName: string = 'Hành động'): Promise<void> {
    await this.requireEditPermission(journeyId, userId, actionName);
  }

  async getMembersByRole(journeyId: string, role: JourneyMemberRole): Promise<JourneyMember[]> {
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
    if (!journey) throw new NotFoundException('Hành trình không tồn tại');

    return (journey.members || []).filter(m => m.role === role);
  }


  async hasHost(journeyId: string): Promise<boolean> {
    const hosts = await this.getMembersByRole(journeyId, JourneyMemberRole.HOST);
    // Nếu không có HOST trong members, thử check owner_id
    if (hosts.length === 0) {
      const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
      return journey?.owner_id !== null && journey?.owner_id !== undefined;
    }
    return hosts.length > 0;
  }


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
