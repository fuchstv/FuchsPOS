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

export class LineItemDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  unitPrice!: number;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  quantity!: number;
}

export class CreatePaymentDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  items!: LineItemDto[];

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsOptional()
  @IsString()
  terminalId?: string;
}
