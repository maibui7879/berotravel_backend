import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Controller
import { JourneysController } from './journey.controller';

// Main Services
import { JourneysService } from './services/journey.service';
import { CostEstimationService } from './services/cost-estimation.service';

// [FIX 1] Import các Sub-Services mới tách ra
import { JourneyAccessService } from './services/journey-access.service';
import { JourneySchedulerService } from './services/journey-scheduler.service';
import { JourneyBudgetService } from './services/journey-budget.service';

// Entities
import { Journey } from './entities/journey.entity';
import { Place } from '../places/entities/place.entity';
import { InventoryUnit } from '../bookings/entities/inventory-unit.entity';
import { Availability } from '../bookings/entities/availability.entity';

// External Modules
import { GroupsModule } from '../group/group.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notification/notification.module'; 
import { BookingsModule } from '../bookings/bookings.module';
import { JourneyTrackingService } from './services/journey-tracking.service';
@Module({
  imports: [
    TypeOrmModule.forFeature([Journey, Place, InventoryUnit, Availability]),
    
    forwardRef(() => GroupsModule),
    UsersModule,
    NotificationsModule,
    BookingsModule 
  ],
  controllers: [JourneysController],
  providers: [
    JourneysService,       
    CostEstimationService, 
    
    JourneyAccessService,
    JourneySchedulerService,
    JourneyBudgetService,
    JourneyTrackingService,
  ],
  exports: [
    JourneysService, 
    CostEstimationService
  ],
})
export class JourneysModule {}