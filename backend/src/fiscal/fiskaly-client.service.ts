import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosInstance } from 'axios';
import type {
  FiskalyTransactionFinishRequest,
  FiskalyTransactionResponse,
  FiskalyTransactionStartRequest,
  FiskalyTransactionUpdateRequest,
} from './types';

@Injectable()
export class FiskalyClientService {
  private readonly logger = new Logger(FiskalyClientService.name);
  private readonly http: AxiosInstance;
  private accessToken?: string;
  private tokenExpiresAt = 0;

  constructor(private readonly config: ConfigService) {
    const baseUrl =
      this.config.get<string>('FISKALY_BASE_URL', { infer: true }) ??
      'https://kassensichv-middleware.fiskaly.com/api/v2';

    this.http = axios.create({
      baseURL: baseUrl,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
  }

  async startTransaction(
    tssId: string,
    payload: FiskalyTransactionStartRequest,
  ): Promise<FiskalyTransactionResponse> {
    const token = await this.ensureAccessToken();
    const response = await this.http.post<FiskalyTransactionResponse>(
      `/transactions/${tssId}`,
      payload,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    return response.data;
  }

  async updateTransaction(
    tssId: string,
    transactionId: string,
    payload: FiskalyTransactionUpdateRequest,
  ): Promise<FiskalyTransactionResponse> {
    const token = await this.ensureAccessToken();
    const response = await this.http.put<FiskalyTransactionResponse>(
      `/transactions/${tssId}/${transactionId}`,
      payload,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    return response.data;
  }

  async finishTransaction(
    tssId: string,
    transactionId: string,
    payload: FiskalyTransactionFinishRequest = {},
  ): Promise<FiskalyTransactionResponse> {
    const token = await this.ensureAccessToken();
    const response = await this.http.put<FiskalyTransactionResponse>(
      `/transactions/${tssId}/${transactionId}/finish`,
      payload,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    return response.data;
  }

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
    const response = await this.http.post<{ access_token: string; expires_in: number }>(
      '/auth',
      {
        api_key: apiKey,
        api_secret: apiSecret,
      },
    );

    this.accessToken = response.data.access_token;
    this.tokenExpiresAt = Date.now() + response.data.expires_in * 1000;

    return this.accessToken;
  }
}
