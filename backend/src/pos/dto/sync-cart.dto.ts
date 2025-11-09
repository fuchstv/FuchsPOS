import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';

const CATEGORIES = ['Beverage', 'Food', 'Merch'] as const;

/**
 * Represents a single item in a shopping cart.
 */
export class SyncCartItemDto {
  /**
   * A unique identifier for the item in the cart.
   * @example "cart-item-123"
   */
  @IsString()
  @IsNotEmpty()
  id!: string;

  /**
   * The name of the product.
   * @example "Espresso"
   */
  @IsString()
  @IsNotEmpty()
  name!: string;

  /**
   * The price of a single unit of the product.
   * @example 2.50
   */
  @IsNumber()
  @Type(() => Number)
  @IsPositive()
  unitPrice!: number;

  /**
   * The quantity of the product in the cart.
   * @example 2
   */
  @IsNumber()
  @Type(() => Number)
  @IsPositive()
  quantity!: number;

  /**
   * The category of the product.
   * @example "Beverage"
   */
  @IsIn(CATEGORIES)
  category!: (typeof CATEGORIES)[number];
}

/**
 * Data transfer object for synchronizing the state of a shopping cart.
 */
export class SyncCartDto {
  /**
   * The ID of the terminal where the cart is being managed.
   * @example "TERMINAL-01"
   */
  @IsString()
  @IsNotEmpty()
  terminalId!: string;

  /**
   * An array of items currently in the cart.
   */
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => SyncCartItemDto)
  items!: SyncCartItemDto[];

  /**
   * The currency of the transaction.
   * @example "EUR"
   */
  @IsString()
  @IsNotEmpty()
  currency!: string;

  /**
   * The total price of all items in the cart.
   * @example 5.00
   */
  @IsNumber()
  @Type(() => Number)
  total!: number;

  /**
   * The total tax amount for the cart.
   * @example 0.35
   */
  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  tax?: number;
}
