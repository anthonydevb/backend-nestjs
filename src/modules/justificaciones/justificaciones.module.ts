import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JustificacionesService } from './justificaciones.service';
import { JustificacionesController } from './justificaciones.controller';
import { Justificacion } from '../../entities/justificacion.entity';
import { Professor } from '../../entities/professors.entity';
import { User } from '../../entities/user.entity';
import { AttendancesModule } from '../attendances/attendances.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Justificacion, Professor, User]),
    forwardRef(() => AttendancesModule), // Importar AttendancesModule para usar AttendancesService
  ],
  controllers: [JustificacionesController],
  providers: [JustificacionesService],
  exports: [JustificacionesService],
})
export class JustificacionesModule {}

