import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

/**
 * Represents a single line item in an inventory count.
 */
class InventoryCountLineDto {
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
   * The expected quantity of the product or batch.
   * If not provided, it will be inferred from the current stock level.
   * @example 100
   */
  @IsOptional()
  @IsNumber()
  expectedQuantity?: number;

  /**
   * The actual counted quantity.
   * If not provided, it will default to the expected quantity.
   * @example 98
   */
  @IsOptional()
  @IsNumber()
  countedQuantity?: number;
}

/**
 * Data transfer object for creating a new inventory count.
 */
export class CreateInventoryCountDto {
  /**
   * The ID of the tenant for which the inventory count is being created.
   * @example "tenant-123"
   */
  @IsString()
  tenantId!: string;

  /**
   * The code of the storage location where the count is taking place.
   * @example "LOC-A1"
   */
  @IsOptional()
  @IsString()
  locationCode?: string;

  /**
   * A description of the storage location.
   * @example "Main Warehouse, Shelf A1"
   */
  @IsOptional()
  @IsString()
  locationDescription?: string;

  /**
   * An optional array of items to pre-populate the inventory count with.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InventoryCountLineDto)
  items?: InventoryCountLineDto[];
}

export { InventoryCountLineDto };
