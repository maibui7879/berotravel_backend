import { Injectable, NotFoundException, ForbiddenException, BadRequestException, forwardRef, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Journey, JourneyVisibility } from '../entities/journey.entity';
import { FriendsService } from '../../friend/friend.service';
@Injectable()
export class JourneyAccessService {
  constructor(
    @InjectRepository(Journey) private readonly journeyRepo: MongoRepository<Journey>,
    @Inject(forwardRef(() => FriendsService))
    private readonly friendsService: FriendsService,
  ) {}

  async getJourneyWithAccess(journeyId: string, userId: string, mode: 'VIEW' | 'EDIT' = 'VIEW'): Promise<Journey> {
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
    if (!journey) throw new NotFoundException('Hành trình không tồn tại');

    const isOwner = journey.owner_id === userId;
    const isMember = journey.members?.some(m => m.user_id === userId) || false;

    if (mode === 'EDIT') {
      if (!isOwner && !isMember) {
        throw new ForbiddenException('Bạn không có quyền chỉnh sửa hành trình này');
      }
    } else {
      // Logic Mode VIEW mới
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
}

