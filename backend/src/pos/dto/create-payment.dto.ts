import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateIf,
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

export enum CourseStatus {
  QUEUED = 'QUEUED',
  PREPPING = 'PREPPING',
  SERVED = 'SERVED',
}

export class CourseDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sequence?: number;

  @IsEnum(CourseStatus)
  status!: CourseStatus;

  @IsOptional()
  @IsISO8601()
  servedAt?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  items!: LineItemDto[];
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
   * The amount of cash received from the customer when paying with cash.
   * @example 20.0
   */
  @ValidateIf(dto => dto.paymentMethod === PaymentMethod.CASH)
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amountTendered?: number;

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

  /**
   * Optional reference to the table identifier (e.g., A1) where the sale originates.
   */
  @IsOptional()
  @IsString()
  tableId?: string;

  /**
   * Optional human readable table label.
   */
  @IsOptional()
  @IsString()
  tableLabel?: string;

  /**
   * Optional area/zone label for dispatch and kitchen routing.
   */
  @IsOptional()
  @IsString()
  areaLabel?: string;

  /**
   * Optional waiter/employee identifier assigned to the table.
   */
  @IsOptional()
  @IsString()
  waiterId?: string;

  /**
   * Optional reference to an open table tab entity in the backend.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  tableTabId?: number;

  /**
   * Optional list of courses for sequencing in the kitchen.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CourseDto)
  courses?: CourseDto[];
}
