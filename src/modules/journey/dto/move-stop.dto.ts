import { IsNotEmpty, IsString, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MoveStopDto {
  @ApiProperty({ 
    description: 'ID của hành trình', 
    example: '65b21fc850730d1765c92841' 
  })
  @IsNotEmpty()
  @IsString()
  journey_id: string;

  @ApiProperty({ 
    description: 'Ngày hiện tại đang chứa địa điểm (Bắt đầu từ 1)', 
    example: 1 
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  from_day_number: number;

  @ApiProperty({ 
    description: 'Ngày đích muốn chuyển tới (Bắt đầu từ 1)', 
    example: 2 
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  to_day_number: number;

  @ApiProperty({ 
    description: 'Vị trí cũ trong mảng (Index bắt đầu từ 0)', 
    example: 0 
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  old_index: number;

  @ApiProperty({ 
    description: 'Vị trí mới muốn chèn vào (Index bắt đầu từ 0)', 
    example: 2 
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  new_index: number;
}