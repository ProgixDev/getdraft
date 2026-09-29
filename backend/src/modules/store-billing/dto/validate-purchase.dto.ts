import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum PurchasePlatform {
  IOS = 'ios',
  ANDROID = 'android',
}

export class ValidatePurchaseDto {
  @ApiProperty({ enum: PurchasePlatform })
  @IsEnum(PurchasePlatform)
  platform!: PurchasePlatform;

  @ApiProperty({ example: 'pro_monthly' })
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiProperty({ description: 'Store transaction id, used for idempotency.' })
  @IsString()
  @IsNotEmpty()
  transactionId!: string;

  /**
   * StoreKit 2 JWS on iOS, Play purchase token on Android. This is the only
   * thing the store will actually verify -- everything else in this DTO is a
   * hint from a client we do not trust.
   */
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  // A real StoreKit JWS is a few KB; the cap keeps a public endpoint from
  // doing signature work on megabytes of attacker text.
  @MaxLength(20_000)
  purchaseToken!: string;
}

/** The body Apple POSTs for an App Store Server Notification (V2). */
export class AppleNotificationDto {
  @IsString()
  @IsNotEmpty()
  // Envelope plus the nested transaction and renewal JWSs: well under 64 KB.
  @MaxLength(64_000)
  signedPayload!: string;
}
