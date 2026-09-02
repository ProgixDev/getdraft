import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
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
  purchaseToken!: string;
}
