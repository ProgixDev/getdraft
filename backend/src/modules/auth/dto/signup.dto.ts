import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../../common/types';

export class SignupDto {
  @ApiProperty({ example: 'athlete@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'Marcus Johnson' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: ['athlete', 'parent', 'coach', 'recruiter'] })
  @IsEnum(UserRole, {
    message: 'role must be one of: athlete, parent, coach, recruiter',
  })
  role: UserRole;
}
