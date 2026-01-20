import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { MessageType } from '../entities/chat-message.entity';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// 1. Gửi tin nhắn
export class SendMessageDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  group_id: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiProperty({ enum: MessageType })
  @IsEnum(MessageType)
  type: MessageType;

  @ApiPropertyOptional()
  @IsOptional()
  metadata?: any; 

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reply_to_id?: string;
}

// 2. Vote Poll
export class VotePollDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  group_id: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  message_id: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  option_id: string;
}

export class ReactMessageDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  group_id: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  message_id: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  emoji: string; // Client gửi chuỗi icon lên
}

// 3. Tìm kiếm tin nhắn
export class SearchChatDto {
  @ApiPropertyOptional({ description: 'Từ khóa tìm kiếm' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: 'Lọc theo người gửi' })
  @IsOptional()
  @IsString()
  sender_id?: string;
}