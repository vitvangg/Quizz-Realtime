import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '465', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }

  async sendSecurityAlert(subject: string, body: string): Promise<void> {
    const adminEmail = process.env.SMTP_FROMEMAIL;
    if (!adminEmail) {
      this.logger.warn('SMTP_FROMEMAIL not configured, skipping email alert');
      return;
    }

    try {
      await this.transporter.sendMail({
        from: `"${process.env.SMTP_FROMNAME || 'Security System'}" <${process.env.SMTP_FROMEMAIL}>`,
        to: adminEmail,
        subject: `🚨 [SECURITY ALERT] ${subject}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; font-size: 20px;">🚨 Security Alert</h1>
              <p style="margin: 5px 0 0; opacity: 0.8;">Realtime Quiz System — Auto Detection</p>
            </div>
            <div style="background: #fff; border: 1px solid #e5e7eb; padding: 24px; border-radius: 0 0 8px 8px;">
              <h2 style="color: #1f2937; margin-top: 0;">${subject}</h2>
              <div style="background: #f9fafb; border-left: 4px solid #dc2626; padding: 12px 16px; border-radius: 4px;">
                <pre style="margin: 0; font-family: monospace; white-space: pre-wrap;">${body}</pre>
              </div>
              <p style="color: #6b7280; font-size: 14px; margin-top: 16px;">
                Thời gian phát hiện: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
              </p>
              <p style="color: #6b7280; font-size: 12px;">
                Email này được gửi tự động từ hệ thống bảo mật. Vui lòng kiểm tra OPS Dashboard để xử lý.
              </p>
            </div>
          </div>
        `,
      });
      this.logger.log(`Security alert email sent to ${adminEmail}: ${subject}`);
    } catch (error) {
      this.logger.error(`Failed to send security alert email: ${error.message}`);
    }
  }
}
