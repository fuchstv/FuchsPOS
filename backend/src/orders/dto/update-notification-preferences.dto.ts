import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  allowStatusPush?: boolean;

  @IsOptional()
  @IsBoolean()
  allowSlotUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  allowEmail?: boolean;
}
