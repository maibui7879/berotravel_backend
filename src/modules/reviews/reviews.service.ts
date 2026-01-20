import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Review, ReviewStatus } from './entities/review.entity';
import { Place } from '../places/entities/place.entity';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review) private readonly reviewRepo: MongoRepository<Review>,
    @InjectRepository(Place) private readonly placeRepo: MongoRepository<Place>,
  ) {}

  async create(dto: any, userId: string) {
    const { place_id, cleanliness, service, location, price, content, images } = dto;

    const existing = await this.reviewRepo.findOne({ where: { place_id, user_id: userId } });
    if (existing) throw new BadRequestException('Bạn đã đánh giá địa điểm này rồi');

    const place = await this.placeRepo.findOne({ where: { _id: new ObjectId(place_id) } });
    if (!place) throw new NotFoundException('Địa điểm không tồn tại');

    const avgRating = (cleanliness + service + location + price) / 4;

    const review = this.reviewRepo.create({
      place_id,
      user_id: userId,
      content,
      images: images || [],
      criteria: { cleanliness, service, location, price },
      rating: Number(avgRating.toFixed(1)),
      helpful_count: 0,
      status: ReviewStatus.PUBLISHED,
    } as any);

    const saved = await this.reviewRepo.save(review);
    await this.syncPlaceStats(place_id);
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

    // Xây dựng điều kiện Filter
    const where: any = { place_id: placeId, status: ReviewStatus.PUBLISHED };
    if (filter === 'POSITIVE') where.rating = { $gte: 4 };
    if (filter === 'NEGATIVE') where.rating = { $lte: 2 };

    // Xây dựng điều kiện Sort
    const order = { [sort_by]: sort_order === 'DESC' ? -1 : 1 };

    const [data, total] = await this.reviewRepo.findAndCount({
      where,
      skip,
      take,
      order: order as any,
    });

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
    const stats = await this.reviewRepo.aggregate([
      { $match: { place_id: placeId, status: ReviewStatus.PUBLISHED } },
      { $group: { _id: '$place_id', avg: { $avg: '$rating' }, total: { $sum: 1 } } }
    ]).toArray();

    const updateData = stats.length > 0 
      ? { rating_avg: Number(stats[0].avg.toFixed(1)), review_count: stats[0].total }
      : { rating_avg: 0, review_count: 0 };

    await this.placeRepo.update(new ObjectId(placeId), updateData as any);
  }

  async update(id: string, dto: any, userId: string) {
    const review = await this.reviewRepo.findOne({ where: { _id: new ObjectId(id) } });
    if (!review) throw new NotFoundException('Không tìm thấy review');
    if (review.user_id !== userId) throw new ForbiddenException('Không có quyền');

    const diff = (new Date().getTime() - review.created_at.getTime()) / (1000 * 3600);
    if (diff > 48) throw new BadRequestException('Chỉ được sửa trong vòng 48h');

    await this.reviewRepo.update(new ObjectId(id), dto);
    await this.syncPlaceStats(review.place_id);
    return this.reviewRepo.findOne({ where: { _id: new ObjectId(id) } });
  }

  async toggleHelpful(id: string) {
    await this.reviewRepo.increment({ _id: new ObjectId(id) } as any, 'helpful_count', 1);
    return { success: true };
  }

  async reply(id: string, content: string) {
    await this.reviewRepo.update(new ObjectId(id), { merchant_reply: content });
    return { success: true };
  }

  async remove(id: string, user: any) {
    const review = await this.reviewRepo.findOne({ where: { _id: new ObjectId(id) } });
    if (!review) throw new NotFoundException('Không tìm thấy review');
    if (user.role !== 'ADMIN' && review.user_id !== user.sub) throw new ForbiddenException('Không có quyền');

    await this.reviewRepo.delete(new ObjectId(id));
    await this.syncPlaceStats(review.place_id);
    return { success: true };
  }
}