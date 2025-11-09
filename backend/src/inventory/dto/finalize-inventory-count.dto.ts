import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

/**
 * Represents a single line item when finalizing an inventory count.
 */
class FinalizeInventoryCountLineDto {
  /**
   * The ID of an existing inventory count item to update.
   * If not provided, a new item will be created.
   * @example 1
   */
  @IsOptional()
  @IsNumber()
  id?: number;

  /**
   * The SKU of the product being counted.
   * @example "SKU-123"
   */
  @IsString()
  productSku!: string;

  /**
   * The lot number of the batch being counted, if applicable.
   * @example "LOT-456"
   */
  @IsOptional()
  @IsString()
  batchLotNumber?: string;

  /**
   * The final counted quantity.
   * @example 98
   */
  @IsNumber()
  countedQuantity!: number;

  /**
   * The reason for any adjustment made due to a difference in quantity.
   * Overrides the `defaultAdjustmentReason` if provided.
   * @example "Damaged goods"
   */
  @IsOptional()
  @IsString()
  adjustmentReason?: string;
}

/**
 * Data transfer object for finalizing an inventory count.
 */
export class FinalizeInventoryCountDto {
  /**
   * The ID of the tenant for which the inventory count is being finalized.
   * @example "tenant-123"
   */
  @IsString()
  tenantId!: string;

  /**
   * Whether to automatically create inventory adjustments for any differences found.
   * @default true
   */
  @IsOptional()
  @IsBoolean()
  bookDifferences?: boolean;

  /**
   * A default reason to use for any inventory adjustments created.
   * @example "Inventory count correction"
   */
  @IsOptional()
  @IsString()
  defaultAdjustmentReason?: string;

  /**
   * An array of items with their final counted quantities.
   * This can include updates to existing items or new items found during the count.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FinalizeInventoryCountLineDto)
  items?: FinalizeInventoryCountLineDto[];
}

export { FinalizeInventoryCountLineDto };
