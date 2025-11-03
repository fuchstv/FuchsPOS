import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'net';

interface SmtpConfig {
  host: string;
  port: number;
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly smtpConfig: SmtpConfig | null;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT') ?? 587;

    this.smtpConfig = host ? { host, port } : null;
  }

  async sendReceiptEmail(to: string, subject: string, html: string) {
    await this.sendMail({ to, subject, html });
  }

  async sendReportReadyEmail(to: string, subject: string, html: string) {
    await this.sendMail({ to, subject, html });
  }

  private async deliverMail(options: {
    from: string;
    to: string;
    subject: string;
    html: string;
    host: string;
    port: number;
  }) {
    const { from, to, subject, html, host, port } = options;
    const socket = new Socket();

    await new Promise<void>((resolve, reject) => {
      socket.once('error', reject);
      socket.connect(port, host, () => {
        socket.removeListener('error', reject);
        resolve();
      });
    });

    const readResponse = async (expectedCodes: number[]) => {
      const response = await new Promise<string>((resolve, reject) => {
        const onData = (data: Buffer) => {
          socket.off('error', reject);
          const payload = data.toString('utf-8');
          resolve(payload);
        };
        socket.once('data', onData);
        socket.once('error', reject);
      });

      const code = parseInt(response.slice(0, 3), 10);
      if (!expectedCodes.includes(code)) {
        throw new Error(`SMTP error: ${response.trim()}`);
      }
    };

    const sendCommand = async (command: string, expected: number[]) => {
      socket.write(`${command}\r\n`);
      await readResponse(expected);
    };

    try {
      await readResponse([220]);
      await sendCommand(`HELO fuchspos.local`, [250]);
      await sendCommand(`MAIL FROM:<${from}>`, [250]);
      await sendCommand(`RCPT TO:<${to}>`, [250, 251]);
      await sendCommand('DATA', [354]);

      const message = [
        `From: ${from}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset="utf-8"',
        '',
        html,
        '.',
      ].join('\r\n');

      socket.write(`${message}\r\n`);
      await readResponse([250]);
      await sendCommand('QUIT', [221]);
      this.logger.log(`E-Mail an ${to} gesendet: ${subject}`);
    } catch (error) {
      this.logger.error(`SMTP Versand fehlgeschlagen: ${error}`);
    } finally {
      socket.end();
    }
  }

  private async sendMail(options: { to: string; subject: string; html: string }) {
    const from = this.configService.get<string>('SMTP_FROM', 'no-reply@fuchspos.local');

    if (!this.smtpConfig) {
      this.logger.log(`[MAIL MOCK] ${options.subject} -> ${options.to}`);
      this.logger.debug(options.html);
      return;
    }

    await this.deliverMail({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      host: this.smtpConfig.host,
      port: this.smtpConfig.port,
    });
  }
}
