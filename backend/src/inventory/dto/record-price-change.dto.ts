import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

/**
 * Represents the input for creating a promotion associated with a price change.
 */
class PromotionInputDto {
  /**
   * The name of the promotion.
   * @example "Summer Sale"
   */
  @IsString()
  name!: string;

  /**
   * An optional description of the promotion.
   * @example "20% off on all summer items"
   */
  @IsOptional()
  @IsString()
  description?: string;

  /**
   * The start date of the promotion in ISO 8601 format.
   * @example "2024-06-01T00:00:00Z"
   */
  @IsOptional()
  @IsString()
  startsAt?: string;

  /**
   * The end date of the promotion in ISO 8601 format.
   * @example "2024-08-31T23:59:59Z"
   */
  @IsOptional()
  @IsString()
  endsAt?: string;
}

/**
 * Data transfer object for recording a price change for a product.
 */
export class RecordPriceChangeDto {
  /**
   * The ID of the tenant where the price change is being recorded.
   * @example "tenant-123"
   */
  @IsString()
  tenantId!: string;

  /**
   * The SKU of the product whose price is being changed.
   * @example "SKU-123"
   */
  @IsString()
  productSku!: string;

  /**
   * The new price for the product.
   * @example 19.99
   */
  @IsNumber()
  newPrice!: number;

  /**
   * The reason for the price change.
   * @example "Supplier price increase"
   */
  @IsOptional()
  @IsString()
  reason?: string;

  /**
   * The date from which the new price is effective, in ISO 8601 format.
   * Defaults to the current date and time if not provided.
   * @example "2024-01-01T00:00:00Z"
   */
  @IsOptional()
  @IsString()
  effectiveFrom?: string;

  /**
   * The date until which the new price is effective, in ISO 8601 format.
   * If not provided, the price change is indefinite.
   * @example "2024-12-31T23:59:59Z"
   */
  @IsOptional()
  @IsString()
  effectiveTo?: string;

  /**
   * Optional promotion details to associate with this price change.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => PromotionInputDto)
  promotion?: PromotionInputDto;
}

export { PromotionInputDto };
