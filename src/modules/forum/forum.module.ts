// ../../modules/forum/forum.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ForumController } from './forum.controller';
import { ForumService } from './services/forum.service';
import { ForumPost, ForumComment, ForumTag } from './entities/forum.entity';
import { ForumReport } from './entities/forum-report.entity';
import { Journey } from '../journey/entities/journey.entity';
import { Place } from '../places/entities/place.entity';
import { NotificationsModule } from '../notification/notification.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ForumPost, ForumComment, ForumTag, ForumReport, Journey, Place]),
    NotificationsModule,
    UsersModule
  ],
  controllers: [ForumController],
  providers: [ForumService],
})
export class ForumModule {}