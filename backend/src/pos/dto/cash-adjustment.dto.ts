import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsPositive, IsString } from 'class-validator';

/**
 * DTO for recording manual cash adjustments such as deposits or withdrawals.
 */
export class CreateCashAdjustmentDto {
  /** The absolute amount of the adjustment in the store currency. */
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount!: number;

  /** Short explanation for the adjustment to be shown in audit logs. */
  @IsString()
  @IsNotEmpty()
  reason!: string;

  /** Identifier of the operator performing the action. */
  @IsString()
  @IsNotEmpty()
  operatorId!: string;

  /** Tenant identifier so the event can be filtered in multi-tenant setups. */
  @IsString()
  @IsNotEmpty()
  tenantId!: string;
}
