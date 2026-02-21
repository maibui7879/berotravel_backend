import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';

import { Place } from '../../places/entities/place.entity';
import { UserTravelProfile } from '../../users/entities/user-travel-profile.entity';
import { RecommendedPlaceDto, GetRecommendedPlacesDto } from '../dto/recommendation.dto';

/**
 * Core Recommendation Engine
 * 
 * Công thức tính điểm phù hợp (Matching Score):
 * TotalScore = (LongTermMatch * 0.6) + (ShortTermMatch * 0.3) + (PopularityBoost * 0.1)
 * 
 * 1. LongTermMatch: Vector similarity giữa user interest_vector và place tags/categories
 * 2. ShortTermMatch: Nếu user vừa search hoặc view element này gần đây
 * 3. PopularityBoost: Rating & review count để tránh dead places
 */
@Injectable()
export class RecommendationEngineService {
  private readonly logger = new Logger(RecommendationEngineService.name);

  constructor(
    @InjectRepository(Place)
    private readonly placeRepo: MongoRepository<Place>,
    @InjectRepository(UserTravelProfile)
    private readonly profileRepo: MongoRepository<UserTravelProfile>,
  ) {}

  /**
   * Lấy danh sách địa điểm được gợi ý dựa trên Travel DNA
   * @param userId User ID
   * @param options Filter, limit, pagination
   * @returns List of recommended places with matching scores
   */
  async getRecommendedPlaces(
    userId: string,
    options: GetRecommendedPlacesDto,
  ): Promise<RecommendedPlaceDto[]> {
    // 1. Lấy profile và Travel DNA của user
    const profile = await this.profileRepo.findOne({ where: { user_id: userId } });
    
    if (!profile) {
      this.logger.warn(`No profile found for user ${userId}, returning popular places`);
      return this.getPopularPlaces(options);
    }

    // 2. Khởi tạo query cho places
    const query: any = {};
    
    if (options.category) {
      query.category = { $in: [options.category] };
    }
    
    if (options.tags && options.tags.length > 0) {
      query.tags = { $in: options.tags };
    }

    // 3. Nếu location filter, thêm geo query
    if (options.latitude && options.longitude && options.maxDistance) {
      query.location = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [options.longitude, options.latitude],
          },
          $maxDistance: options.maxDistance * 1000, // Convert km to meters
        },
      };
    }

    // 4. Lấy candidate places
    const places = await this.placeRepo.find({
      where: query as any,
      take: 100, // Load more than limit, sẽ filter theo score
      skip: options.skip,
    });

    // 5. Tính matching score cho mỗi place
    const recommendedPlaces: RecommendedPlaceDto[] = places
      .map(place => {
        const matchingData = this.calculateMatchingScore(place, profile);
        
        return {
          _id: place._id.toString(),
          name: place.name,
          description: place.description,
          category: Array.isArray(place.category) ? place.category : [place.category],
          tags: place.tags || [],
          image_url: place.images && place.images.length > 0 ? place.images[0] : '',
          average_rating: place.rating || 0,
          review_count: place.reviewCount || 0,
          matching_score: matchingData.totalScore,
          matching_tags: matchingData.matchingTags,
          estimated_cost: place.priceLevel || 0,
          distance: options.latitude && options.longitude ? 
            this.calculateDistance(
              options.latitude,
              options.longitude,
              place.location?.coordinates[1] || 0,
              place.location?.coordinates[0] || 0,
            ) : undefined,
        };
      })
      .filter(p => p.matching_score > 0) // Chỉ lấy places có liên quan
      .sort((a, b) => b.matching_score - a.matching_score)
      .slice(0, options.limit || 10);

    return recommendedPlaces;
  }

  /**
   * Tính matching score giữa user interest vector và place
   * 
   * Công thức:
   * - LongTermMatch: Tính cosine similarity giữa interest_vector và place tags
   * - ShortTermMatch: Bonus nếu user vừa search hoặc view place này  
   * - PopularityBoost: Normalized rating * review count để tránh fake places
   */
  private calculateMatchingScore(
    place: Place,
    profile: UserTravelProfile,
  ): {
    totalScore: number;
    matchingTags: string[];
  } {
    const placeCategories = Array.isArray(place.category) ? place.category : [place.category];
    const placeTags = place.tags || [];
    
    // Normalize place tags: Uppercase để match với interest_vector
    const normalizedPlaceTags = [
      ...placeCategories.map(c => String(c).toUpperCase()),
      ...placeTags.map(t => t.toUpperCase()),
    ];

    let longTermMatch = 0;
    const matchingTags: string[] = [];

    // 1. Long-term matching (từ interest_vector)
    normalizedPlaceTags.forEach(tag => {
      if (profile.interest_vector && profile.interest_vector[tag]) {
        longTermMatch += profile.interest_vector[tag];
        matchingTags.push(tag);
      }
    });

    // Normalize long-term match (0-100)
    const maxPossibleScore = normalizedPlaceTags.length * 10; // MAX_CATEGORY_SCORE ≈ 10
    const normalizedLongTerm = (longTermMatch / Math.max(maxPossibleScore, 1)) * 100;

    // 2. Short-term matching (từ recent search/view)
    let shortTermMatch = 0;
    if (profile.short_term_interests && profile.short_term_interests.length > 0) {
      profile.short_term_interests.forEach(interest => {
        if (normalizedPlaceTags.includes(interest.tag.toUpperCase())) {
          shortTermMatch += interest.score;
        }
      });
      // Normalize (0-100)
      shortTermMatch = (shortTermMatch / 9) * 100; // max short_term score = 3.0 * 3
    }

    // 3. Popularity boost (tránh dead places)
    let popularityBoost = 0;
    if (place.rating && place.reviewCount) {
      const ratingNorm = (place.rating / 5) * 100; // 0-100
      const reviewBoost = Math.min((place.reviewCount / 100) * 10, 10); // Cap at 10%
      popularityBoost = ratingNorm * (1 + reviewBoost / 100);
    }

    // 4. Kết hợp tất cả thành overall score
    const totalScore = 
      normalizedLongTerm * 0.6 + 
      shortTermMatch * 0.3 + 
      popularityBoost * 0.1;

    return {
      totalScore: Math.round(totalScore * 100) / 100, // 2 decimal places
      matchingTags: [...new Set(matchingTags)], // De-duplicate
    };
  }

  /**
   * Fallback: Lấy top popular places khi user không có profile
   */
  private async getPopularPlaces(
    options: GetRecommendedPlacesDto,
  ): Promise<RecommendedPlaceDto[]> {
    const query: any = {};
    
    if (options.category) {
      query.category = { $in: [options.category] };
    }

    const places = await this.placeRepo.find({
      where: query as any,
      take: options.limit || 10,
      skip: options.skip,
    });

    return places.map(place => ({
      _id: place._id.toString(),
      name: place.name,
      description: place.description,
      category: Array.isArray(place.category) ? place.category : [place.category],
      tags: place.tags || [],
      image_url: place.images && place.images.length > 0 ? place.images[0] : '',
      average_rating: place.rating || 0,
      review_count: place.reviewCount || 0,
      matching_score: ((place.rating || 0) / 5) * 100,
      matching_tags: [],
      estimated_cost: place.priceLevel || 0,
    }));
  }

  /**
   * Haversine formula: Calculate distance between two coordinates (in km)
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // Earth radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 100) / 100;
  }

  private toRad(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }
}
