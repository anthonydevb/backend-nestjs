import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Attendance } from '../../entities/attendance.entity';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    @InjectRepository(Attendance)
    private attendanceRepository: Repository<Attendance>,
  ) {}

  /**
   * Limpia los registros de asistencia más antiguos de 1 mes
   * Se ejecuta automáticamente el primer día de cada mes a las 2:00 AM
   */
  @Cron('0 2 1 * *') // Primer día del mes a las 2:00 AM
  async cleanupOldAttendances() {
    this.logger.log('🧹 Iniciando limpieza mensual de registros antiguos...');

    try {
      // Calcular la fecha límite (hace 1 mes)
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      oneMonthAgo.setHours(0, 0, 0, 0);

      // Buscar registros más antiguos de 1 mes
      // Buscamos por createdAt o entryTime
      const oldAttendances = await this.attendanceRepository
        .createQueryBuilder('attendance')
        .where('attendance.createdAt < :oneMonthAgo', { oneMonthAgo })
        .orWhere('attendance.entryTime < :oneMonthAgo', { oneMonthAgo })
        .getMany();

      if (oldAttendances.length === 0) {
        this.logger.log('✅ No hay registros antiguos para eliminar');
        return;
      }

      // Filtrar registros que realmente sean más antiguos de 1 mes
      const toDelete = oldAttendances.filter((attendance) => {
        const dateToCheck = attendance.entryTime 
          ? new Date(attendance.entryTime)
          : attendance.createdAt 
          ? new Date(attendance.createdAt)
          : null;

        if (!dateToCheck) return false;

        return dateToCheck < oneMonthAgo;
      });

      if (toDelete.length === 0) {
        this.logger.log('✅ No hay registros antiguos para eliminar después del filtrado');
        return;
      }

      // Eliminar los registros
      const result = await this.attendanceRepository.remove(toDelete);

      this.logger.log(
        `✅ Limpieza completada: ${result.length} registros eliminados (anteriores a ${oneMonthAgo.toLocaleDateString('es-ES')})`,
      );
    } catch (error) {
      this.logger.error('❌ Error al limpiar registros antiguos:', error);
    }
  }

  /**
   * Método manual para ejecutar la limpieza (útil para testing o ejecución manual)
   */
  async cleanupManually(): Promise<{ deleted: number; message: string }> {
    this.logger.log('🧹 Ejecutando limpieza manual de registros antiguos...');

    try {
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      oneMonthAgo.setHours(0, 0, 0, 0);

      const oldAttendances = await this.attendanceRepository
        .createQueryBuilder('attendance')
        .where('attendance.createdAt < :oneMonthAgo', { oneMonthAgo })
        .orWhere('attendance.entryTime < :oneMonthAgo', { oneMonthAgo })
        .getMany();

      const toDelete = oldAttendances.filter((attendance) => {
        const dateToCheck = attendance.entryTime 
          ? new Date(attendance.entryTime)
          : attendance.createdAt 
          ? new Date(attendance.createdAt)
          : null;

        if (!dateToCheck) return false;

        return dateToCheck < oneMonthAgo;
      });

      if (toDelete.length === 0) {
        const message = 'No hay registros antiguos para eliminar';
        this.logger.log(`✅ ${message}`);
        return { deleted: 0, message };
      }

      const result = await this.attendanceRepository.remove(toDelete);

      const message = `${result.length} registros eliminados (anteriores a ${oneMonthAgo.toLocaleDateString('es-ES')})`;
      this.logger.log(`✅ ${message}`);
      
      return { deleted: result.length, message };
    } catch (error) {
      this.logger.error('❌ Error al limpiar registros antiguos:', error);
      throw error;
    }
  }
}

