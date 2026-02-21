import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as querystring from 'querystring';
import axios from 'axios';

/**
 * VNPay Gateway Service
 * Implements VNPay payment integration
 */
@Injectable()
export class VnpayService {
  private readonly logger = new Logger(VnpayService.name);
  private readonly merchantId: string;
  private readonly hashSecret: string;
  private readonly apiUrl: string;
  private readonly queryUrl: string;

  constructor(private configService: ConfigService) {
    this.merchantId = this.configService.get('VNPAY_MERCHANT_ID')|| '';
    this.hashSecret = this.configService.get('VNPAY_HASH_SECRET')|| '';
    this.apiUrl = this.configService.get('VNPAY_API_URL')|| '';
    this.queryUrl = this.configService.get('VNPAY_QUERY_DR_URL')|| '';

    if (!this.merchantId || !this.hashSecret) {
      this.logger.warn('VNPay credentials not configured');
    }
  }

  /**
   * Generate payment URL for VNPay redirect
   */
  generatePaymentUrl(
    orderId: string,
    amount: number,
    orderInfo: string,
    returnUrl: string,
    ipAddress: string = '127.0.0.1',
  ): string {
    const date = new Date();
    const createDate = this.formatDate(date);
    const expireDate = new Date(date.getTime() + 15 * 60000); // 15 minutes
    const expireDateStr = this.formatDate(expireDate);

    const params = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: this.merchantId,
      vnp_Locale: 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: orderId,
      vnp_OrderInfo: orderInfo,
      vnp_OrderType: 'other',
      vnp_Amount: (amount * 100).toString(), // VNPay uses 2 decimals
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: ipAddress,
      vnp_CreateDate: createDate,
      vnp_ExpireDate: expireDateStr,
    };

    // Generate secure hash
    const sortedParams = this.sortObject(params);
    const queryString = querystring.stringify(sortedParams);
    const hmac = crypto.createHmac('sha512', this.hashSecret);
    const signed = hmac.update(Buffer.from(queryString, 'utf-8')).digest('hex');

    const paymentUrl = `${this.apiUrl}?${queryString}&vnp_SecureHash=${signed}`;
    return paymentUrl;
  }

  /**
   * Verify webhook signature from VNPay
   */
  verifyWebhookSignature(
    params: Record<string, any>,
    signature: string,
  ): boolean {
    try {
      // Remove secure hash from params for verification
      const paramsCopy = { ...params };
      delete paramsCopy.vnp_SecureHash;
      delete paramsCopy.vnp_SecureHashType;

      const sortedParams = this.sortObject(paramsCopy);
      const queryString = querystring.stringify(sortedParams);
      const hmac = crypto.createHmac('sha512', this.hashSecret);
      const computed = hmac.update(Buffer.from(queryString, 'utf-8')).digest('hex');

      return computed === signature;
    } catch (error) {
      this.logger.error('Signature verification failed:', error);
      return false;
    }
  }

  /**
   * Query transaction status from VNPay
   */
  async queryTransaction(
    orderId: string,
    transactionDate: string,
  ): Promise<{
    status: string;
    message: string;
    data?: Record<string, any>;
  }> {
    try {
      const params = {
        vnp_RequestId: this.generateRequestId(),
        vnp_Version: '2.1.0',
        vnp_Command: 'querydr',
        vnp_TmnCode: this.merchantId,
        vnp_TxnRef: orderId,
        vnp_TransactionDate: transactionDate,
        vnp_CreateDate: this.formatDate(new Date()),
        vnp_IpAddr: '127.0.0.1',
      };

      const sortedParams = this.sortObject(params);
      const queryString = querystring.stringify(sortedParams);
      const hmac = crypto.createHmac('sha512', this.hashSecret);
      const signed = hmac.update(Buffer.from(queryString, 'utf-8')).digest('hex');

      const response = await axios.post(this.queryUrl, {
        ...params,
        vnp_SecureHash: signed,
      });

      return {
        status: response.data.vnp_ResponseCode === '00' ? 'success' : 'failed',
        message: response.data.vnp_Message,
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
   * Parse webhook callback from VNPay
   */
  parseCallback(query: Record<string, any>): {
    orderId: string;
    amount: number;
    responseCode: string;
    transactionId: string;
    bankCode: string;
    bankTranNo: string;
    cardType: string;
    payDate: Date;
  } {
    return {
      orderId: query.vnp_TxnRef,
      amount: Number(query.vnp_Amount) / 100, // Convert back to original
      responseCode: query.vnp_ResponseCode,
      transactionId: query.vnp_TransactionNo,
      bankCode: query.vnp_BankCode || '',
      bankTranNo: query.vnp_BankTranNo || '',
      cardType: query.vnp_CardType || '',
      payDate: this.parseVnpayDate(query.vnp_PayDate),
    };
  }

  // ============ HELPERS ============

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}${hours}${minutes}${seconds}`;
  }

  private parseVnpayDate(dateStr: string): Date {
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6));
    const day = parseInt(dateStr.substring(6, 8));
    const hours = parseInt(dateStr.substring(8, 10));
    const minutes = parseInt(dateStr.substring(10, 12));
    const seconds = parseInt(dateStr.substring(12, 14));

    return new Date(year, month - 1, day, hours, minutes, seconds);
  }

  private sortObject(obj: Record<string, any>): Record<string, any> {
    const sorted: Record<string, any> = {};
    const keys = Object.keys(obj).sort();

    keys.forEach(key => {
      sorted[key] = obj[key];
    });

    return sorted;
  }

  private generateRequestId(): string {
    return `${Date.now()}`;
  }
}
