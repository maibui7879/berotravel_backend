import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as qs from 'qs';
import axios from 'axios';

/**
 * ZaloPay Gateway Service
 * Implements ZaloPay (Zalo app integrated) payment integration
 */
@Injectable()
export class ZalopayService {
  private readonly logger = new Logger(ZalopayService.name);
  private readonly appId: string;
  private readonly key1: string;
  private readonly key2: string; // For signature verification
  private readonly apiUrl: string;
  private readonly queryUrl: string;

  constructor(private configService: ConfigService) {
    this.appId = this.configService.get('ZALOPAY_APP_ID');
    this.key1 = this.configService.get('ZALOPAY_KEY1');
    this.key2 = this.configService.get('ZALOPAY_KEY2', this.key1); // Fallback to key1
    this.apiUrl = this.configService.get('ZALOPAY_API_URL');
    this.queryUrl = this.configService.get('ZALOPAY_QUERY_URL', 'https://sandbox.zalopay.com.vn/v001/tpe/getstatusbyapptransid');

    if (!this.appId || !this.key1) {
      this.logger.warn('ZaloPay credentials not configured');
    }
  }

  /**
   * Create payment request for ZaloPay
   */
  async createPaymentRequest(
    appTransId: string,
    amount: number,
    description: string,
    returnUrl: string,
  ): Promise<{
    returncode: number;
    returnmessage: string;
    zalolink?: string;
    appTransId: string;
  }> {
    try {
      const timestamp = Date.now();
      const appUser = 'user123'; // Can be dynamic

      // Build data string for signature
      const dataStr = `${this.appId}|${appTransId}|${appUser}|${amount}|${timestamp}|${description}|${returnUrl}`;

      // Create HMAC-SHA256 signature
      const signature = crypto
        .createHmac('sha256', this.key1)
        .update(dataStr)
        .digest('hex');

      const requestBody = {
        app_id: this.appId,
        app_trans_id: appTransId,
        app_user: appUser,
        amount: amount,
        timestamp: timestamp,
        description: description,
        return_url: returnUrl,
        mac: signature,
      };

      const response = await axios.post(this.apiUrl, requestBody, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      return {
        returncode: response.data.returncode,
        returnmessage: response.data.returnmessage,
        zalolink: response.data.zalolink,
        appTransId: appTransId,
      };
    } catch (error) {
      this.logger.error('ZaloPay payment request failed:', error);
      throw error;
    }
  }

  /**
   * Verify webhook signature from ZaloPay
   */
  verifyWebhookSignature(data: Record<string, any>, mac: string): boolean {
    try {
      // Build raw data string (must match ZaloPay's order)
      const dataStr = `${data.app_id}|${data.app_trans_id}|${data.user_id}|${data.amount}|${data.app_time}|${data.timestamp}`;

      // Compute signature with key2
      const computed = crypto
        .createHmac('sha256', this.key2)
        .update(dataStr)
        .digest('hex');

      return computed === mac;
    } catch (error) {
      this.logger.error('Signature verification failed:', error);
      return false;
    }
  }

  /**
   * Query transaction status from ZaloPay
   */
  async queryTransaction(appTransId: string): Promise<{
    return_code: number;
    return_message: string;
    data?: Record<string, any>;
  }> {
    try {
      const timestamp = Math.floor(Date.now() / 1000);

      // Build data string for signature
      const dataStr = `${this.appId}|${appTransId}|${timestamp}`;

      const mac = crypto
        .createHmac('sha256', this.key1)
        .update(dataStr)
        .digest('hex');

      const requestBody = {
        app_id: this.appId,
        app_trans_id: appTransId,
        timestamp: timestamp,
        mac: mac,
      };

      const response = await axios.post(this.queryUrl, requestBody, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      return {
        return_code: response.data.return_code,
        return_message: response.data.return_message,
        data: response.data,
      };
    } catch (error) {
      this.logger.error('Query transaction failed:', error);
      return {
        return_code: -1,
        return_message: error.message,
      };
    }
  }

  /**
   * Parse callback/webhook from ZaloPay
   */
  parseCallback(data: Record<string, any>): {
    appTransId: string;
    serverRequestId: string;
    amount: number;
    resultCode: number;
    transId: string;
    appTime: number;
    timestamp: number;
  } {
    return {
      appTransId: data.app_trans_id,
      serverRequestId: data.server_request_id,
      amount: Number(data.amount),
      resultCode: Number(data.result_code),
      transId: data.zalo_transaction_id,
      appTime: Number(data.app_time),
      timestamp: Number(data.timestamp),
    };
  }

  // ============ HELPERS ============

  generateAppTransId(): string {
    // Format: YYMMDD + unique number
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const random = Math.random().toString(36).substring(2, 9).padEnd(7, '0');

    return `${year}${month}${day}${random}`;
  }
}
