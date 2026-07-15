import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'athlete@example.com' })
  @IsEmail()
  email: string;

  // DO NOT raise this to match signup's 8.
  //
  // This gates LOGIN, not account creation. Accounts made under the old 6-char
  // minimum still exist, and Supabase does not enforce a length on sign-in — so
  // this DTO is the ONLY thing that could reject their (valid) password. Bumping
  // it to 8 would lock those users out of their own accounts with a 400 they
  // cannot fix. Signup is where the 8-char floor belongs (see signup.dto).
  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(6)
  password: string;
}
