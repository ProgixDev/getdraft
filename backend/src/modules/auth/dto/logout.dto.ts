import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class LogoutDto {
  // Supabase admin signOut wants the user's access token; we accept it in the
  // body so the client can pass the soon-to-be-invalidated token explicitly.
  @ApiPropertyOptional({ description: 'Access token to revoke (optional)' })
  @IsOptional()
  @IsString()
  accessToken?: string;
}
