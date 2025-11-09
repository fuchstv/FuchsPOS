import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  FiskalyTransactionFinishRequest,
  FiskalyTransactionResponse,
  FiskalyTransactionStartRequest,
  FiskalyTransactionUpdateRequest,
} from './types';

/**
 * A client service for interacting with the Fiskaly API.
 * It handles authentication and provides methods for creating and managing transactions.
 */
@Injectable()
export class FiskalyClientService {
  private readonly logger = new Logger(FiskalyClientService.name);
  private readonly baseUrl: string;
  private readonly defaultHeaders = {
    'Content-Type': 'application/json',
  } as const;
  private readonly timeoutMs = 10_000;
  private accessToken?: string;
  private tokenExpiresAt = 0;

  constructor(private readonly config: ConfigService) {
    this.baseUrl =
      this.config.get<string>('FISKALY_BASE_URL', { infer: true }) ??
      'https://kassensichv-middleware.fiskaly.com/api/v2';
  }

  /**
   * Starts a new transaction.
   *
   * @param tssId - The ID of the TSS to start the transaction with.
   * @param payload - The data for starting the transaction.
   * @returns A promise that resolves to the transaction response.
   */
  async startTransaction(
    tssId: string,
    payload: FiskalyTransactionStartRequest,
  ): Promise<FiskalyTransactionResponse> {
    const token = await this.ensureAccessToken();
    return this.post<FiskalyTransactionResponse>(`/transactions/${tssId}`, payload, {
      Authorization: `Bearer ${token}`,
    });
  }

  /**
   * Updates an existing transaction.
   *
   * @param tssId - The ID of the TSS the transaction belongs to.
   * @param transactionId - The ID of the transaction to update.
   * @param payload - The data for updating the transaction.
   * @returns A promise that resolves to the transaction response.
   */
  async updateTransaction(
    tssId: string,
    transactionId: string,
    payload: FiskalyTransactionUpdateRequest,
  ): Promise<FiskalyTransactionResponse> {
    const token = await this.ensureAccessToken();
    return this.put<FiskalyTransactionResponse>(
      `/transactions/${tssId}/${transactionId}`,
      payload,
      {
        Authorization: `Bearer ${token}`,
      },
    );
  }

  /**
   * Finishes a transaction.
   *
   * @param tssId - The ID of the TSS the transaction belongs to.
   * @param transactionId - The ID of the transaction to finish.
   * @param payload - The data for finishing the transaction.
   * @returns A promise that resolves to the transaction response.
   */
  async finishTransaction(
    tssId: string,
    transactionId: string,
    payload: FiskalyTransactionFinishRequest = {},
  ): Promise<FiskalyTransactionResponse> {
    const token = await this.ensureAccessToken();
    return this.put<FiskalyTransactionResponse>(
      `/transactions/${tssId}/${transactionId}/finish`,
      payload,
      {
        Authorization: `Bearer ${token}`,
      },
    );
  }

  /**
   * Ensures that a valid access token is available, refreshing it if necessary.
   *
   * @returns A promise that resolves to the access token.
   */
  private async ensureAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.accessToken && this.tokenExpiresAt > now + 5_000) {
      return this.accessToken;
    }

    const apiKey = this.config.get<string>('FISKALY_API_KEY');
    const apiSecret = this.config.get<string>('FISKALY_API_SECRET');

    if (!apiKey || !apiSecret) {
      throw new Error('Fiskaly-API-Zugangsdaten fehlen');
    }

    this.logger.debug('Fordere neuen Fiskaly-Access-Token an');
    const response = await this.post<{ access_token: string; expires_in: number }>(
      '/auth',
      {
        api_key: apiKey,
        api_secret: apiSecret,
      },
    );

    this.accessToken = response.access_token;
    this.tokenExpiresAt = Date.now() + response.expires_in * 1000;

    return this.accessToken;
  }

  /**
   * Sends a POST request to the Fiskaly API.
   *
   * @param path - The request path.
   * @param body - The request body.
   * @param headers - Additional request headers.
   * @returns A promise that resolves to the response data.
   */
  private async post<T>(path: string, body: unknown, headers?: Record<string, string>) {
    return this.request<T>('POST', path, body, headers);
  }

  /**
   * Sends a PUT request to the Fiskaly API.
   *
   * @param path - The request path.
   * @param body - The request body.
   * @param headers - Additional request headers.
   * @returns A promise that resolves to the response data.
   */
  private async put<T>(path: string, body: unknown, headers?: Record<string, string>) {
    return this.request<T>('PUT', path, body, headers);
  }

  /**
   * Sends a request to the Fiskaly API.
   *
   * @param method - The HTTP method.
   * @param path - The request path.
   * @param body - The request body.
   * @param headers - Additional request headers.
   * @returns A promise that resolves to the response data.
   */
  private async request<T>(
    method: 'POST' | 'PUT',
    path: string,
    body: unknown,
    headers?: Record<string, string>,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          ...this.defaultHeaders,
          ...(headers ?? {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        this.logger.error(
          `Fiskaly-Request fehlgeschlagen (${response.status}): ${text.substring(0, 200)}`,
        );
        throw new Error(`Fiskaly API responded with status ${response.status}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        this.logger.error(`Fiskaly-Request überschritt Timeout von ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
