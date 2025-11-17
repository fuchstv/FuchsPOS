import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

class OrderItemDto {
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @IsNumber()
  @Min(0.01)
  quantity!: number;

  @IsOptional()
  @IsBoolean()
  requiresKitchen?: boolean;

  @IsOptional()
  @IsNumber()
  kitchenWorkload?: number;

  @IsOptional()
  @IsNumber()
  storageWorkload?: number;
}

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsInt()
  slotId!: number;

  @IsString()
  @IsNotEmpty()
  customerName!: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @IsOptional()
  @IsNumber()
  totalAmount?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsNumber()
  kitchenLoad?: number;

  @IsOptional()
  @IsNumber()
  storageLoad?: number;

  @IsOptional()
  @IsString()
  preferredDriver?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}

export { OrderItemDto };
