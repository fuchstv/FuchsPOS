import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ReportingService } from './reporting.service';
import { DateRangeQueryDto } from './dto/date-range.dto';
import { EmployeePerformanceQueryDto } from './dto/employee-performance.dto';
import { ExpiryReportQueryDto } from './dto/expiry-query.dto';
import { ReportExportListQueryDto, ReportExportRequestDto } from './dto/report-export.dto';
import { ReportExportService } from './report-export.service';

@Controller('reporting')
export class ReportingController {
  constructor(
    private readonly reporting: ReportingService,
    private readonly exports: ReportExportService,
  ) {}

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

  @Get('locations')
  async listLocations() {
    const locations = await this.reporting.listLocations();
    return locations.map((locationId) => ({ id: locationId, label: locationId }));
  }

  @Get('expiry')
  getExpiry(@Query() query: ExpiryReportQueryDto) {
    return this.reporting.getExpiryOverview(query);
  }

  @Get('dashboard')
  getDashboard(@Query() query: DateRangeQueryDto) {
    return this.reporting.getDashboard(query);
  }

  @Get('exports')
  listExports(@Query() query: ReportExportListQueryDto) {
    return this.exports.listExports(query);
  }

  @Post('exports')
  enqueueExport(@Body() dto: ReportExportRequestDto) {
    return this.exports.enqueue(dto);
  }

  @Get('exports/:id/download')
  async downloadExport(@Param('id', ParseIntPipe) id: number, @Res() res: any) {
    const record = await this.exports.getExportOrThrow(id);
    if (record.status !== 'READY' || !record.fileData) {
      throw new NotFoundException('Export ist noch nicht verfügbar');
    }

    const fileName = record.fileName ?? `report-${record.id}`;
    const mimeType = record.mimeType ?? 'application/octet-stream';
    const buffer = Buffer.from(record.fileData);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  }
}
