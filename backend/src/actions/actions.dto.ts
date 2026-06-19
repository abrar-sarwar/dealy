import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum SwipeDirectionDto {
  left = 'left',
  right = 'right',
  up = 'up',
}

export class CreateSwipeDto {
  @ApiProperty({ enum: SwipeDirectionDto, description: 'right also saves the deal' })
  @IsEnum(SwipeDirectionDto)
  direction!: SwipeDirectionDto;
}
