import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendancesService } from './attendances.service';
import { AttendancesController } from './attendances.controller';
import { CleanupService } from './cleanup.service';
import { Attendance } from '../../entities/attendance.entity';
import { Professor } from '../../entities/professors.entity';
import { QrCode } from '../../entities/qr-code.entity';
import { Horario } from '../../entities/horario.entity';
import { ReportsModule } from '../reports/reports.module';
import { EventsModule } from '../../gateways/events.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { HorariosModule } from '../horarios/horarios.module';

@Module({
  imports: [
    // Registrar las entidades necesarias para este módulo
    TypeOrmModule.forFeature([Attendance, Professor, QrCode, Horario]),
    forwardRef(() => ReportsModule), // Importar ReportsModule para usar ReportsService
    EventsModule, // 🔹 para emitir eventos en tiempo real
    NotificationsModule, // 🔹 para enviar notificaciones a administradores
    UsersModule, // 🔹 para obtener usuarios administradores
    HorariosModule, // 🔹 para obtener horarios
  ],
  controllers: [AttendancesController],
  providers: [AttendancesService, CleanupService],
  exports: [AttendancesService, CleanupService], // Exporta los servicios
})
export class AttendancesModule {}
