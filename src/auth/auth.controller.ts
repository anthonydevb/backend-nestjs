import { Controller, Post, Body, Get, Param, Query } from '@nestjs/common';
import { AuthService } from './auth.service';
import { User } from '../entities/user.entity';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // 🔹 Login de administradores (web)
  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    const user: User = await this.authService.validateUser(body.email, body.password);
    return { id: user.id, name: user.name, role: user.role };
  }

  // 🔹 Login de profesores (app Ionic)
  @Post('login-professor')
async loginProfessor(@Body() body: { email: string; password: string }) {
  console.log('🧩 Body recibido:', body);
  const user: User = await this.authService.validateProfessor(body.email, body.password);
  
  // Si el usuario tiene un profesor relacionado, devolver el ID del profesor
  if (user.professor && user.professor.id) {
    return { 
      id: user.professor.id, // ID del profesor para usar en asistencias
      userId: user.id, // ID del usuario
      name: user.professor.name || user.name, 
      role: user.role 
    };
  }
  
  // Si no tiene profesor relacionado, devolver solo el usuario (fallback)
  return { id: user.id, name: user.name, role: user.role };
}

  // 🔹 Solicitar recuperación de contraseña
  @Post('forgot-password')
  async forgotPassword(
    @Body() body: { email: string; frontendUrl?: string }
  ): Promise<{ message: string }> {
    return this.authService.requestPasswordReset(
      body.email,
      body.frontendUrl || 'http://localhost:4200'
    );
  }

  // 🔹 Verificar código de recuperación (6 dígitos)
  @Get('verify-reset-code/:code')
  async verifyResetCode(@Param('code') code: string): Promise<{ valid: boolean; email?: string }> {
    return this.authService.verifyResetToken(code);
  }

  // 🔹 Resetear contraseña con código de 6 dígitos
  @Post('reset-password')
  async resetPassword(
    @Body() body: { code: string; newPassword: string }
  ): Promise<{ message: string }> {
    return this.authService.resetPassword(body.code, body.newPassword);
  }

  // 🔹 Cambiar contraseña desde el perfil (requiere contraseña actual)
  @Post('change-password')
  async changePassword(
    @Body() body: { userId: number; currentPassword: string; newPassword: string }
  ): Promise<{ message: string }> {
    return this.authService.changePassword(body.userId, body.currentPassword, body.newPassword);
  }
}
