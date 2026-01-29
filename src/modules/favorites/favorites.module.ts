import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FavoritesService } from './favorites.service';
import { FavoritesController } from './favorites.controller';

import { Favorite } from './entities/favorite.entity';
import { Place } from '../places/entities/place.entity';
import { Journey } from '../journey/entities/journey.entity';
import { FriendModule } from '../friend/friend.module';
import { UsersModule } from '../users/users.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([Favorite, Place, Journey]),
    FriendModule,
    UsersModule
  ],
  controllers: [FavoritesController],
  providers: [FavoritesService],
})
export class FavoritesModule {}