import { Injectable, NotFoundException, ForbiddenException, BadRequestException, forwardRef, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Journey, JourneyVisibility, JourneyMemberRole } from '../entities/journey.entity';
import { FriendsService } from '../../friend/friend.service';
import { JourneyPermissionService } from './journey-permission.service';

@Injectable()
export class JourneyAccessService {
  constructor(
    @InjectRepository(Journey) private readonly journeyRepo: MongoRepository<Journey>,
    @Inject(forwardRef(() => FriendsService))
    private readonly friendsService: FriendsService,
    private readonly permissionService: JourneyPermissionService,
  ) {}

  /**
   * Lấy journey với kiểm tra quyền truy cập dựa trên member role
   * MODE VIEW: Cho phép xem thông tin (nhưng VIEWER không thể gọi API chỉnh sửa)
   * MODE EDIT: Chỉ cho phép HOST/MEMBER chỉnh sửa
   */
  async getJourneyWithAccess(journeyId: string, userId: string, mode: 'VIEW' | 'EDIT' = 'VIEW'): Promise<Journey> {
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
    if (!journey) throw new NotFoundException('Hành trình không tồn tại');

    const userRole = journey.owner_id === userId ? JourneyMemberRole.HOST : journey.members?.find(m => m.user_id === userId)?.role;
    const isOwner = journey.owner_id === userId;
    const isMember = journey.members?.some(m => m.user_id === userId) || false;

    if (mode === 'EDIT') {
      // MODE EDIT: Kiểm tra HOST/MEMBER
      if (!isOwner && !isMember) {
        throw new ForbiddenException('Bạn không có quyền chỉnh sửa hành trình này');
      }

      // Nếu là VIEWER (member nhưng role=VIEWER) -> không được phép chỉnh sửa bất cứ gì
      if (userRole === JourneyMemberRole.VIEWER) {
        throw new ForbiddenException('VIEWER không có quyền chỉnh sửa hành trình. Chỉ HOST và MEMBER mới có thể.');
      }
    } else {
      // MODE VIEW: Kiểm tra visibility
      if (!isOwner && !isMember) {
        if (journey.visibility === JourneyVisibility.PUBLIC) {
          return journey; // Cho phép Guest xem công khai
        }

        if (journey.visibility === JourneyVisibility.FRIENDS) {
          // Kiểm tra xem userId hiện tại có phải là bạn của owner_id không
          const myFriends = await this.friendsService.getMyFriends(journey.owner_id);
          const isFriend = myFriends.some(f => f._id.toString() === userId);

          if (!isFriend) {
            throw new ForbiddenException('Chỉ bạn bè của chủ hành trình mới có thể xem');
          }
          return journey; // Là bạn bè -> Được xem view-only
        }

        if (journey.visibility === JourneyVisibility.PRIVATE) {
          throw new ForbiddenException('Hành trình này là riêng tư');
        }
      }
    }
    return journey;
  }

  /**
   * Kiểm tra VIEWER có thể thực hiện hành động này không
   * Dùng để prevent VIEWER gọi các API như addStop, updateBudget, checkIn
   */
  async validateViewerRestriction(journeyId: string, userId: string, actionName: string): Promise<void> {
    const userRole = await this.permissionService.getUserRole(journeyId, userId);

    if (userRole === JourneyMemberRole.VIEWER) {
      throw new ForbiddenException(`VIEWER không có quyền thực hiện: ${actionName}`);
    }
  }
}

