import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import * as crypto from 'crypto';

import { Group, GroupRole, GroupMember } from './entities/group.entity';
import { Journey } from '../journey/entities/journey.entity';
import { CreateGroupDto, JoinGroupDto } from './dto/group.dto';
import { ManageMemberDto } from './dto/manage-group.dto';
import { JourneysService } from '../journey/services/journey.service';

@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(Group) private readonly groupRepo: MongoRepository<Group>,
    @InjectRepository(Journey) private readonly journeyRepo: MongoRepository<Journey>,
    
    @Inject(forwardRef(() => JourneysService))
    private readonly journeysService: JourneysService,
  ) {}

  async create(dto: CreateGroupDto, userId: string): Promise<Group> {
    const inviteCode = await this.generateUniqueCode();
    const host: GroupMember = { user_id: userId, role: GroupRole.HOST, joined_at: new Date() };

    const group = this.groupRepo.create({
      name: dto.name,
      owner_id: userId,
      invite_code: inviteCode,
      active_journey_id: dto.journey_id || null, 
      members: [host],
      join_requests: [] 
    });

    const savedGroup = await this.groupRepo.save(group);

    if (dto.journey_id) {
        await this.journeyRepo.updateOne(
            { _id: new ObjectId(dto.journey_id) },
            { $set: { group_id: savedGroup._id.toString() } }
        );
    }

    return savedGroup;
  }

  async join(dto: JoinGroupDto, userId: string): Promise<Group> {
    const group = await this.groupRepo.findOne({ where: { invite_code: dto.invite_code.toUpperCase() } });
    if (!group) throw new NotFoundException('Mã mời không hợp lệ');

    const isMember = group.members.some(m => m.user_id === userId);
    if (isMember) throw new ConflictException('Đã tham gia nhóm rồi');

    group.members.push({ user_id: userId, role: GroupRole.MEMBER, joined_at: new Date() });
    await this.groupRepo.save(group);

    if (group.active_journey_id) {
        await this.syncMemberToJourney(group.active_journey_id, userId, 'ADD');
    }

    return group;
  }

  // =================================================================
  // SOCIAL: REQUEST TO JOIN (LOGIC MỚI)
  // =================================================================

  async requestToJoin(groupId: string, userId: string): Promise<void> {
    const group = await this.groupRepo.findOne({ where: { _id: new ObjectId(groupId) } });
    if (!group) throw new NotFoundException('Nhóm không tồn tại');

    const isMember = group.members.some(m => m.user_id === userId);
    if (isMember) throw new BadRequestException('Bạn đã là thành viên của nhóm');

    const isRequested = group.join_requests?.some(r => r.user_id === userId);
    if (isRequested) throw new BadRequestException('Yêu cầu đang chờ duyệt');

    if (!group.join_requests) group.join_requests = [];
    
    group.join_requests.push({
      user_id: userId,
      requested_at: new Date()
    });

    await this.groupRepo.save(group);
  }

  async getPendingRequests(groupId: string, ownerId: string) {
    const group = await this.groupRepo.findOne({ where: { _id: new ObjectId(groupId) } });
    if (!group) throw new NotFoundException('Nhóm không tồn tại');
    if (group.owner_id !== ownerId) throw new BadRequestException('Chỉ trưởng nhóm mới có quyền xem');
    
    return group.join_requests || [];
  }

  async approveRequest(groupId: string, dto: ManageMemberDto, userId: string): Promise<Group> {
    const group = await this.findOne(groupId, userId); 

    if (group.owner_id !== userId) throw new ForbiddenException('Chỉ Trưởng nhóm mới được duyệt thành viên');

    const reqIndex = group.join_requests?.findIndex(r => r.user_id === dto.member_id);
    if (reqIndex === undefined || reqIndex === -1) throw new NotFoundException('Yêu cầu không tồn tại');

    group.join_requests.splice(reqIndex, 1);
    group.members.push({
      user_id: dto.member_id,
      role: GroupRole.MEMBER,
      joined_at: new Date()
    });

    await this.groupRepo.save(group);

    if (group.active_journey_id) {
        await this.syncMemberToJourney(group.active_journey_id, dto.member_id, 'ADD');
    }

    return group;
  }

  async rejectRequest(groupId: string, dto: ManageMemberDto, userId: string): Promise<Group> {
    const group = await this.findOne(groupId, userId);
    if (group.owner_id !== userId) throw new ForbiddenException('Chỉ Trưởng nhóm mới được từ chối yêu cầu');
    
    if (group.join_requests) {
        group.join_requests = group.join_requests.filter(r => r.user_id !== dto.member_id);
    }
    
    return await this.groupRepo.save(group);
  }

  // =================================================================
  // MEMBER MANAGEMENT
  // =================================================================

  async kickMember(groupId: string, dto: ManageMemberDto, userId: string): Promise<Group> {
    const group = await this.findOne(groupId, userId);
    
    if (group.owner_id !== userId) throw new ForbiddenException('Chỉ Trưởng nhóm mới được đuổi thành viên');
    if (dto.member_id === userId) throw new BadRequestException('Không thể tự đuổi chính mình');

    const memberExists = group.members.some(m => m.user_id === dto.member_id);
    if (!memberExists) throw new NotFoundException('Thành viên không tồn tại trong nhóm');

    group.members = group.members.filter(m => m.user_id !== dto.member_id);
    await this.groupRepo.save(group);

    if (group.active_journey_id) {
        await this.syncMemberToJourney(group.active_journey_id, dto.member_id, 'REMOVE');
    }

    return group;
  }

  async leaveGroup(groupId: string, userId: string) {
    const group = await this.findOne(groupId, userId);

    if (group.owner_id === userId) {
      throw new BadRequestException('Trưởng nhóm không được rời nhóm. Hãy giải tán nhóm hoặc chuyển quyền trước.');
    }

    group.members = group.members.filter(m => m.user_id !== userId);
    await this.groupRepo.save(group);

    if (group.active_journey_id) {
        await this.syncMemberToJourney(group.active_journey_id, userId, 'REMOVE');
    }

    return { success: true, message: 'Đã rời nhóm thành công' };
  }

  // =================================================================
  // HELPERS
  // =================================================================

  async findOne(id: string, userId: string, skipMemberCheck = false): Promise<Group> {
    if (!ObjectId.isValid(id)) throw new BadRequestException('ID nhóm không hợp lệ');
    const group = await this.groupRepo.findOne({ where: { _id: new ObjectId(id) } });
    if (!group) throw new NotFoundException('Nhóm không tồn tại');
    if (!skipMemberCheck) {
      const isMember = group.members.some(m => m.user_id === userId);
      if (!isMember) throw new ForbiddenException('Bạn không phải thành viên nhóm này');
    }
    return group; 
  }
  
  async findByJourney(journeyId: string, userId: string): Promise<Group> {
    if (!ObjectId.isValid(journeyId)) throw new BadRequestException('ID không hợp lệ');
    const group = await this.groupRepo.findOne({ where: { active_journey_id: journeyId } });
    if (!group) throw new NotFoundException('Chưa có nhóm nào cho hành trình này');
    const isMember = group.members.some(m => m.user_id === userId);
    if (!isMember) throw new ForbiddenException('Bạn không phải thành viên của nhóm này');
    return group;
  }
  
  async disbandGroup(groupId: string, userId: string) {
    const group = await this.findOne(groupId, userId);
    if (group.owner_id !== userId) throw new ForbiddenException('Chỉ Trưởng nhóm mới được giải tán nhóm');
    if (group.active_journey_id) {
        await this.journeyRepo.updateOne({ _id: new ObjectId(group.active_journey_id) }, { $unset: { group_id: "" } });
    }
    await this.groupRepo.delete(new ObjectId(groupId));
    return { success: true, message: 'Nhóm đã được giải tán' };
  }
  
  private async generateUniqueCode(): Promise<string> {
    let code = '';
    for (let i = 0; i < 5; i++) {
      code = crypto.randomBytes(3).toString('hex').toUpperCase();
      const exist = await this.groupRepo.findOne({ where: { invite_code: code } });
      if (!exist) return code;
    }
    throw new ConflictException('Server đang bận');
  }

  async findMyGroups(userId: string): Promise<Group[]> {
    return await this.groupRepo.find({ 
      where: { 'members.user_id': userId } as any, 
      order: { updated_at: -1 } as any 
    });
  }

  private async syncMemberToJourney(journeyId: string, userId: string, action: 'ADD' | 'REMOVE') {
      try {
          const updateOp: any = action === 'ADD'
              ? { $addToSet: { members: userId } }
              : { $pull: { members: userId } };

          await this.journeyRepo.updateOne(
              { _id: new ObjectId(journeyId) },
              updateOp
          );

          await this.journeysService.refreshJourneyBudget(journeyId);
          
      } catch (error) {
          console.error(`Sync member to journey ${journeyId} failed:`, error);
      }
  }
}