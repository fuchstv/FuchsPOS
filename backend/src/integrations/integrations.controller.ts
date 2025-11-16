import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { CreateCsvPresetDto } from './dto/create-csv-preset.dto';
import { CsvExportRequestDto } from './dto/csv-export-request.dto';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { TriggerWebhookDto } from './dto/trigger-webhook.dto';

/**
 * Controller for managing integrations like CSV exports and webhooks.
 */
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  /**
   * Lists all CSV export presets.
   * @returns A promise that resolves to a list of CSV presets.
   */
  @Get('csv/presets')
  listPresets() {
    return this.integrations.listCsvPresets();
  }

  /**
   * Creates a new CSV export preset.
   * @param dto - The data for creating the preset.
   * @returns A promise that resolves to the newly created preset.
   */
  @Post('csv/presets')
  createPreset(@Body() dto: CreateCsvPresetDto) {
    return this.integrations.createCsvPreset(dto);
  }

  /**
   * Generates a CSV export based on a preset or a custom configuration.
   * @param dto - The request data for the CSV export.
   * @returns A promise that resolves to the generated CSV export.
   */
  @Post('csv/export')
  generateExport(@Body() dto: CsvExportRequestDto) {
    return this.integrations.generateCsvExport(dto);
  }

  /**
   * Lists all webhooks.
   * @returns A promise that resolves to a list of webhooks.
   */
  @Get('webhooks')
  listWebhooks() {
    return this.integrations.listWebhooks();
  }

  /**
   * Creates a new webhook.
   * @param dto - The data for creating the webhook.
   * @returns A promise that resolves to the newly created webhook.
   */
  @Post('webhooks')
  createWebhook(@Body() dto: CreateWebhookDto) {
    return this.integrations.createWebhook(dto);
  }

  /**
   * Triggers a webhook for testing purposes.
   * @param dto - The data for triggering the webhook.
   * @returns A promise that resolves to the result of the webhook trigger.
   */
  @Post('webhooks/test')
  triggerWebhook(@Body() dto: TriggerWebhookDto) {
    return this.integrations.triggerWebhook(dto);
  }

  /**
   * Looks up metadata for a given EAN via OpenGTIN.
   * @param ean - The barcode to search for.
   */
  @Get('ean/:ean')
  lookupEan(@Param('ean') ean: string) {
    return this.integrations.lookupEan(ean);
  }
}
