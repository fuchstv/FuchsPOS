import { Body, Controller, Post } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { DatevExportDto } from './dto/datev-export.dto';

@Controller('accounting')
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

  @Post('datev/export')
  generateExport(@Body() dto: DatevExportDto) {
    return this.accounting.generateDatevExport(dto);
  }
}
