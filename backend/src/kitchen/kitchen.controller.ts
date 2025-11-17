import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query } from '@nestjs/common';
import { FulfillmentTaskType } from '@prisma/client';
import { KitchenService } from './kitchen.service';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';

@Controller('kitchen')
export class KitchenController {
  constructor(private readonly kitchen: KitchenService) {}

  @Get('tasks')
  listTasks(@Query('tenantId') tenantId: string, @Query('type') type?: FulfillmentTaskType) {
    return this.kitchen.listTasks(tenantId, type);
  }

  @Patch('tasks/:id')
  updateTask(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTaskStatusDto,
  ) {
    return this.kitchen.updateTaskStatus(id, dto.status, dto.assignee);
  }
}
