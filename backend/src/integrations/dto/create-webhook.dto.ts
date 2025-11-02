import { IsOptional, IsString, Matches } from 'class-validator';

export class CreateWebhookDto {
  @IsString()
  event!: string;

  @IsString()
  @Matches(/^https?:\/\//, { message: 'targetUrl must be an absolute HTTP(S) URL' })
  targetUrl!: string;

  @IsOptional()
  @IsString()
  secret?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;
}
