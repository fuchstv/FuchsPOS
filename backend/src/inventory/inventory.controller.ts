import { Body, Controller, Param, ParseIntPipe, Post } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { ImportBnnDocumentDto } from './dto/import-bnn-document.dto';
import { CreateInventoryCountDto } from './dto/create-inventory-count.dto';
import { FinalizeInventoryCountDto } from './dto/finalize-inventory-count.dto';
import { RecordPriceChangeDto } from './dto/record-price-change.dto';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('goods-receipts/import')
  importGoodsReceipt(@Body() dto: ImportBnnDocumentDto) {
    return this.inventoryService.importGoodsReceipt(dto);
  }

  @Post('counts')
  createInventoryCount(@Body() dto: CreateInventoryCountDto) {
    return this.inventoryService.createInventoryCount(dto);
  }

  @Post('counts/:id/finalize')
  finalizeInventoryCount(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FinalizeInventoryCountDto,
  ) {
    return this.inventoryService.finalizeInventoryCount(id, dto);
  }

  @Post('price-changes')
  recordPriceChange(@Body() dto: RecordPriceChangeDto) {
    return this.inventoryService.recordPriceChange(dto);
  }
}
