import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'; // 1. Phải import cái này
import { FriendsService } from './friend.service';
import { FriendsController } from './friend.controller';

// 2. Import đúng đường dẫn Entity
import { Friendship } from './entities/friendship.entity'; 
import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    // 3. Đăng ký Entity vào đây thì Service mới dùng được @InjectRepository
    TypeOrmModule.forFeature([Friendship, User]), 
  ],
  controllers: [FriendsController],
  providers: [FriendsService],
  exports: [FriendsService],
})
export class FriendModule {}