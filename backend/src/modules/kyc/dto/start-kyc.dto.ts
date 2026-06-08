import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class StartKycDto {
  @ApiPropertyOptional({
    description:
      "Deep-link the in-app browser should redirect to once verification finishes. The mobile app passes Linking.createURL('kyc/return') (e.g. getdraft://kyc/return). If omitted, the backend falls back to a hosted HTML landing page.",
    example: 'getdraft://kyc/return',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  callbackUrl?: string;
}
