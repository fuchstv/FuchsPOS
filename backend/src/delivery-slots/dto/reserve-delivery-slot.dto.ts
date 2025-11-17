import { IsInt, Min } from 'class-validator';

export class ReserveDeliverySlotDto {
  @IsInt()
  @Min(0)
  kitchenLoad = 0;

  @IsInt()
  @Min(0)
  storageLoad = 0;
}
