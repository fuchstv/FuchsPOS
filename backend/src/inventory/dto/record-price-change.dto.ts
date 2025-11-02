import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

class PromotionInputDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  startsAt?: string;

  @IsOptional()
  @IsString()
  endsAt?: string;
}

export class RecordPriceChangeDto {
  @IsString()
  tenantId!: string;

  @IsString()
  productSku!: string;

  @IsNumber()
  newPrice!: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  effectiveFrom?: string;

  @IsOptional()
  @IsString()
  effectiveTo?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PromotionInputDto)
  promotion?: PromotionInputDto;
}

export { PromotionInputDto };
