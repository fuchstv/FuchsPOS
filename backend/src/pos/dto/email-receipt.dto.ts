import { Type } from 'class-transformer';
import { IsEmail, IsInt, Min } from 'class-validator';

/**
 * Data transfer object for sending an email receipt.
 */
export class EmailReceiptDto {
  /**
   * The ID of the sale for which to send a receipt.
   * @example 1
   */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  saleId!: number;

  /**
   * The recipient's email address.
   * @example "customer@example.com"
   */
  @IsEmail()
  email!: string;
}
