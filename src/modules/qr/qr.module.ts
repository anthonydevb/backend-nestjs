import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QrController } from './qr.controller';
import { QrService } from './qr.service';
import { QrCode } from '../../entities/qr-code.entity';
import { Attendance } from '../../entities/attendance.entity';

@Module({
  imports: [TypeOrmModule.forFeature([QrCode, Attendance])], // Registrar las entidades con TypeORM
  controllers: [QrController],
  providers: [QrService],
  exports: [QrService], // Exportar el servicio si se usará en otros módulos
})
export class QrModule {}
