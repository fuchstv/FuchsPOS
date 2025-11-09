import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

/**
 * Controller for the health check endpoint.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Returns the health status of the application.
   * @returns A promise that resolves to the health status object.
   */
  @Get()
  async getHealth() {
    return this.healthService.check();
  }
}
