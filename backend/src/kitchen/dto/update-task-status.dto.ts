import { FulfillmentTaskStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateTaskStatusDto {
  @IsEnum(FulfillmentTaskStatus)
  status!: FulfillmentTaskStatus;

  @IsOptional()
  @IsString()
  assignee?: string;
}
