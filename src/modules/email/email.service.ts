import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;
  private readonly gmailUser: string;

  constructor(private configService: ConfigService) {
    // Obtener credenciales de variables de entorno
    const gmailUser = this.configService.get<string>('GMAIL_USER');
    const gmailPassword = this.configService.get<string>('GMAIL_APP_PASSWORD');
    
    // Guardar gmailUser para usar en otros métodos
    this.gmailUser = gmailUser || '';

    // Validar que las credenciales estén configuradas
    if (!gmailUser || !gmailPassword) {
      this.logger.error(
        '❌ ERROR: GMAIL_USER o GMAIL_APP_PASSWORD no están configuradas en el archivo .env\n' +
        '📝 Pasos para solucionar:\n' +
        '1. Abre el archivo .env en la raíz de asistencia-backend\n' +
        '2. Agrega estas líneas:\n' +
        '   GMAIL_USER=tu-email@gmail.com\n' +
        '   GMAIL_APP_PASSWORD=tu-contraseña-de-aplicacion\n' +
        '3. Reemplaza con tus credenciales reales\n' +
        '4. REINICIA el servidor\n' +
        '📖 Ver RECUPERACION-CONTRASENA.md para más detalles'
      );
      throw new Error('Credenciales de Gmail no configuradas. Ver logs para instrucciones.');
    }

    // Configurar transporter de Gmail SMTP
    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // true para 465, false para otros puertos
      auth: {
        user: gmailUser,
        pass: gmailPassword,
      },
    });

    // Log de configuración (sin mostrar la contraseña completa)
    this.logger.log(`📧 Email configurado para: ${gmailUser}`);
    this.logger.log(`✅ Servicio de email listo (contraseña: ${gmailPassword ? '***' + gmailPassword.slice(-4) : 'NO CONFIGURADA'})`);
  }

  /**
   * Envía email de recuperación de contraseña con código de 6 dígitos
   */
  async sendPasswordResetEmail(email: string, resetCode: string, userName?: string): Promise<void> {
    const mailOptions = {
      from: `"Sistema de Asistencia CETPRE" <${this.gmailUser}>`,
      to: email,
      subject: 'Código de Recuperación - Sistema de Asistencia',
      html: this.getPasswordResetEmailTemplate(userName || 'Usuario', resetCode),
    };

    try {
      await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email de recuperación con código enviado a: ${email}`);
    } catch (error) {
      this.logger.error(`Error al enviar email a ${email}:`, error);
      throw error;
    }
  }

  /**
   * Envía email de confirmación de cambio de contraseña
   */
  async sendPasswordChangedConfirmation(email: string, userName?: string): Promise<void> {
    const mailOptions = {
      from: `"Sistema de Asistencia CETPRE" <${this.gmailUser}>`,
      to: email,
      subject: 'Contraseña actualizada exitosamente',
      html: this.getPasswordChangedEmailTemplate(userName || 'Usuario'),
    };

    try {
      await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email de confirmación enviado a: ${email}`);
    } catch (error) {
      this.logger.error(`Error al enviar email de confirmación a ${email}:`, error);
      throw error;
    }
  }

  /**
   * Template HTML para email de recuperación de contraseña con código de 6 dígitos
   */
  private getPasswordResetEmailTemplate(userName: string, resetCode: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .code-box { background: white; border: 3px solid #667eea; border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2); }
          .code { font-size: 48px; font-weight: bold; color: #667eea; letter-spacing: 8px; font-family: 'Courier New', monospace; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
          .instructions { background: #e7f3ff; border-left: 4px solid #2196F3; padding: 15px; margin: 20px 0; }
          .step { margin: 10px 0; padding-left: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Recuperación de Contraseña</h1>
          </div>
          <div class="content">
            <p>Hola <strong>${userName}</strong>,</p>
            <p>Recibimos una solicitud para restablecer tu contraseña en el Sistema de Asistencia CETPRE.</p>
            
            <div class="code-box">
              <p style="margin: 0 0 15px 0; color: #666; font-size: 14px;">Tu código de recuperación es:</p>
              <div class="code">${resetCode}</div>
            </div>

            <div class="instructions">
              <strong>📱 Instrucciones para usar este código:</strong>
              <div class="step">1. Abre la aplicación móvil de profesores</div>
              <div class="step">2. Ve a "¿Olvidaste tu contraseña?"</div>
              <div class="step">3. Ingresa este código de 6 dígitos</div>
              <div class="step">4. Crea tu nueva contraseña</div>
            </div>

            <div class="warning">
              <strong>⚠️ Importante:</strong> 
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>Este código expirará en <strong>15 minutos</strong></li>
                <li>No compartas este código con nadie</li>
                <li>Si no solicitaste este cambio, ignora este email</li>
              </ul>
            </div>
          </div>
          <div class="footer">
            <p>Este es un email automático, por favor no respondas.</p>
            <p>Sistema de Asistencia CETPRE</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Template HTML para email de confirmación de cambio de contraseña
   */
  private getPasswordChangedEmailTemplate(userName: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          .alert { background: #d1ecf1; border-left: 4px solid #0c5460; padding: 15px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Contraseña Actualizada</h1>
          </div>
          <div class="content">
            <p>Hola <strong>${userName}</strong>,</p>
            <p>Tu contraseña ha sido actualizada exitosamente.</p>
            <p>Ahora puedes iniciar sesión con tu nueva contraseña.</p>
            <div class="alert">
              <strong>🔒 Seguridad:</strong> Si no realizaste este cambio, contacta al administrador inmediatamente.
            </div>
          </div>
          <div class="footer">
            <p>Este es un email automático, por favor no respondas.</p>
            <p>Sistema de Asistencia CETPRE</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

