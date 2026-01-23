import { Module } from '@nestjs/common';
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
import { NotificationsModule } from '../notification/notification.module'; // [FIX 2] Import NotificationsModule
import { BookingsModule } from '../bookings/bookings.module';
@Module({
  imports: [
    // Khai báo các Entity để Service dùng @InjectRepository
    TypeOrmModule.forFeature([Journey, Place, InventoryUnit, Availability]),
    
    GroupsModule,
    UsersModule,
    NotificationsModule,
    BookingsModule // [FIX 2] Cần module này để inject NotificationsService
  ],
  controllers: [JourneysController],
  providers: [
    JourneysService,       // Service chính (Orchestrator)
    CostEstimationService, // Service tính toán chi phí
    
    // [FIX 1] Phải khai báo 3 service này vào providers thì NestJS mới khởi tạo được
    JourneyAccessService,
    JourneySchedulerService,
    JourneyBudgetService,
  ],
  exports: [
    JourneysService, 
    CostEstimationService
  ],
})
export class JourneysModule {}