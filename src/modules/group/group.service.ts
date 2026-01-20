import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Group, GroupRole, GroupMember, GroupRequest } from './entities/group.entity';
import { CreateGroupDto, JoinGroupDto } from './dto/group.dto';
import { ManageMemberDto } from './dto/manage-group.dto'; // Đảm bảo bạn đã tạo file này
import * as crypto from 'crypto';

@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(Group) private readonly groupRepo: MongoRepository<Group>,
  ) {}

  // 1. TẠO NHÓM
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

    return await this.groupRepo.save(group);
  }

  // 2. TÌM NHÓM THEO JOURNEY
  async findByJourney(journeyId: string, userId: string): Promise<Group> {
    if (!ObjectId.isValid(journeyId)) throw new BadRequestException('ID không hợp lệ');
    const group = await this.groupRepo.findOne({ where: { active_journey_id: journeyId } });
    if (!group) throw new NotFoundException('Chưa có nhóm nào cho hành trình này');
    return group;
  }

  // 3. JOIN NHÓM BẰNG CODE (Vào thẳng - Instant Join)
  async join(dto: JoinGroupDto, userId: string): Promise<Group> {
    const group = await this.groupRepo.findOne({ where: { invite_code: dto.invite_code.toUpperCase() } });
    if (!group) throw new NotFoundException('Mã mời không hợp lệ');

    const isMember = group.members.some(m => m.user_id === userId);
    if (isMember) throw new ConflictException('Đã tham gia nhóm rồi');

    group.members.push({ user_id: userId, role: GroupRole.MEMBER, joined_at: new Date() });
    return await this.groupRepo.save(group);
  }

  // 4. GỬI YÊU CẦU THAM GIA (Request Join)
  async requestJoin(groupId: string, userId: string): Promise<Group> {
    // Gọi findOne với tham số true để bỏ qua check thành viên (vì chưa vào nhóm sao check được)
    const group = await this.findOne(groupId, userId, true); 

    // Check lại cho chắc: Đã là thành viên chưa?
    if (group.members.some(m => m.user_id === userId)) {
      throw new ConflictException('Bạn đã là thành viên của nhóm này');
    }

    // Check: Đã gửi request chưa?
    if (group.join_requests && group.join_requests.some(r => r.user_id === userId)) {
      throw new ConflictException('Bạn đã gửi yêu cầu rồi, vui lòng chờ duyệt');
    }

    // Init mảng nếu null
    if (!group.join_requests) group.join_requests = [];
    
    // Thêm request
    group.join_requests.push({ user_id: userId, requested_at: new Date() });
    return await this.groupRepo.save(group);
  }

  // 5. HOST DUYỆT YÊU CẦU (Approve)
  async approveRequest(groupId: string, dto: ManageMemberDto, userId: string): Promise<Group> {
    const group = await this.findOne(groupId, userId); // Check user hiện tại có trong nhóm ko

    if (group.owner_id !== userId) throw new ForbiddenException('Chỉ Trưởng nhóm mới được duyệt thành viên');

    const reqIndex = group.join_requests?.findIndex(r => r.user_id === dto.member_id);
    if (reqIndex === undefined || reqIndex === -1) throw new NotFoundException('Yêu cầu không tồn tại hoặc đã bị hủy');

    // Xóa khỏi danh sách chờ
    group.join_requests.splice(reqIndex, 1);

    // Thêm vào danh sách thành viên
    group.members.push({
      user_id: dto.member_id,
      role: GroupRole.MEMBER,
      joined_at: new Date()
    });

    return await this.groupRepo.save(group);
  }

  // 6. HOST TỪ CHỐI YÊU CẦU (Reject)
  async rejectRequest(groupId: string, dto: ManageMemberDto, userId: string): Promise<Group> {
    const group = await this.findOne(groupId, userId);
    if (group.owner_id !== userId) throw new ForbiddenException('Chỉ Trưởng nhóm mới được từ chối yêu cầu');

    if (group.join_requests) {
      group.join_requests = group.join_requests.filter(r => r.user_id !== dto.member_id);
    }
    return await this.groupRepo.save(group);
  }

  // 7. HOST ĐUỔI THÀNH VIÊN (Kick)
  async kickMember(groupId: string, dto: ManageMemberDto, userId: string): Promise<Group> {
    const group = await this.findOne(groupId, userId);
    
    if (group.owner_id !== userId) throw new ForbiddenException('Chỉ Trưởng nhóm mới được đuổi thành viên');
    if (dto.member_id === userId) throw new BadRequestException('Không thể tự đuổi chính mình');

    const memberExists = group.members.some(m => m.user_id === dto.member_id);
    if (!memberExists) throw new NotFoundException('Thành viên không tồn tại trong nhóm');

    group.members = group.members.filter(m => m.user_id !== dto.member_id);
    return await this.groupRepo.save(group);
  }

  // 8. THÀNH VIÊN TỰ RỜI NHÓM (Leave)
  async leaveGroup(groupId: string, userId: string) {
    const group = await this.findOne(groupId, userId);

    if (group.owner_id === userId) {
      throw new BadRequestException('Trưởng nhóm không được rời nhóm. Hãy giải tán nhóm hoặc chuyển quyền trước.');
    }

    group.members = group.members.filter(m => m.user_id !== userId);
    await this.groupRepo.save(group);
    return { success: true, message: 'Đã rời nhóm thành công' };
  }

  // 9. GIẢI TÁN NHÓM (Disband)
  async disbandGroup(groupId: string, userId: string) {
    const group = await this.findOne(groupId, userId);
    
    if (group.owner_id !== userId) throw new ForbiddenException('Chỉ Trưởng nhóm mới được giải tán nhóm');

    await this.groupRepo.delete(new ObjectId(groupId));
    return { success: true, message: 'Nhóm đã được giải tán' };
  }

  // --- QUERY & HELPERS ---

  async findMyGroups(userId: string): Promise<Group[]> {
    return await this.groupRepo.find({ where: { 'members.user_id': userId } as any, order: { updated_at: -1 } as any });
  }

  // Cập nhật hàm findOne: Thêm tham số skipMemberCheck
  async findOne(id: string, userId: string, skipMemberCheck = false): Promise<Group> {
    if (!ObjectId.isValid(id)) throw new BadRequestException('ID nhóm không hợp lệ');

    const group = await this.groupRepo.findOne({ where: { _id: new ObjectId(id) } });

    if (!group) throw new NotFoundException('Nhóm không tồn tại');

    // Nếu skipMemberCheck = false (mặc định), thì kiểm tra xem user có phải là member không
    if (!skipMemberCheck) {
      const isMember = group.members.some(m => m.user_id === userId);
      if (!isMember) {
        throw new ForbiddenException('Bạn không phải thành viên nhóm này');
      }
    }
    
    return group; 
  }

  private async generateUniqueCode(): Promise<string> {
    let code = '';
    for (let i = 0; i < 5; i++) {
      code = crypto.randomBytes(3).toString('hex').toUpperCase();
      const exist = await this.groupRepo.findOne({ where: { invite_code: code } });
      if (!exist) return code;
    }
    throw new ConflictException('Server đang bận, vui lòng thử lại sau');
  }
}