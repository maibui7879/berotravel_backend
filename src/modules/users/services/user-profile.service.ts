import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';

import { UserTravelProfile } from '../entities/user-travel-profile.entity';
import { Place } from 'src/modules/places/entities/place.entity';
import { UserActionType, ACTION_SCORES, MAX_CATEGORY_SCORE } from 'src/common/constants';

@Injectable()
export class UserProfileService {
  constructor(
    @InjectRepository(UserTravelProfile)
    private readonly profileRepo: MongoRepository<UserTravelProfile>,
    @InjectRepository(Place)
    private readonly placeRepo: MongoRepository<Place>,
  ) {}

  // 1. Khởi tạo Profile
  async initProfile(userId: string, initialPreferences: string[] = []) {
    const vector: Record<string, number> = {};
    
    // Nếu user có chọn sở thích ban đầu (Cold Start)
    if (initialPreferences && initialPreferences.length > 0) {
        initialPreferences.forEach(tag => {
            vector[tag.toUpperCase()] = 1.0; 
        });
    }

    const profile = this.profileRepo.create({
        user_id: userId,
        interest_vector: vector,
        total_actions: 0
    });
    return await this.profileRepo.save(profile);
  }

  // 2. [CORE] Tính điểm DNA (Category + Tags)
  async scoreAction(userId: string, placeId: string, action: UserActionType) {
    let profile = await this.profileRepo.findOne({ where: { user_id: userId } });
    if (!profile) profile = await this.initProfile(userId);

    const place = await this.placeRepo.findOne({ where: { _id: new ObjectId(placeId) } });
    if (!place) return;

    // Xác định điểm cơ bản của hành động
    const actionScore = ACTION_SCORES[action] || 0.1;
    const isNegative = actionScore < 0;

    // Chuẩn bị dữ liệu để cộng điểm
    const featuresToScore: { key: string; weight: number }[] = [];

    // A. Xử lý Category (Trọng số 1.0)
    const categories = Array.isArray(place.category) ? place.category : [place.category];
    categories.forEach(c => {
        if (c) featuresToScore.push({ key: String(c).toUpperCase(), weight: 1.0 });
    });

    // B. Xử lý Tags (Trọng số 0.5 - Tags mang tính bổ trợ)
    if (place.tags && Array.isArray(place.tags)) {
        place.tags.forEach(t => {
            if (t) featuresToScore.push({ key: t.trim().toUpperCase(), weight: 0.5 });
        });
    }

    // Vòng lặp tính toán và cập nhật Vector
    featuresToScore.forEach(feature => {
        const currentScore = profile.interest_vector[feature.key] || 0;
        
        // Công thức: Điểm Mới = Điểm Cũ + (Điểm Hành Động * Trọng Số Loại)
        let delta = actionScore * feature.weight;
        let newScore = currentScore + delta;

        // Capping (Giới hạn)
        if (newScore > MAX_CATEGORY_SCORE) newScore = MAX_CATEGORY_SCORE;
        if (newScore < 0) newScore = 0;

        profile.interest_vector[feature.key] = parseFloat(newScore.toFixed(2));
    });

    if (!isNegative) profile.total_actions += 1;
    
    profile.updated_at = new Date();
    await this.profileRepo.save(profile);
  }

  // 3. Xử lý Search Intent (Short-term Interest)
  async trackUserSearch(userId: string, keyword: string) {
    let profile = await this.profileRepo.findOne({ where: { user_id: userId } });
    if (!profile) profile = await this.initProfile(userId);

    const relatedTags = await this.extractTagsFromKeyword(keyword);
    
    if (relatedTags.length === 0) return;

    if (!profile.short_term_interests) profile.short_term_interests = [];
    const NOW = new Date();

    relatedTags.forEach(tag => {
        const existing = profile.short_term_interests.find(i => i.tag === tag);
        if (existing) {
            existing.score = Math.min(existing.score + 0.5, 3.0); 
            existing.last_active = NOW;
        } else {
            profile.short_term_interests.push({
                tag: tag,
                score: 1.0,
                last_active: NOW
            });
        }
    });

    // Clean up cũ (quá 14 ngày)
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    profile.short_term_interests = profile.short_term_interests.filter(
        i => new Date(i.last_active) > twoWeeksAgo
    );

    await this.profileRepo.save(profile);
  }

  // Helper: Tìm tag từ keyword
  private async extractTagsFromKeyword(keyword: string): Promise<string[]> {
      const places = await this.placeRepo.find({ 
          where: { 
             $or: [
                 { name: { $regex: new RegExp(keyword, 'i') } },
                 { tags: { $in: [new RegExp(keyword, 'i')] } }
             ]
          } as any,
          take: 5,
          select: ['category', 'tags'] as any
      });
      
      const foundData = new Set<string>();
      
      places.forEach(p => {
          const cats = Array.isArray(p.category) ? p.category : [p.category];
          cats.forEach(c => foundData.add(String(c).toUpperCase()));

          if (p.tags) {
              p.tags.forEach(t => foundData.add(t.toUpperCase()));
          }
      });
      
      const userKeywords = keyword.toUpperCase().split(' ');
      return Array.from(foundData).filter(dataPoint => 
          userKeywords.some(k => dataPoint.includes(k) || k.includes(dataPoint))
      );
  }

  async getInterestVector(userId: string) {
    const profile = await this.profileRepo.findOne({ where: { user_id: userId } });
    return profile ? profile.interest_vector : {};
  }
}