import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import axios from 'axios';

/**
 * MoMo Gateway Service
 * Implements MoMo (Vietnamese mobile wallet) payment integration
 */
@Injectable()
export class MomoService {
  private readonly logger = new Logger(MomoService.name);
  private readonly partnerCode: string;
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly apiUrl: string;
  private readonly queryUrl: string;

  constructor(private configService: ConfigService) {
    this.partnerCode = this.configService.get('MOMO_PARTNER_CODE')|| '';
    this.accessKey = this.configService.get('MOMO_ACCESS_KEY') || '';
    this.secretKey = this.configService.get('MOMO_SECRET_KEY') || '';
    this.apiUrl = this.configService.get('MOMO_API_URL')|| '';
    this.queryUrl = this.configService.get('MOMO_QUERY_URL')|| '';

    if (!this.partnerCode || !this.secretKey) {
      this.logger.warn('MoMo credentials not configured');
    }
  }

  /**
   * Create payment request for MoMo
   */
  async createPaymentRequest(
    orderId: string,
    amount: number,
    orderInfo: string,
    returnUrl: string,
    notifyUrl: string,
  ): Promise<{
    payUrl: string;
    requestId: string;
    responseCode: string;
  }> {
    try {
      const requestId = this.generateRequestId();
      const requestType = 'captureWallet';
      const extraData = Buffer.from(orderId).toString('base64');
      const timestamp = Date.now();

      // Build raw signature string
      const rawSignature = `accessKey=${this.accessKey}&amount=${amount}&extraData=${extraData}&orderId=${orderId}&orderInfo=${orderInfo}&partnerCode=${this.partnerCode}&redirectUrl=${returnUrl}&requestId=${requestId}&requestType=${requestType}&timestamp=${timestamp}`;

      // Create HMAC-SHA256 signature
      const signature = crypto
        .createHmac('sha256', this.secretKey)
        .update(rawSignature)
        .digest('hex');

      const requestBody = {
        partnerCode: this.partnerCode,
        partnerName: 'BeroTravel',
        storeId: 'BeroTravelStore',
        requestId: requestId,
        amount: amount,
        orderId: orderId,
        orderInfo: orderInfo,
        redirectUrl: returnUrl,
        ipnUrl: notifyUrl,
        lang: 'vi',
        requestType: requestType,
        autoCapture: true,
        extraData: extraData,
        signature: signature,
        timestamp: timestamp,
      };

      const response = await axios.post(this.apiUrl, requestBody, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.data.resultCode === 0) {
        return {
          payUrl: response.data.payUrl,
          requestId: requestId,
          responseCode: '0', // Success
        };
      } else {
        return {
          payUrl: '',
          requestId: requestId,
          responseCode: response.data.resultCode.toString(),
        };
      }
    } catch (error) {
      this.logger.error('MoMo payment request failed:', error);
      throw error;
    }
  }

  /**
   * Verify webhook signature from MoMo
   */
  verifyWebhookSignature(
    data: Record<string, any>,
    signature: string,
  ): boolean {
    try {
      // Build raw signature string (must match MoMo's order)
      const rawSignature = `accessKey=${this.accessKey}&amount=${data.amount}&description=${data.description}&orderId=${data.orderId}&orderType=${data.orderType}&partnerCode=${this.partnerCode}&payType=${data.payType}&requestId=${data.requestId}&responseTime=${data.responseTime}&resultCode=${data.resultCode}&transId=${data.transId}`;

      const computed = crypto
        .createHmac('sha256', this.secretKey)
        .update(rawSignature)
        .digest('hex');

      return computed === signature;
    } catch (error) {
      this.logger.error('Signature verification failed:', error);
      return false;
    }
  }

  /**
   * Query transaction status from MoMo
   */
  async queryTransaction(
    requestId: string,
    orderId: string,
  ): Promise<{
    status: string;
    message: string;
    data?: Record<string, any>;
  }> {
    try {
      const timestamp = Date.now();

      const rawSignature = `accessKey=${this.accessKey}&orderId=${orderId}&partnerCode=${this.partnerCode}&requestId=${requestId}&timestamp=${timestamp}`;

      const signature = crypto
        .createHmac('sha256', this.secretKey)
        .update(rawSignature)
        .digest('hex');

      const queryBody = {
        partnerCode: this.partnerCode,
        requestId: requestId,
        orderId: orderId,
        signature: signature,
        timestamp: timestamp,
        lang: 'vi',
      };

      const response = await axios.post(this.queryUrl, queryBody, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      return {
        status: response.data.resultCode === 0 ? 'success' : 'failed',
        message: response.data.message || response.data.resultMessage,
        data: response.data,
      };
    } catch (error) {
      this.logger.error('Query transaction failed:', error);
      return {
        status: 'error',
        message: error.message,
      };
    }
  }

  /**
   * Parse IPN (Instant Payment Notification) from MoMo
   */
  parseIpn(data: Record<string, any>): {
    orderId: string;
    amount: number;
    resultCode: string;
    transId: string;
    requestId: string;
  } {
    return {
      orderId: data.orderId,
      amount: Number(data.amount),
      resultCode: data.resultCode,
      transId: data.transId,
      requestId: data.requestId,
    };
  }

  // ============ HELPERS ============

  private generateRequestId(): string {
    return `${Date.now()}${Math.random().toString(36).substring(2, 9)}`;
  }
}
