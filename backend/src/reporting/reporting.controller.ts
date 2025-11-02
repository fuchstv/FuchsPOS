import { Controller, Get, Query } from '@nestjs/common';
import { ReportingService } from './reporting.service';
import { DateRangeQueryDto } from './dto/date-range.dto';
import { EmployeePerformanceQueryDto } from './dto/employee-performance.dto';
import { ExpiryReportQueryDto } from './dto/expiry-query.dto';

@Controller('reporting')
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  @Get('sales')
  getSales(@Query() query: DateRangeQueryDto) {
    return this.reporting.getSalesSummary(query);
  }

  @Get('employees')
  getEmployeePerformance(@Query() query: EmployeePerformanceQueryDto) {
    return this.reporting.getEmployeePerformance(query);
  }

  @Get('categories')
  getCategories(@Query() query: DateRangeQueryDto) {
    return this.reporting.getCategoryPerformance(query);
  }

  @Get('expiry')
  getExpiry(@Query() query: ExpiryReportQueryDto) {
    return this.reporting.getExpiryOverview(query);
  }

  @Get('dashboard')
  getDashboard(@Query() query: DateRangeQueryDto) {
    return this.reporting.getDashboard(query);
  }
}
