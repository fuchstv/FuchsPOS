import { Type } from 'class-transformer';
import { IsEmail, IsInt, Min } from 'class-validator';

export class EmailReceiptDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  saleId!: number;

  @IsEmail()
  email!: string;
}
