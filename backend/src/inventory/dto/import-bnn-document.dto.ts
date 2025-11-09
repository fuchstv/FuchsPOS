import { IsEnum, IsOptional, IsString } from 'class-validator';

/**
 * Defines the possible formats for a BNN (Bundesverband Naturkost Naturwaren) document import.
 */
export enum BnnImportFormat {
  CSV = 'csv',
  JSON = 'json',
  XML = 'xml',
}

/**
 * Data transfer object for importing a BNN document as a goods receipt.
 */
export class ImportBnnDocumentDto {
  /**
   * The ID of the tenant for which the document is being imported.
   * @example "tenant-123"
   */
  @IsString()
  tenantId!: string;

  /**
   * The format of the BNN document.
   * @example "csv"
   */
  @IsEnum(BnnImportFormat)
  format!: BnnImportFormat;

  /**
   * The raw string content of the BNN document.
   */
  @IsString()
  payload!: string;

  /**
   * The name of the supplier. Used to identify or create the supplier record.
   * @example "Organic Goods Inc."
   */
  @IsOptional()
  @IsString()
  supplierName?: string;

  /**
   * The BNN supplier number. Used to identify or create the supplier record.
   * @example "BNN-54321"
   */
  @IsOptional()
  @IsString()
  supplierNumber?: string;

  /**
   * The original file name of the imported document.
   * @example "delivery_note_2023-10-26.csv"
   */
  @IsOptional()
  @IsString()
  fileName?: string;

  /**
   * A reference number for the goods receipt (e.g., delivery note number).
   * @example "DN-98765"
   */
  @IsOptional()
  @IsString()
  reference?: string;

  /**
   * The date and time when the goods were received, in ISO 8601 format.
   * @example "2023-10-26T14:30:00Z"
   */
  @IsOptional()
  @IsString()
  receivedAt?: string;

  /**
   * Optional notes for the goods receipt.
   */
  @IsOptional()
  @IsString()
  notes?: string;
}
