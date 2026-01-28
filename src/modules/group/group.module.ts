import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupsService } from './group.service';
import { GroupsController } from './group.controller';
import { Group } from './entities/group.entity';
import { Journey } from '../journey/entities/journey.entity';
import { JourneysModule } from '../journey/journey.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([Group, Journey]), 
    forwardRef(() => JourneysModule),
  ],
  controllers: [GroupsController],
  providers: [GroupsService],
  
  exports: [GroupsService] 
})
export class GroupsModule {}