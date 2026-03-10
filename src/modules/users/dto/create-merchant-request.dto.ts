// src/modules/users/dto/create-merchant-request.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMerchantRequestDto {
  @ApiProperty({
    description: 'Tên doanh nghiệp/cửa hàng',
    example: 'BeroTravel - Chuyên Gia Du Lịch',
    minLength: 3,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  business_name: string;

  @ApiProperty({
    description: 'Mã số thuế doanh nghiệp (MST)',
    example: '0123456789',
    minLength: 10,
    maxLength: 15,
  })
  @IsString()
  @IsNotEmpty()
  tax_code: string;

  @ApiProperty({
    description: 'Địa chỉ đăng ký kinh doanh',
    example: '123 Phố Tây Hồ, Quận Tây Hồ, Hà Nội',
    minLength: 10,
    maxLength: 200,
  })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({
    description: 'Số điện thoại liên hệ doanh nghiệp',
    example: '+84912345678',
    minLength: 10,
    maxLength: 20,
  })
  @IsString()
  @IsNotEmpty()
  phone_number: string;
}