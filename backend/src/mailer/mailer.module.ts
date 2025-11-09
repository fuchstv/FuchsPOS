import { Module } from '@nestjs/common';
import { MailerService } from './mailer.service';

/**
 * The module for handling email sending.
 *
 * This module provides a service for sending emails using a configured SMTP provider.
 */
@Module({
  providers: [MailerService],
  exports: [MailerService],
})
export class MailerModule {}
