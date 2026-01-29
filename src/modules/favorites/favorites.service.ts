import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';

import { Favorite, FavoriteType } from './entities/favorite.entity';
import { ToggleFavoriteDto } from './dto/favorite.dto';
import { Place } from '../places/entities/place.entity';
import { Journey } from '../journey/entities/journey.entity';
import { User } from '../users/entities/user.entity';
import { FriendsService } from '../friend/friend.service';
// [NEW] Import Service và Constant để tính điểm
import { UserProfileService } from '../users/services/user-profile.service';
import { UserActionType } from 'src/common/constants';

@Injectable()
export class FavoritesService {
  constructor(
    @InjectRepository(Favorite) private readonly favRepo: MongoRepository<Favorite>,
    @InjectRepository(Place) private readonly placeRepo: MongoRepository<Place>,
    @InjectRepository(Journey) private readonly journeyRepo: MongoRepository<Journey>,
    
    private readonly friendsService: FriendsService,
    // [NEW] Inject UserProfileService
    private readonly userProfileService: UserProfileService,
  ) {}

  async toggle(userId: string, dto: ToggleFavoriteDto) {
    const targetIdObj = new ObjectId(dto.target_id);
    let targetRepo: MongoRepository<Place> | MongoRepository<Journey>;

    if (dto.type === FavoriteType.PLACE) {
        const place = await this.placeRepo.findOne({ where: { _id: targetIdObj } });
        if (!place) throw new NotFoundException('Địa điểm không tồn tại');
        targetRepo = this.placeRepo;
    } else {
        const journey = await this.journeyRepo.findOne({ where: { _id: targetIdObj } });
        if (!journey) throw new NotFoundException('Hành trình không tồn tại');
        targetRepo = this.journeyRepo;
    }

    const existing = await this.favRepo.findOne({
        where: { user_id: userId, target_id: dto.target_id }
    });

    if (existing) {
        // === UNLIKE ===
        await this.favRepo.delete(existing._id);
        await targetRepo.updateOne({ _id: targetIdObj }, { $inc: { favorites_count: -1 } });
        if (dto.type === FavoriteType.PLACE) {
            this.userProfileService.scoreAction(userId, dto.target_id, UserActionType.REMOVE_FROM_FAVORITE);
        }
        return { status: 'UNLIKED', message: 'Đã bỏ yêu thích', count: -1 }; 
    } else {
        // === LIKE ===
        const fav = this.favRepo.create({
            user_id: userId,
            target_id: dto.target_id,
            type: dto.type
        });
        await this.favRepo.save(fav);
        await targetRepo.updateOne({ _id: targetIdObj }, { $inc: { favorites_count: 1 } });

        // [NEW LOGIC] Cộng điểm Personalization
        if (dto.type === FavoriteType.PLACE) {
            // Chạy ngầm (không await) để không làm chậm response
            this.userProfileService.scoreAction(userId, dto.target_id, UserActionType.ADD_TO_FAVORITE);
        }

        return { status: 'LIKED', message: 'Đã thêm vào yêu thích', count: 1 };
    }
  }

  async getMyFavorites(userId: string, type: FavoriteType) {
    const favs = await this.favRepo.find({ where: { user_id: userId, type } });
    if (favs.length === 0) return [];

    const ids = favs.map(f => new ObjectId(f.target_id));

    if (type === FavoriteType.PLACE) {
        return await this.placeRepo.find({ where: { _id: { $in: ids } } as any });
    } else {
        return await this.journeyRepo.find({ where: { _id: { $in: ids } } as any });
    }
  }

  async getFriendsFavoritePlaces(userId: string) {
    // 1. Lấy danh sách bạn bè
    const friends = await this.friendsService.getMyFriends(userId);
    if (!friends || friends.length === 0) return [];

    const friendIds = friends.map(f => f._id.toString());
    
    // Map friends info
    const friendMap = new Map<string, User>();
    friends.forEach(f => friendMap.set(f._id.toString(), f));

    // 2. Tìm like
    const favorites = await this.favRepo.find({
        where: {
            user_id: { $in: friendIds },
            type: FavoriteType.PLACE
        } as any
    });

    if (favorites.length === 0) return [];

    // 3. Gom nhóm
    const placeLikesMap = new Map<string, any[]>();

    favorites.forEach(fav => {
        const friendInfo = friendMap.get(fav.user_id);
        
        if (friendInfo) {
            let likedList = placeLikesMap.get(fav.target_id);
            if (!likedList) {
                likedList = [];
                placeLikesMap.set(fav.target_id, likedList);
            }

            likedList.push({
                _id: friendInfo._id,
                fullName: friendInfo.fullName,
                avatar: friendInfo.avatar
            });
        }
    });

    // 4. Lấy chi tiết Place
    const placeIds = Array.from(placeLikesMap.keys()).map(id => new ObjectId(id));
    const places = await this.placeRepo.find({
        where: { _id: { $in: placeIds } } as any
    });

    // 5. Merge
    return places.map(place => {
        const likedBy = placeLikesMap.get(place._id.toString()) || [];
        return {
            place: place,           
            liked_by_friends: likedBy, 
            friend_count: likedBy.length 
        };
    }).sort((a, b) => b.friend_count - a.friend_count);
  }
}