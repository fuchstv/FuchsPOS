import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { DriverAssignmentStatus } from '@prisma/client';
import { DispatchService } from './dispatch.service';
import { PlanDriverDto } from './dto/plan-driver.dto';
import { UpdateAssignmentStatusDto } from './dto/update-assignment-status.dto';

@Controller('dispatch')
export class DispatchController {
  constructor(private readonly dispatch: DispatchService) {}

  @Post('assignments')
  planDriver(@Body() dto: PlanDriverDto) {
    return this.dispatch.planDriver(dto);
  }

  @Get('assignments')
  listAssignments(@Query('tenantId') tenantId: string) {
    return this.dispatch.listAssignments(tenantId);
  }

  @Patch('assignments/:id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAssignmentStatusDto,
  ) {
    return this.dispatch.updateAssignmentStatus(id, dto.status);
  }
}
