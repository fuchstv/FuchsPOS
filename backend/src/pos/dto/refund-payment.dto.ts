import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { LineItemDto } from './create-payment.dto';

/**
 * DTO representing a refund request for an existing sale.
 */
export class RefundPaymentDto {
  /**
   * The ID of the sale that should be refunded.
   */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  saleId!: number;

  /**
   * The line items that should be refunded. The quantities are treated as positive
   * values and will internally be converted to negative amounts.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  items!: LineItemDto[];

  /**
   * Optional reason for the refund.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  reason?: string;

  /**
   * Optional identifier of the operator that triggered the refund.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  operatorId?: string;
}
