import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class SubmitFeedbackDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsString()
  driverMood?: string;

  @IsOptional()
  @IsNumber()
  tipAmount?: number;

  @IsOptional()
  @IsString()
  @IsIn(['EUR', 'USD', 'CHF'])
  tipCurrency?: string;

  @IsOptional()
  @IsBoolean()
  contactConsent?: boolean;
}
