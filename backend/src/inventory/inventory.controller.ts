import { Body, Controller, Param, ParseIntPipe, Post } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { ImportBnnDocumentDto } from './dto/import-bnn-document.dto';
import { CreateInventoryCountDto } from './dto/create-inventory-count.dto';
import { FinalizeInventoryCountDto } from './dto/finalize-inventory-count.dto';
import { RecordPriceChangeDto } from './dto/record-price-change.dto';

/**
 * Controller for managing inventory-related operations.
 */
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  /**
   * Imports a goods receipt document (BNN format).
   * @param dto - The data for the goods receipt import.
   * @returns A promise that resolves to the result of the import.
   */
  @Post('goods-receipts/import')
  importGoodsReceipt(@Body() dto: ImportBnnDocumentDto) {
    return this.inventoryService.importGoodsReceipt(dto);
  }

  /**
   * Creates a new inventory count.
   * @param dto - The data for creating the inventory count.
   * @returns A promise that resolves to the newly created inventory count.
   */
  @Post('counts')
  createInventoryCount(@Body() dto: CreateInventoryCountDto) {
    return this.inventoryService.createInventoryCount(dto);
  }

  /**
   * Finalizes an inventory count.
   * @param id - The ID of the inventory count to finalize.
   * @param dto - The data for finalizing the inventory count.
   * @returns A promise that resolves to the finalized inventory count.
   */
  @Post('counts/:id/finalize')
  finalizeInventoryCount(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FinalizeInventoryCountDto,
  ) {
    return this.inventoryService.finalizeInventoryCount(id, dto);
  }

  /**
   * Records a price change for a product.
   * @param dto - The data for the price change.
   * @returns A promise that resolves to the result of the price change recording.
   */
  @Post('price-changes')
  recordPriceChange(@Body() dto: RecordPriceChangeDto) {
    return this.inventoryService.recordPriceChange(dto);
  }
}
