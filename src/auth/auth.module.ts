import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../modules/users/users.module';
import { PasswordResetToken } from '../entities/password-reset-token.entity';
import { EmailModule } from '../modules/email/email.module';

@Module({
  imports: [
    UsersModule,
    EmailModule,
    TypeOrmModule.forFeature([PasswordResetToken]),
  ],
  providers: [AuthService],
  controllers: [AuthController],
})
export class AuthModule {}
