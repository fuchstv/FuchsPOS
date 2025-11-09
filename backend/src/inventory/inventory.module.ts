import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

/**
 * The module for managing inventory.
 *
 * This module provides the controller and service for handling inventory-related operations.
 */
@Module({
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}
