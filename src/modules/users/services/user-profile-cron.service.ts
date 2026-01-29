import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { UserTravelProfile } from '../entities/user-travel-profile.entity';

@Injectable()
export class UserProfileCronService {
  private readonly logger = new Logger(UserProfileCronService.name);

  constructor(
    @InjectRepository(UserTravelProfile)
    private readonly profileRepo: MongoRepository<UserTravelProfile>,
  ) {}

  // Chạy vào 00:00 sáng Chủ Nhật hàng tuần
  @Cron(CronExpression.EVERY_WEEK)
  async handleTimeDecay() {
    this.logger.log('Running Time Decay Algorithm...');

    // 1. Lấy tất cả profile (Lưu ý: Nếu data lớn phải dùng Cursor/Pagination)
    const profiles = await this.profileRepo.find(); 
    
    // Hệ số suy giảm (giữ lại 90% điểm số cũ)
    const DECAY_FACTOR = 0.9; 
    // Ngưỡng tối thiểu để xóa luôn cho sạch Data
    const MIN_THRESHOLD = 0.1; 

    for (const profile of profiles) {
        let hasChange = false;

        // Duyệt qua từng category trong vector
        for (const [category, score] of Object.entries(profile.interest_vector)) {
            // Giảm điểm
            let newScore = score * DECAY_FACTOR;

            if (newScore < MIN_THRESHOLD) {
                // Nếu điểm quá bé -> Xóa luôn khỏi vector cho nhẹ DB
                delete profile.interest_vector[category];
            } else {
                // Làm tròn 2 số thập phân
                profile.interest_vector[category] = parseFloat(newScore.toFixed(2));
            }
            hasChange = true;
        }

        // 2. Logic dọn dẹp Short-term interest (Quá 14 ngày thì xóa)
        // (Bạn đã có logic này lúc update, nhưng chạy cron để vét sạch những user lâu ko online)
        if (profile.short_term_interests && profile.short_term_interests.length > 0) {
            const twoWeeksAgo = new Date();
            twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
            
            const oldLen = profile.short_term_interests.length;
            profile.short_term_interests = profile.short_term_interests.filter(
                i => new Date(i.last_active) > twoWeeksAgo
            );
            
            if (profile.short_term_interests.length !== oldLen) hasChange = true;
        }

        if (hasChange) {
            await this.profileRepo.save(profile);
        }
    }

    this.logger.log(`Finished Time Decay for ${profiles.length} profiles.`);
  }
}