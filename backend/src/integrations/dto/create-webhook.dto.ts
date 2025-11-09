import { IsOptional, IsString, Matches } from 'class-validator';

/**
 * Data transfer object for creating a new webhook.
 */
export class CreateWebhookDto {
  /**
   * The event that triggers the webhook.
   * @example "sale.created"
   */
  @IsString()
  event!: string;

  /**
   * The URL to send the webhook payload to.
   * @example "https://example.com/webhook"
   */
  @IsString()
  @Matches(/^https?:\/\//, { message: 'targetUrl must be an absolute HTTP(S) URL' })
  targetUrl!: string;

  /**
   * An optional secret to sign the webhook payload with.
   * @example "my-secret-token"
   */
  @IsOptional()
  @IsString()
  secret?: string;

  /**
   * The ID of the tenant this webhook belongs to.
   * @example "tenant-123"
   */
  @IsOptional()
  @IsString()
  tenantId?: string;
}
