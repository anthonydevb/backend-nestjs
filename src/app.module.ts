import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './auth/auth.module';
import { User } from './entities/user.entity';
import { Professor } from './entities/professors.entity';
import { ProfessorsModule } from './modules/professors/professors.module';
import { QrModule } from './modules/qr/qr.module';
import { QrCode } from './entities/qr-code.entity';
import { AttendancesModule } from './modules/attendances/attendances.module';
import { Attendance } from './entities/attendance.entity';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { Notification } from './entities/notification.entity';
import { ReportsModule } from './modules/reports/reports.module';
import { AttendanceReport } from './entities/attendance-report.entity';
import { Departamento } from './entities/departamento.entity';
import { Horario } from './entities/horario.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { Justificacion } from './entities/justificacion.entity';
import { EventsModule } from './gateways/events.module';
import { DepartamentosModule } from './modules/departamentos/departamentos.module';
import { HorariosModule } from './modules/horarios/horarios.module';
import { JustificacionesModule } from './modules/justificaciones/justificaciones.module';

@Module({
  imports: [
    // Configurar variables de entorno
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Habilitar tareas programadas (cron jobs)
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DATABASE_HOST || '127.0.0.1',
      port: parseInt(process.env.DATABASE_PORT || '3306'),
      username: process.env.DATABASE_USER || 'root',
      password: process.env.DATABASE_PASSWORD || '12345',
      database: process.env.DATABASE_NAME || 'asistencia1',
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
      synchronize: process.env.NODE_ENV !== 'production', // Solo en desarrollo
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
