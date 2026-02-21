import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

/**
 * Email Service
 * 
 * Hỗ trợ:
 * - OTP verification (đăng ký, đăng nhập)
 * - Password reset
 * - Booking confirmation & invoice
 * - Welcome email
 * - Promotional emails
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;
  private readonly fromEmail: string;
  private readonly fromName: string;

  constructor(private configService: ConfigService) {
    this.fromEmail = this.configService.get('MAIL_FROM_EMAIL', 'noreply@berotravel.com');
    this.fromName = this.configService.get('MAIL_FROM_NAME', 'BeroTravel');

    // Initialize Nodemailer transporter
    const mailService = this.configService.get('MAIL_SERVICE', 'gmail');
    const mailUser = this.configService.get('MAIL_USER');
    const mailPassword = this.configService.get('MAIL_PASSWORD');

    if (!mailUser || !mailPassword) {
      this.logger.warn('Email credentials not configured, emails will be logged only');
    }

    this.transporter = nodemailer.createTransport({
      service: mailService,
      auth: {
        user: mailUser,
        pass: mailPassword,
      },
    });
  }

  /**
   * Gửi OTP verification email
   */
  async sendOtpEmail(email: string, otp: string, purpose: 'signup' | 'signin' | 'reset' = 'signup'): Promise<boolean> {
    try {
      const subject = this.getOtpSubject(purpose);
      const html = this.getOtpTemplate(otp, purpose);

      await this.sendEmail({
        to: email,
        subject,
        html,
      });

      this.logger.log(`OTP email sent to ${email} for ${purpose}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send OTP email to ${email}:`, error);
      return false;
    }
  }

  /**
   * Gửi password reset email
   */
  async sendPasswordResetEmail(email: string, resetToken: string): Promise<boolean> {
    try {
      const resetUrl = `${this.configService.get('FRONTEND_URL')}/reset-password?token=${resetToken}`;
      const html = this.getPasswordResetTemplate(resetUrl);

      await this.sendEmail({
        to: email,
        subject: 'Reset Your BeroTravel Password',
        html,
      });

      this.logger.log(`Password reset email sent to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${email}:`, error);
      return false;
    }
  }

  /**
   * Gửi booking confirmation
   */
  async sendBookingConfirmation(
    email: string,
    bookingData: {
      booking_id: string;
      place_name: string;
      check_in_date: Date;
      check_out_date: Date;
      total_price: number;
      quantity: number;
    },
  ): Promise<boolean> {
    try {
      const html = this.getBookingConfirmationTemplate(bookingData);

      await this.sendEmail({
        to: email,
        subject: `Booking Confirmation - ${bookingData.booking_id}`,
        html,
      });

      this.logger.log(`Booking confirmation sent to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send booking confirmation to ${email}:`, error);
      return false;
    }
  }

  /**
   * Gửi payment success notification
   */
  async sendPaymentSuccessEmail(
    email: string,
    paymentData: {
      booking_id: string;
      transaction_id: string;
      amount: number;
      payment_method: string;
    },
  ): Promise<boolean> {
    try {
      const html = this.getPaymentSuccessTemplate(paymentData);

      await this.sendEmail({
        to: email,
        subject: `Payment Confirmed - ${paymentData.booking_id}`,
        html,
      });

      this.logger.log(`Payment success email sent to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send payment success email to ${email}:`, error);
      return false;
    }
  }

  /**
   * Gửi welcome email
   */
  async sendWelcomeEmail(email: string, userName: string): Promise<boolean> {
    try {
      const html = this.getWelcomeTemplate(userName);

      await this.sendEmail({
        to: email,
        subject: 'Welcome to BeroTravel!',
        html,
      });

      this.logger.log(`Welcome email sent to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send welcome email to ${email}:`, error);
      return false;
    }
  }

  /**
   * Low-level email sending
   */
  private async sendEmail(options: {
    to: string;
    subject: string;
    html: string;
    attachments?: any[];
  }): Promise<void> {
    const mailOptions = {
      from: `${this.fromName} <${this.fromEmail}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      attachments: options.attachments || [],
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.debug(`Email sent: ${info.messageId}`);
    } catch (error) {
      this.logger.error('Error sending email:', error);
      throw error;
    }
  }

  // ============ EMAIL TEMPLATES ============

  private getOtpSubject(purpose: string): string {
    const subjects = {
      signup: 'Verify Your Email - BeroTravel Account Creation',
      signin: 'Your Login Code',
      reset: 'Password Reset Code',
    };
    return subjects[purpose] || subjects.signup;
  }

  private getOtpTemplate(otp: string, purpose: string): string {
    const titles = {
      signup: 'Verify Your Email',
      signin: 'Confirm Your Login',
      reset: 'Reset Your Password',
    };

    return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>${titles[purpose]}</h2>
      <p>Your verification code is:</p>
      <div style="background: #f0f0f0; padding: 20px; border-radius: 8px; text-align: center;">
        <h1 style="color: #2196F3; letter-spacing: 5px; margin: 0;">${otp}</h1>
      </div>
      <p>This code will expire in <strong>10 minutes</strong>.</p>
      <p>If you didn't request this, please ignore this email.</p>
      <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
      <p style="color: #666; font-size: 12px;">© 2024 BeroTravel. All rights reserved.</p>
    </div>
    `;
  }

  private getPasswordResetTemplate(resetUrl: string): string {
    return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Password Reset Request</h2>
      <p>We received a request to reset your password. Click the button below to proceed:</p>
      <div style="text-align: center; margin: 20px 0;">
        <a href="${resetUrl}" 
           style="background: #2196F3; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; display: inline-block;">
          Reset Password
        </a>
      </div>
      <p>Or copy this link: <a href="${resetUrl}">${resetUrl}</a></p>
      <p style="color: #f44336;"><strong>This link will expire in 1 hour.</strong></p>
      <p>If you didn't request a password reset, please ignore this email.</p>
      <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
      <p style="color: #666; font-size: 12px;">© 2024 BeroTravel. All rights reserved.</p>
    </div>
    `;
  }

  private getBookingConfirmationTemplate(data: any): string {
    return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Booking Confirmation</h2>
      <p>Thank you for booking with BeroTravel!</p>
      
      <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Booking ID:</strong> ${data.booking_id}</p>
        <p><strong>Place:</strong> ${data.place_name}</p>
        <p><strong>Check-in:</strong> ${new Date(data.check_in_date).toLocaleDateString()}</p>
        <p><strong>Check-out:</strong> ${new Date(data.check_out_date).toLocaleDateString()}</p>
        <p><strong>Quantity:</strong> ${data.quantity}</p>
        <p style="border-top: 1px solid #ddd; padding-top: 10px; margin-top: 10px;">
          <strong style="color: #2196F3;">Total Price: $${data.total_price.toFixed(2)}</strong>
        </p>
      </div>

      <p>You can view and manage your booking in your BeroTravel account.</p>
      <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
      <p style="color: #666; font-size: 12px;">© 2024 BeroTravel. All rights reserved.</p>
    </div>
    `;
  }

  private getPaymentSuccessTemplate(data: any): string {
    return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Payment Confirmed</h2>
      <p>Your payment has been successfully processed!</p>
      
      <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4caf50;">
        <p><strong>Booking ID:</strong> ${data.booking_id}</p>
        <p><strong>Transaction ID:</strong> ${data.transaction_id}</p>
        <p><strong>Amount:</strong> $${data.amount.toFixed(2)}</p>
        <p><strong>Payment Method:</strong> ${data.payment_method}</p>
      </div>

      <p>Your booking is now confirmed. Get ready for an amazing trip!</p>
      <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
      <p style="color: #666; font-size: 12px;">© 2024 BeroTravel. All rights reserved.</p>
    </div>
    `;
  }

  private getWelcomeTemplate(userName: string): string {
    return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Welcome to BeroTravel, ${userName}!</h2>
      <p>We're excited to have you join our community of travel enthusiasts.</p>
      
      <h3>What you can do:</h3>
      <ul>
        <li>Discover amazing places and read reviews</li>
        <li>Plan personalized itineraries</li>
        <li>Make bookings and secure your seats</li>
        <li>Connect with fellow travelers</li>
        <li>Share your travel experiences</li>
      </ul>

      <p>Start exploring now and begin your next adventure!</p>
      <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
      <p style="color: #666; font-size: 12px;">© 2024 BeroTravel. All rights reserved.</p>
    </div>
    `;
  }
}
