import { Body, Controller, Post } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { DatevExportDto } from './dto/datev-export.dto';

/**
 * Controller for handling accounting-related requests.
 */
@Controller('accounting')
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

  /**
   * Generates a DATEV export.
   * @param dto - The data for generating the DATEV export.
   * @returns The generated DATEV export.
   */
  @Post('datev/export')
  generateExport(@Body() dto: DatevExportDto) {
    return this.accounting.generateDatevExport(dto);
  }
}
