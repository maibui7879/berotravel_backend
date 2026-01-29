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
    
    if (initialPreferences && initialPreferences.length > 0) {
        initialPreferences.forEach(tag => {
            vector[tag] = 1.0; 
        });
    }

    const profile = this.profileRepo.create({
        user_id: userId,
        interest_vector: vector,
        total_actions: 0
    });
    
    return await this.profileRepo.save(profile);
  }

  // 2. Tính điểm hành động (Travel DNA)
  async scoreAction(userId: string, placeId: string, action: UserActionType) {
    let profile = await this.profileRepo.findOne({ where: { user_id: userId } });
    if (!profile) {
        profile = await this.initProfile(userId);
    }

    const isNegativeAction = ACTION_SCORES[action] < 0;

    const place = await this.placeRepo.findOne({ where: { _id: new ObjectId(placeId) } });
    if (!place || !place.category) return;

    const scoreToAdd = ACTION_SCORES[action] || 0.1;

    const categoriesToScore = Array.isArray(place.category) 
        ? place.category 
        : [place.category];

    categoriesToScore.forEach(cat => {
        const key = String(cat);
        const currentScore = profile.interest_vector[key] || 0;
        let newScore = currentScore + scoreToAdd;

        if (newScore > MAX_CATEGORY_SCORE) newScore = MAX_CATEGORY_SCORE;
        if (newScore < 0) newScore = 0;

        profile.interest_vector[key] = parseFloat(newScore.toFixed(2));
    });

    if (!isNegativeAction) {
        profile.total_actions += 1;
    }
    
    profile.updated_at = new Date();
    await this.profileRepo.save(profile);
  }

  // 3. Xử lý Search Intent
  async trackUserSearch(userId: string, keyword: string) {
    let profile = await this.profileRepo.findOne({ where: { user_id: userId } });
    if (!profile) profile = await this.initProfile(userId);

    // Gọi hàm private ở dưới
    const derivedTags = await this.extractTagsFromKeyword(keyword);
    if (derivedTags.length === 0) return;

    if (!profile.short_term_interests) profile.short_term_interests = [];

    const NOW = new Date();
    derivedTags.forEach(tag => {
        const existing = profile.short_term_interests.find(i => i.tag === tag);
        if (existing) {
            existing.score = Math.min(existing.score + 0.2, 2.0);
            existing.last_active = NOW;
        } else {
            profile.short_term_interests.push({
                tag: tag,
                score: 0.5,
                last_active: NOW
            });
        }
    });

    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    
    profile.short_term_interests = profile.short_term_interests.filter(
        i => new Date(i.last_active) > twoWeeksAgo
    );

    await this.profileRepo.save(profile);
  }

  // 4. Helper Function (Private)
  private async extractTagsFromKeyword(keyword: string): Promise<string[]> {
      const places = await this.placeRepo.find({ 
          where: { name: { $regex: new RegExp(keyword, 'i') } },
          take: 5
      });
      
      const tags = new Set<string>();
      places.forEach(p => {
          if (p.category) {
              const cats = Array.isArray(p.category) ? p.category : [p.category];
              cats.forEach(c => tags.add(String(c)));
          }
      });
      
      return Array.from(tags);
  }

  // 5. Lấy vector
  async getInterestVector(userId: string) {
    const profile = await this.profileRepo.findOne({ where: { user_id: userId } });
    return profile ? profile.interest_vector : {};
  }
}