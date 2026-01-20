import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JourneysService } from './journey.service';
import { JourneysController } from './journey.controller';
import { Journey } from './entities/journey.entity';
import { Place } from '../places/entities/place.entity';
import { InventoryUnit } from '../bookings/entities/inventory-unit.entity';
import { Availability } from '../bookings/entities/availability.entity';
import { GroupsModule } from '../group/group.module';
import { UsersModule } from '../users/users.module';
import { CostEstimationService } from './services/cost-estimation.service';

@Module({
  imports: [TypeOrmModule.forFeature([Journey, Place, InventoryUnit, Availability]), GroupsModule, UsersModule],
  controllers: [JourneysController],
  providers: [JourneysService, CostEstimationService],
  exports: [JourneysService, CostEstimationService],
})
export class JourneysModule {}