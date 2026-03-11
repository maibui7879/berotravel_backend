import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional } from 'class-validator';

export class ClaimPlaceDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description: 'Tải lên ảnh minh chứng, file tài liệu hoặc các tệp từ folder (giấy phép, chứng nhận...)',
    required: true,
  })
  @IsArray()
  @IsOptional() // Dùng Optional vì file sẽ được xử lý riêng bởi Interceptor
  business_proof: any[];
}
