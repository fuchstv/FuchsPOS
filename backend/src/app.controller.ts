import { Controller, Get } from '@nestjs/common';

/**
 * The main application controller.
 * Handles root-level requests.
 */
@Controller()
export class AppController {
  /**
   * Returns a welcome message for the root endpoint.
   * @returns An object with a welcome message.
   */
  @Get()
  getRoot() {
    return { message: 'FuchsPOS API running' };
  }
}
