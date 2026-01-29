import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Place } from './entities/place.entity';
import { PlacesService } from './places.service';
import { PlacesController } from './places.controller';
import { Journey } from '../journey/entities/journey.entity';
import { FavoritesModule } from '../favorites/favorites.module';
import { UsersModule } from '../users/users.module';
import { PlaceEditRequest } from './entities/place-edit-request.entity';
import { JourneysModule } from '../journey/journey.module';
@Module({
  imports: [TypeOrmModule.forFeature([Place, PlaceEditRequest, Journey]), Journey, FavoritesModule, UsersModule, JourneysModule],
  controllers: [PlacesController],
  providers: [PlacesService],
  exports: [PlacesService],
})
export class PlacesModule {}