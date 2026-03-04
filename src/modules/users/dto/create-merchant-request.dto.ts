// src/modules/users/dto/create-merchant-request.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';

export class CreateMerchantRequestDto {
  @IsString()
  @IsNotEmpty()
  business_name: string;

  @IsString()
  @IsNotEmpty()
  tax_code: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsNotEmpty()
  phone_number: string;
}