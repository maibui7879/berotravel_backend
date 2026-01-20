import { Module, Global } from '@nestjs/common'; // Thêm @Global để dùng ở mọi nơi
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './notification.service';
import { NotificationsController } from './notification.controller';
import { NotificationsGateway } from './notification.gateway';
import { Notification } from './entities/notification.entity';
import { JwtModule } from '@nestjs/jwt';

@Global() 
@Module({
  imports: [
    TypeOrmModule.forFeature([Notification]),
    JwtModule.register({}),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsGateway],
  exports: [NotificationsService], 
})
export class NotificationsModule {}