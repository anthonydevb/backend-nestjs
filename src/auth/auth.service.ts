import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../modules/users/users.service';
import { User, UserRole } from '../entities/user.entity';
import { PasswordResetToken } from '../entities/password-reset-token.entity';
import { EmailService } from '../modules/email/email.service';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    @InjectRepository(PasswordResetToken)
    private passwordResetTokenRepository: Repository<PasswordResetToken>,
    private emailService: EmailService,
  ) {}

  // 🔹 Login para administradores (web)
  async validateUser(email: string, password: string): Promise<User> {
    this.logger.log(`Buscando usuario con email: ${email}`);

    const user = await this.usersService.findByEmail(email);
    this.logger.log(`Usuario encontrado: ${JSON.stringify(user)}`);

    if (!user) {
      throw new BadRequestException('Usuario no encontrado');
    }

    const dbPass = String(user.password).trim();
    const reqPass = String(password).trim();

    if (dbPass !== reqPass) {
      this.logger.error(`Contraseña no coincide. DB: "${dbPass}", Req: "${reqPass}"`);
      throw new BadRequestException('Correo o contraseña incorrectos');
    }

    // 🚫 Bloquear profesores en la web
    if (user.role === UserRole.PROFESSOR) {
      throw new BadRequestException('El acceso web es solo para administradores');
    }

    this.logger.log('Usuario validado correctamente (admin)');
    return user;
  }

  // 🔹 Nueva función: login para profesores (app Ionic)
async validateProfessor(email: string, password: string): Promise<User> {
  this.logger.log(`📨 Email recibido: "${email}", Password recibido: "${password}"`);

  const user = await this.usersService.findByEmailWithProfessor(email);
  this.logger.log(`🧩 Usuario encontrado: ${JSON.stringify(user)}`);

  if (!user) {
    throw new BadRequestException('Usuario no encontrado');
  }

  const dbPass = String(user.password).trim();
  const reqPass = String(password).trim();

  this.logger.log(`🔑 Contraseña DB: "${dbPass}" vs Enviada: "${reqPass}"`);
  this.logger.log(`🎭 Rol: ${user.role}`);

  if (dbPass !== reqPass) {
    throw new BadRequestException('Correo o contraseña incorrectos');
  }

  if (user.role !== UserRole.PROFESSOR) {
    throw new BadRequestException('Solo los profesores pueden acceder desde la app');
  }

  if (!user.professor) {
    throw new BadRequestException('El usuario no está asociado a un profesor');
  }

  this.logger.log('✅ Profesor validado correctamente');
  return user;
}

  /**
   * Solicitar recuperación de contraseña
   * Genera un código de 6 dígitos en lugar de token largo
   */
  async requestPasswordReset(email: string, frontendUrl: string = 'http://localhost:4200'): Promise<{ message: string }> {
    // Buscar usuario por email
    const user = await this.usersService.findByEmail(email);
    
    // Por seguridad, no revelamos si el email existe o no
    if (!user) {
      this.logger.warn(`Intento de recuperación de contraseña para email no registrado: ${email}`);
      // Retornamos mensaje genérico para no revelar si el email existe
      return { message: 'Si el email existe, recibirás un código de recuperación' };
    }

    // Generar código de 6 dígitos (000000 - 999999)
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedCode = crypto.createHash('sha256').update(resetCode).digest('hex');
    
    // Fecha de expiración (15 minutos para códigos cortos)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    // Invalidar códigos anteriores del mismo email
    await this.passwordResetTokenRepository.update(
      { email, used: false },
      { used: true }
    );

    // Guardar código hasheado en base de datos
    const resetToken = this.passwordResetTokenRepository.create({
      email,
      token: hashedCode,
      expiresAt,
      used: false,
    });
    await this.passwordResetTokenRepository.save(resetToken);

    // Enviar email con el código de 6 dígitos
    try {
      await this.emailService.sendPasswordResetEmail(email, resetCode, user.name);
      this.logger.log(`Email de recuperación con código enviado a: ${email}`);
    } catch (error) {
      this.logger.error(`Error al enviar email de recuperación:`, error);
      // No lanzamos error para no revelar si el email existe
    }

    return { message: 'Si el email existe, recibirás un código de recuperación' };
  }

  /**
   * Verificar código de recuperación (6 dígitos)
   */
  async verifyResetToken(code: string): Promise<{ valid: boolean; email?: string }> {
    // Validar que sea un código de 6 dígitos
    if (!/^\d{6}$/.test(code)) {
      return { valid: false };
    }

    const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
    
    const resetToken = await this.passwordResetTokenRepository.findOne({
      where: { token: hashedCode },
    });

    if (!resetToken) {
      return { valid: false };
    }

    if (resetToken.used) {
      return { valid: false };
    }

    if (new Date() > resetToken.expiresAt) {
      return { valid: false };
    }

    return { valid: true, email: resetToken.email };
  }

  /**
   * Resetear contraseña con código de 6 dígitos
   */
  async resetPassword(code: string, newPassword: string): Promise<{ message: string }> {
    // Validar que sea un código de 6 dígitos
    if (!/^\d{6}$/.test(code)) {
      throw new BadRequestException('El código debe ser de 6 dígitos');
    }

    // Verificar código
    const verification = await this.verifyResetToken(code);
    
    if (!verification.valid || !verification.email) {
      throw new BadRequestException('Código inválido o expirado');
    }

    // Validar contraseña
    if (!this.validatePassword(newPassword)) {
      throw new BadRequestException(
        'La contraseña debe tener al menos 8 caracteres, una mayúscula y un número'
      );
    }

    // Buscar usuario
    const user = await this.usersService.findByEmail(verification.email);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Verificar que no sea la misma contraseña
    if (user.password === newPassword.trim()) {
      throw new BadRequestException('La nueva contraseña debe ser diferente a la anterior');
    }

    // Actualizar contraseña
    await this.usersService.update(user.id, { password: newPassword.trim() });

    // Marcar código como usado
    const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
    await this.passwordResetTokenRepository.update(
      { token: hashedCode },
      { used: true }
    );

    // Enviar email de confirmación
    try {
      await this.emailService.sendPasswordChangedConfirmation(verification.email, user.name);
    } catch (error) {
      this.logger.error(`Error al enviar email de confirmación:`, error);
      // No lanzamos error, el cambio de contraseña ya se hizo
    }

    this.logger.log(`Contraseña restablecida para usuario: ${verification.email}`);
    return { message: 'Contraseña restablecida exitosamente' };
  }

  /**
   * Validar formato de contraseña
   */
  private validatePassword(password: string): boolean {
    // Mínimo 8 caracteres, al menos una mayúscula y un número
    const passwordRegex = /^(?=.*[A-Z])(?=.*[0-9]).{8,}$/;
    return passwordRegex.test(password);
  }

  /**
   * Cambiar contraseña desde el perfil (requiere contraseña actual)
   */
  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<{ message: string }> {
    // Buscar usuario
    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Verificar contraseña actual
    const dbPass = String(user.password).trim();
    const reqPass = String(currentPassword).trim();

    if (dbPass !== reqPass) {
      throw new BadRequestException('La contraseña actual es incorrecta');
    }

    // Validar nueva contraseña
    if (!this.validatePassword(newPassword)) {
      throw new BadRequestException(
        'La nueva contraseña debe tener al menos 8 caracteres, una mayúscula y un número'
      );
    }

    // Verificar que no sea la misma contraseña
    if (user.password === newPassword.trim()) {
      throw new BadRequestException('La nueva contraseña debe ser diferente a la actual');
    }

    // Actualizar contraseña
    await this.usersService.update(userId, { password: newPassword.trim() });

    // Enviar email de confirmación
    try {
      await this.emailService.sendPasswordChangedConfirmation(user.email, user.name);
    } catch (error) {
      this.logger.error(`Error al enviar email de confirmación:`, error);
      // No lanzamos error, el cambio de contraseña ya se hizo
    }

    this.logger.log(`Contraseña cambiada para usuario: ${user.email}`);
    return { message: 'Contraseña cambiada exitosamente' };
  }
}
