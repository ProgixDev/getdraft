import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PlanId } from '../../../common/types';

export class CreateCheckoutDto {
  @ApiProperty({ enum: ['starter', 'pro', 'premium'], example: 'pro' })
  @IsEnum(PlanId, { message: 'planId must be starter, pro, or premium' })
  planId: PlanId;
}
