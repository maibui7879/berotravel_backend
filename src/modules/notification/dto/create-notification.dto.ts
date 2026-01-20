import { IsEnum, IsNotEmpty, IsOptional, IsString, IsObject } from 'class-validator';
import { NotificationType } from '../entities/notification.entity';

export class CreateNotificationDto {
  @IsNotEmpty()
  @IsString()
  recipient_id: string;

  @IsOptional()
  @IsString()
  sender_id?: string;

  @IsOptional()
  @IsString()
  sender_avatar?: string;

  @IsNotEmpty()
  @IsEnum(NotificationType)
  type: NotificationType;

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsString()
  message: string;

  @IsOptional()
  @IsObject()
  metadata?: any;
}