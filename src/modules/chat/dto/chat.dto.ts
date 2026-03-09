import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { MessageType } from '../entities/chat-message.entity';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiPropertyOptional({ description: 'ID của phòng chat (nếu đã có)' })
  @IsOptional()
  @IsString()
  room_id?: string;

  @ApiPropertyOptional({ description: 'ID của Journey (Nếu nhắn vào group chuyến đi)' })
  @IsOptional()
  @IsString()
  journey_id?: string;

  @ApiPropertyOptional({ description: 'ID người nhận (Nếu là chat 1-1)' })
  @IsOptional()
  @IsString()
  receiver_id?: string;

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

// [UPDATED] Vote Poll - journey_id thay vì group_id
export class VotePollDto {
  
  @ApiProperty({ description: 'Journey ID' })
  @IsNotEmpty()
  @IsString()
  room_id: string;

  @ApiPropertyOptional({ description: 'Journey ID (Tùy chọn)' })
  @IsOptional() // Cho phép gửi journey_id
  @IsString()
  journey_id?: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  message_id: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  option_id: string;
}

// [UPDATED] React Message - journey_id thay vì group_id
export class ReactMessageDto {
  @ApiProperty({ description: 'Journey ID' })
  @IsNotEmpty()
  @IsString()
  room_id: string;

  @ApiPropertyOptional({ description: 'Journey ID (Tùy chọn)' })
  @IsOptional() // Cho phép gửi journey_id
  @IsString()
  journey_id?: string;
  
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