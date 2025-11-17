import { DriverAssignmentStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateAssignmentStatusDto {
  @IsEnum(DriverAssignmentStatus)
  status!: DriverAssignmentStatus;
}
