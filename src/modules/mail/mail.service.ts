// mail/mail.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { ResponseException } from 'src/common/common_dto/respone.dto';

@Injectable()
export class MailService {
  private transporter;

  constructor(private readonly configService: ConfigService) {
    const service = this.configService.get<string>('MAIL_SERVICE') || 'gmail';
    const user = this.configService.get<string>('MAIL_USER');
    const pass = this.configService.get<string>('MAIL_PASS');

    if (!user || !pass) {
      // Fail fast in dev if mail credentials are not configured
      throw new ResponseException(false, 400, 'Mail credentials not configured. Set MAIL_USER and MAIL_PASS in environment variables.');
    }

    this.transporter = nodemailer.createTransport({
      service,
      auth: { user, pass },
    });
  }

  async sendOtp(to: string, otp: string) {
    await this.transporter.sendMail({
      from: '"Hệ thống Admin" <no-reply@example.com>',
      to,
      subject: 'Mã xác thực OTP - Quên mật khẩu',
      html: `
        <h3>Xin chào,</h3>
        <p>Bạn đã yêu cầu đặt lại mật khẩu.</p>
        <p>Mã OTP của bạn là: <strong style="font-size: 24px; color: #d9534f;">${otp}</strong></p>
        <p>Mã này sẽ hết hạn sau 5 phút.</p>
        <p>Nếu không phải bạn thực hiện, vui lòng bỏ qua email này.</p>
      `,
    });
  }
}