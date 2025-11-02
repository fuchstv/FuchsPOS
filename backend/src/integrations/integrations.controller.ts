import { Body, Controller, Get, Post } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { CreateCsvPresetDto } from './dto/create-csv-preset.dto';
import { CsvExportRequestDto } from './dto/csv-export-request.dto';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { TriggerWebhookDto } from './dto/trigger-webhook.dto';

@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get('csv/presets')
  listPresets() {
    return this.integrations.listCsvPresets();
  }

  @Post('csv/presets')
  createPreset(@Body() dto: CreateCsvPresetDto) {
    return this.integrations.createCsvPreset(dto);
  }

  @Post('csv/export')
  generateExport(@Body() dto: CsvExportRequestDto) {
    return this.integrations.generateCsvExport(dto);
  }

  @Get('webhooks')
  listWebhooks() {
    return this.integrations.listWebhooks();
  }

  @Post('webhooks')
  createWebhook(@Body() dto: CreateWebhookDto) {
    return this.integrations.createWebhook(dto);
  }

  @Post('webhooks/test')
  triggerWebhook(@Body() dto: TriggerWebhookDto) {
    return this.integrations.triggerWebhook(dto);
  }
}
