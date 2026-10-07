import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { MaxJsonSize } from '../../../common/validators/limits';

/**
 * Request bodies of the guardian-link routes. They were plain TypeScript
 * types, which the global ValidationPipe cannot see, so nothing was checked:
 * a non-string QR token crashed the service with a 500, the questionnaire was
 * any JSON up to the 1 MB body limit (stored, and shown to admins), and the
 * admin notes had no length cap.
 */

export const GUARDIAN_RELATIONSHIPS = [
  'parent',
  'legal_guardian',
  'step_parent',
  'sibling',
  'aunt_uncle',
  'grandparent',
  'other',
] as const;

export class ScanQrDto {
  @IsString()
  @MaxLength(2048)
  qrToken: string;

  @IsIn(GUARDIAN_RELATIONSHIPS)
  relationship: (typeof GUARDIAN_RELATIONSHIPS)[number];

  @IsOptional()
  @IsObject()
  @MaxJsonSize(16_384)
  questionnaire?: Record<string, unknown>;
}

export class VideoUploadUrlDto {
  @IsUUID()
  linkId: string;

  @IsString()
  @MaxLength(200)
  fileName: string;
}

export class SubmitVideoDto {
  @IsUUID()
  linkId: string;

  @IsString()
  @MaxLength(512)
  storagePath: string;
}

export class AdminDecisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
