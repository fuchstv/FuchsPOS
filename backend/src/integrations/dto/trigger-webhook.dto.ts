import { IsInt, IsOptional, IsString } from 'class-validator';

/**
 * Data transfer object for triggering a webhook.
 */
export class TriggerWebhookDto {
  /**
   * The ID of the webhook to trigger.
   * @example 1
   */
  @IsInt()
  webhookId!: number;

  /**
   * An optional event name to use for the test trigger.
   * If not provided, the event configured for the webhook will be used.
   * @example "test.event"
   */
  @IsOptional()
  @IsString()
  sampleEvent?: string;
}
