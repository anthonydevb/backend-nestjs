import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

import { AppController } from './app.controller';
import { AppService } from './app.service';

// Módulos
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './auth/auth.module';
import { ProfessorsModule } from './modules/professors/professors.module';
import { QrModule } from './modules/qr/qr.module';
import { AttendancesModule } from './modules/attendances/attendances.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReportsModule } from './modules/reports/reports.module';
import { EventsModule } from './gateways/events.module';
import { DepartamentosModule } from './modules/departamentos/departamentos.module';
import { HorariosModule } from './modules/horarios/horarios.module';
import { JustificacionesModule } from './modules/justificaciones/justificaciones.module';

// Entidades
import { User } from './entities/user.entity';
import { Professor } from './entities/professors.entity';
import { QrCode } from './entities/qr-code.entity';
import { Attendance } from './entities/attendance.entity';
import { Notification } from './entities/notification.entity';
import { AttendanceReport } from './entities/attendance-report.entity';
import { Departamento } from './entities/departamento.entity';
import { Horario } from './entities/horario.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { Justificacion } from './entities/justificacion.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST,
      port: parseInt(process.env.DATABASE_PORT ?? '5432'),
      username: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME,
      entities: [
        User,
        Professor,
        QrCode,
        Attendance,
        Notification,
        AttendanceReport,
        Departamento,
        Horario,
        PasswordResetToken,
        Justificacion,
      ],
      synchronize: process.env.NODE_ENV !== 'production', // Solo en dev
      ssl: {
        rejectUnauthorized: false, // Necesario para Render
      },
    }),
    EventsModule,
    UsersModule,
    AuthModule,
    ProfessorsModule,
    QrModule,
    AttendancesModule,
    NotificationsModule,
    ReportsModule,
    DepartamentosModule,
    HorariosModule,
    JustificacionesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
