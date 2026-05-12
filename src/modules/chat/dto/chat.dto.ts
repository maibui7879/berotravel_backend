import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { MessageType } from '../entities/chat-message.entity';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserMinifiedDto } from '../../users/dto/user-minified.dto';

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

export class ChatMessageResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() room_id: string;
  @ApiProperty() room_type: string;
  @ApiProperty() sender_id: string;
  @ApiProperty({ type: UserMinifiedDto }) sender?: UserMinifiedDto;
  @ApiPropertyOptional() content?: string;
  @ApiProperty({ enum: MessageType }) type: MessageType;
  @ApiPropertyOptional() metadata?: any;
  @ApiPropertyOptional() reply_to_id?: string;
  @ApiProperty({ type: [String], default: [] }) reactions: any[];
  @ApiProperty() created_at: Date;
}

export class VotePollDto {
  
  @ApiProperty({ description: 'Journey ID' })
  @IsNotEmpty()
  @IsString()
  room_id: string;

  @ApiPropertyOptional({ description: 'Journey ID (Tùy chọn)' })
  @IsOptional()
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

export class ReactMessageDto {
  @ApiProperty({ description: 'Journey ID' })
  @IsNotEmpty()
  @IsString()
  room_id: string;

  @ApiPropertyOptional({ description: 'Journey ID (Tùy chọn)' })
  @IsOptional() 
  @IsString()
  journey_id?: string;
  
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  message_id: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  emoji: string; 
}

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