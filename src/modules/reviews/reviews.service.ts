import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';

import { Review, ReviewStatus } from './entities/review.entity';
import { Place } from '../places/entities/place.entity';
// [NEW] Import Service và Constants
import { UserProfileService } from '../users/services/user-profile.service';
import { UserActionType } from '../../common/constants';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review) private readonly reviewRepo: MongoRepository<Review>,
    @InjectRepository(Place) private readonly placeRepo: MongoRepository<Place>,
    
    // [NEW] Inject UserProfileService
    private readonly userProfileService: UserProfileService,
  ) {}

  async create(dto: any, userId: string) {
    const { place_id, cleanliness, service, location, price, content, images } = dto;

    const existing = await this.reviewRepo.findOne({ where: { place_id, user_id: userId } });
    if (existing) throw new BadRequestException('Bạn đã đánh giá địa điểm này rồi');

    const place = await this.placeRepo.findOne({ where: { _id: new ObjectId(place_id) } });
    if (!place) throw new NotFoundException('Địa điểm không tồn tại');

    const avgRating = (cleanliness + service + location + price) / 4;
    const finalRating = Number(avgRating.toFixed(1));

    const review = this.reviewRepo.create({
      place_id,
      user_id: userId,
      content,
      images: images || [],
      criteria: { cleanliness, service, location, price },
      rating: finalRating,
      helpful_count: 0,
      status: ReviewStatus.PUBLISHED,
    } as any);

    const saved = await this.reviewRepo.save(review);
    await this.syncPlaceStats(place_id);

    // [TRAVEL DNA LOGIC]
    // Nếu đánh giá tốt (>= 4 sao) -> Cộng điểm sở thích mạnh mẽ
    if (finalRating >= 4) {
        this.userProfileService.scoreAction(userId, place_id, UserActionType.RATING_HIGH);
    }

    return saved;
  }

  async findAllByPlace(placeId: string, query: any) {
    const { 
      page = 1, 
      limit = 10, 
      sort_by = 'created_at', 
      sort_order = 'DESC', 
      filter = 'ALL' 
    } = query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    // Build match stage
    const matchStage: any = { place_id: placeId, status: ReviewStatus.PUBLISHED };
    if (filter === 'POSITIVE') matchStage.rating = { $gte: 4 };
    if (filter === 'NEGATIVE') matchStage.rating = { $lte: 2 };

    const sortOrder = sort_order === 'DESC' ? -1 : 1;

    // Aggregation pipeline with $lookup to fetch user data
    const pipeline: any[] = [
      { $match: matchStage },
      {
        // BƯỚC 1: Ép kiểu string sang ObjectId trước khi lookup
        $addFields: {
          user_id_obj: { $toObjectId: '$user_id' }
        }
      },
      {
        $lookup: {
          from: 'users', // BƯỚC 2: Sửa thành 'users' (số nhiều)
          localField: 'user_id_obj', // Dùng trường đã ép kiểu
          foreignField: '_id',
          as: 'userDetails'
        }
      },
      {
        $unwind: { path: '$userDetails', preserveNullAndEmptyArrays: true }
      },
      {
        $project: {
          // Keep review fields
          _id: 1,
          place_id: 1,
          criteria: 1,
          rating: 1,
          content: 1,
          images: 1,
          helpful_count: 1,
          merchant_reply: 1,
          merchant_reply_at: 1,
          is_anonymous: 1,
          is_verified: 1,
          status: 1,
          created_at: 1,
          updated_at: 1,
          // Map user data - exclude user info if is_anonymous is true
          user: {
            $cond: {
              if: '$is_anonymous',
              then: null,
              else: {
                id: '$userDetails._id',
                fullName: '$userDetails.fullName',
                avatar: '$userDetails.avatar'
              }
            }
          }
        }
      },
      { $sort: { [sort_by]: sortOrder } },
      { $skip: skip },
      { $limit: take }
    ];

    // Fetch total count
    const countPipeline = [
      { $match: matchStage },
      { $count: 'total' }
    ];

    const [data, countResult] = await Promise.all([
      this.reviewRepo.aggregate(pipeline).toArray(),
      this.reviewRepo.aggregate(countPipeline).toArray()
    ]);

    const total = countResult.length > 0 ? countResult[0].total : 0;

    return {
      data,
      meta: {
        total,
        page: Number(page),
        last_page: Math.ceil(total / take),
      }
    };
  }

  async getStats(placeId: string) {
    const stats = await this.reviewRepo.aggregate([
      { $match: { place_id: placeId, status: ReviewStatus.PUBLISHED } },
      {
        $facet: {
          star_distribution: [
            { $group: { _id: { $floor: '$rating' }, count: { $sum: 1 } } }
          ],
          criteria_averages: [
            { 
              $group: { 
                _id: null,
                cleanliness: { $avg: '$criteria.cleanliness' },
                service: { $avg: '$criteria.service' },
                location: { $avg: '$criteria.location' },
                price: { $avg: '$criteria.price' }
              } 
            }
          ],
          sentiment_count: [
            {
              $group: {
                _id: null,
                positive: { $sum: { $cond: [{ $gte: ['$rating', 4] }, 1, 0] } },
                negative: { $sum: { $cond: [{ $lte: ['$rating', 2] }, 1, 0] } },
                neutral: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } }
              }
            }
          ]
        }
      }
    ]).toArray();

    return stats[0];
  }

async syncPlaceStats(placeId: string) {
  try {
    const stats = await this.reviewRepo.aggregate([
      { $match: { place_id: placeId, status: 'PUBLISHED' } }, // Dùng string 'PUBLISHED' nếu Enum gặp lỗi
      { $group: { _id: '$place_id', avg: { $avg: '$rating' }, total: { $sum: 1 } } }
    ]).toArray();

    const updateData = stats.length > 0 
      ? { rating_avg: Number(stats[0].avg.toFixed(1)), review_count: stats[0].total }
      : { rating_avg: 0, review_count: 0 };

    await this.placeRepo.update(new ObjectId(placeId), updateData as any);
  } catch (error) {
    console.error('Sync Stats Error:', error);
    // Không throw lỗi ở đây để tránh làm chết API chính, hoặc handle cẩn thận
  }
}

async update(id: string, dto: any, userId: string) {
  // Đảm bảo ID hợp lệ trước khi tìm kiếm
  if (!ObjectId.isValid(id)) throw new BadRequestException('ID không hợp lệ');

  const review = await this.reviewRepo.findOne({ where: { _id: new ObjectId(id) } });
  if (!review) throw new NotFoundException('Không tìm thấy review');
  if (review.user_id !== userId) throw new ForbiddenException('Không có quyền chỉnh sửa');

  const diff = (new Date().getTime() - review.created_at.getTime()) / (1000 * 3600);
  if (diff > 48) throw new BadRequestException('Chỉ được sửa trong vòng 48h');

  // Loại bỏ các trường không được phép cập nhật thủ công nếu có
  const { _id, user_id, place_id, ...updateData } = dto;

  await this.reviewRepo.update(new ObjectId(id), updateData);
  
  await this.syncPlaceStats(review.place_id);
  return this.reviewRepo.findOne({ where: { _id: new ObjectId(id) } });
}

async toggleHelpful(id: string) {
  if (!ObjectId.isValid(id)) throw new BadRequestException('ID không hợp lệ');
  
  const review = await this.reviewRepo.findOne({ where: { _id: new ObjectId(id) } });
  if (!review) throw new NotFoundException('Không tìm thấy review');

  // Sử dụng update thay vì increment để đảm bảo tính tương thích cao với MongoDB
  await this.reviewRepo.update(
    new ObjectId(id), 
    { helpful_count: (review.helpful_count || 0) + 1 } as any
  );
  
  return { success: true, current_helpful_count: (review.helpful_count || 0) + 1 };
}

  // Merchant phản hồi review (chỉ chủ sở hữu địa điểm)
  async reply(id: string, content: string, user: any) {
    const review = await this.reviewRepo.findOne({ where: { _id: new ObjectId(id) } });
    if (!review) throw new NotFoundException('Không tìm thấy review');

    if (user.role !== 'ADMIN') {
      const place = await this.placeRepo.findOne({ where: { _id: new ObjectId(review.place_id) } });
      if (place?.ownerId !== user.sub) {
        throw new ForbiddenException('Chỉ chủ sở hữu địa điểm mới có thể phản hồi review');
      }
    }

    await this.reviewRepo.update(
      new ObjectId(id),
      {
        merchant_reply: content,
        merchant_reply_at: new Date(),
      } as any
    );

    return {
      success: true,
      message: 'Phản hồi đã được gửi thành công',
      reply_at: new Date(),
    };
  }

  // Xóa phản hồi của merchant
  async deleteReply(id: string, user: any) {
    const review = await this.reviewRepo.findOne({ where: { _id: new ObjectId(id) } });
    if (!review) throw new NotFoundException('Không tìm thấy review');
    if (!review.merchant_reply) throw new BadRequestException('Review này chưa có phản hồi');

    if (user.role !== 'ADMIN') {
      const place = await this.placeRepo.findOne({ where: { _id: new ObjectId(review.place_id) } });
      if (place?.ownerId !== user.sub) {
        throw new ForbiddenException('Chỉ chủ sở hữu địa điểm mới có thể xóa phản hồi');
      }
    }

    await this.reviewRepo.update(
      new ObjectId(id),
      {
        merchant_reply: null,
        merchant_reply_at: null,
      } as any
    );

    return { success: true, message: 'Phản hồi đã được xóa' };
  }

async remove(id: string, user: any) {
  if (!ObjectId.isValid(id)) throw new BadRequestException('ID không hợp lệ');

  const review = await this.reviewRepo.findOne({ where: { _id: new ObjectId(id) } });
  if (!review) throw new NotFoundException('Không tìm thấy review');

  // Kiểm tra quyền: Admin hoặc chính chủ review
  if (user.role !== 'ADMIN' && review.user_id !== user.sub) {
    throw new ForbiddenException('Không có quyền xóa review này');
  }

  const placeId = review.place_id;
  await this.reviewRepo.delete(new ObjectId(id));
  
  // Quan trọng: Phải đảm bảo syncPlaceStats chạy sau khi đã xóa
  await this.syncPlaceStats(placeId);
  
  return { success: true };
}
}