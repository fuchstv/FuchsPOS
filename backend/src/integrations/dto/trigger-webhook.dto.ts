import { IsInt, IsOptional, IsString } from 'class-validator';

export class TriggerWebhookDto {
  @IsInt()
  webhookId!: number;

  @IsOptional()
  @IsString()
  sampleEvent?: string;
}
