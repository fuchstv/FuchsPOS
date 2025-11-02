import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum BnnImportFormat {
  CSV = 'csv',
  JSON = 'json',
  XML = 'xml',
}

export class ImportBnnDocumentDto {
  @IsString()
  tenantId!: string;

  @IsEnum(BnnImportFormat)
  format!: BnnImportFormat;

  @IsString()
  payload!: string;

  @IsOptional()
  @IsString()
  supplierName?: string;

  @IsOptional()
  @IsString()
  supplierNumber?: string;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  receivedAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
