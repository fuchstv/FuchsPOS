import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';

export enum PaymentMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  MOBILE = 'MOBILE',
  VOUCHER = 'VOUCHER',
}

/**
 * Represents a single line item in a sale.
 */
export class LineItemDto {
  /**
   * The name of the product.
   * @example "Organic Apple"
   */
  @IsString()
  @IsNotEmpty()
  name!: string;

  /**
   * The price of a single unit of the product.
   * @example 1.99
   */
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  unitPrice!: number;

  /**
   * The quantity of the product being sold.
   * @example 2
   */
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  quantity!: number;
}

/**
 * Data transfer object for creating a new payment.
 */
export class CreatePaymentDto {
  /**
   * An array of line items included in the sale.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  items!: LineItemDto[];

  /**
   * The method used for payment.
   * @example "CASH"
   */
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  /**
   * An optional reference for the transaction (e.g., a pre-order ID).
   * @example "PO-12345"
   */
  @IsOptional()
  @IsString()
  reference?: string;

  /**
   * The customer's email address, if they wish to receive an email receipt.
   * @example "customer@example.com"
   */
  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  /**
   * The ID of the terminal where the transaction is taking place.
   * @example "TERMINAL-01"
   */
  @IsOptional()
  @IsString()
  terminalId?: string;

  /**
   * The ID of the location where the transaction is taking place.
   * @example "STORE-A"
   */
  @IsOptional()
  @IsString()
  locationId?: string;
}
