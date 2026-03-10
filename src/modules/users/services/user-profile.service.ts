import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';

import { UserTravelProfile } from '../entities/user-travel-profile.entity';
import { Place } from '../../../modules/places/entities/place.entity';
import { User } from '../entities/user.entity';
import { UserActionType, ACTION_SCORES, MAX_CATEGORY_SCORE } from '../../../common/constants';
import { DNA_MAPPING, UserProfileUtils } from './user-profile.utils';

@Injectable()
export class UserProfileService {
  constructor(
    @InjectRepository(UserTravelProfile)
    private readonly profileRepo: MongoRepository<UserTravelProfile>,
    @InjectRepository(Place)
    private readonly placeRepo: MongoRepository<Place>,
    @InjectRepository(User)
    private readonly userRepo: MongoRepository<User>,
  ) {}

  // 1. KHỞI TẠO PROFILE (Cold Start)
  async initProfile(userId: string, initialPreferences: string[] = []) {
    const vector: Record<string, number> = {};
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

  // 2. [CORE] TÍNH ĐIỂM DNA (Xử lý khi User tương tác với địa điểm)
  async scoreAction(userId: string, placeId: string, action: UserActionType) {
    let profile = await this.profileRepo.findOne({ where: { user_id: userId } });
    if (!profile) profile = await this.initProfile(userId);

    const place = await this.placeRepo.findOne({ where: { _id: new ObjectId(placeId) } });
    if (!place) return;

    const actionScore = ACTION_SCORES[action] || 0.1;
    const isNegative = actionScore < 0;
    const features: { key: string; weight: number }[] = [];

    // A. Xử lý Category (Trọng số 1.0)
    const categories = Array.isArray(place.category) ? place.category : [place.category];
    categories.forEach(c => {
      if (c) features.push({ key: String(c).toUpperCase(), weight: 1.0 });
    });

    // B. Xử lý Tags (Trọng số 0.5 - Chuẩn hóa IN HOA để gom nhóm)
    if (place.tags && Array.isArray(place.tags)) {
      place.tags.forEach(t => {
        if (t) features.push({ key: t.trim().toUpperCase(), weight: 0.5 });
      });
    }

    // Cập nhật Vector trong Profile
    features.forEach(feature => {
      const currentScore = profile.interest_vector[feature.key] || 0;
      let newScore = currentScore + (actionScore * feature.weight);

      // Capping & Parsing
      profile.interest_vector[feature.key] = parseFloat(
        Math.max(0, Math.min(newScore, MAX_CATEGORY_SCORE)).toFixed(2)
      );
    });

    if (!isNegative) profile.total_actions += 1;
    profile.updated_at = new Date();
    await this.profileRepo.save(profile);
  }

  // 3. TRẢ VỀ TRAVEL DNA CARD (Dành cho Frontend hiển thị)
  async getInterestVector(userId: string) {
    const [profile, user] = await Promise.all([
      this.profileRepo.findOne({ where: { user_id: userId } }),
      this.userRepo.findOne({ where: { _id: new ObjectId(userId) } })
    ]);

    if (!profile) return { message: 'Chưa có dữ liệu DNA' };

    const rawVector = profile.interest_vector || {};

    // A. Xử lý Radar Chart: Gom điểm từ nhiều key liên quan vào 1 nhóm UI
    const radarChart = DNA_MAPPING.map(group => {
      const groupScore = group.keys.reduce((sum, key) => sum + (rawVector[key] || 0), 0);
      return {
        category: group.label,
        value: Math.min(Math.round((groupScore / 10) * 100), 100), // Thang điểm 100
        fullMark: 100,
        color: group.color
      };
    });

    // B. Xác định Persona & Catchphrase dựa trên nhóm cao nhất
    const sortedGroups = [...radarChart].sort((a, b) => b.value - a.value);
    const topGroup = UserProfileUtils.getDNAGroupByLabel(sortedGroups[0]?.category) || DNA_MAPPING[4];

    // C. Long-term Traits (Top 2 sở thích mạnh nhất)
    const totalDnaValue = radarChart.reduce((sum, item) => sum + item.value, 0);
    const longTermTraits = sortedGroups.slice(0, 2).map((item, index) => {
      const config = DNA_MAPPING.find(g => g.label === item.category);
      return {
        tag: config?.id,
        label: item.category,
        icon: config?.icon,
        score_percentage: totalDnaValue > 0 ? Math.round((item.value / totalDnaValue) * 100) : 0,
        description: index === 0 ? 'Sở thích bền vững nhất của bạn.' : 'Bạn thường xuyên quan tâm đến trải nghiệm này.'
      };
    });

    // D. Short-term Vibe
    const recentTags = (profile.short_term_interests || [])
      .sort((a, b) => new Date(b.last_active).getTime() - new Date(a.last_active).getTime())
      .slice(0, 3);

    // E. RENDER JSON "TRAVEL DNA CARD"
    return {
      card_version: "1.0",
      user_summary: {
        display_name: user?.fullName || "Lữ khách",
        avatar_url: user?.avatar || "",
        persona: UserProfileUtils.getPersonaLabel(topGroup.label), 
        catchphrase: topGroup.catchphrase,
        activity_level: profile.total_actions > 50 ? "Chuyên gia xê dịch" : "Người khám phá",
        total_actions: profile.total_actions || 0,
        member_since: user?.createdAt || new Date()
      },
      visual_data: {
        radar_chart: radarChart,
        dominant_color: topGroup.color
      },
      dna_details: {
        long_term_traits: longTermTraits,
        current_vibe: {
          title: "Cơn sốt hiện tại",
          vibe_tags: recentTags.map(t => t.tag),
          description: recentTags.length > 0 
            ? `Gần đây bạn đang quan tâm nhiều đến các địa điểm liên quan tới ${recentTags[0].tag}.`
            : "Bạn đang trong giai đoạn nghỉ ngơi và lên kế hoạch mới."
        }
      },
      share_metadata: UserProfileUtils.generateShareMetadata(userId, topGroup)
    };
  }

  // 4. Xử lý Search Intent
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
        profile.short_term_interests.push({ tag, score: 1.0, last_active: NOW });
      }
    });

    // Filter 14 ngày
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    profile.short_term_interests = profile.short_term_interests.filter(i => new Date(i.last_active) > twoWeeksAgo);

    await this.profileRepo.save(profile);
  }

  private async extractTagsFromKeyword(keyword: string): Promise<string[]> {
    if (!keyword || keyword.trim() === '') return [];
    const safeKeyword = keyword.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

    const places = await this.placeRepo.find({ 
      where: { 
        $or: [
          { name: { $regex: new RegExp(safeKeyword, 'i') } },
          { tags: { $in: [new RegExp(safeKeyword, 'i')] } }
        ]
      } as any,
      take: 5,
      select: ['category', 'tags'] as any
    });

    const foundData = new Set<string>();
    places.forEach(p => {
      const cats = Array.isArray(p.category) ? p.category : [p.category];
      cats.forEach(c => foundData.add(String(c).toUpperCase()));
      if (p.tags) p.tags.forEach(t => foundData.add(t.toUpperCase()));
    });

    const userKeywords = keyword.toUpperCase().split(' ');
    return Array.from(foundData).filter(dataPoint => 
      userKeywords.some(k => dataPoint.includes(k) || k.includes(dataPoint))
    );
  }
}