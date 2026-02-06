import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository, Not } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { QrCode } from '../../entities/qr-code.entity';
import { Attendance } from '../../entities/attendance.entity';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class QrService {
  constructor(
    @InjectRepository(QrCode)
    private readonly qrRepositorio: Repository<QrCode>,
    @InjectRepository(Attendance)
    private readonly attendanceRepository: Repository<Attendance>,
  ) {}

  // Crear un nuevo QR
  // Opcional: desactivar un QR antiguo
  async create(newQrName?: string, deactivateOldId?: number): Promise<QrCode> {
    // Desactivar QR antiguo si se indica
    if (deactivateOldId) {
      await this.qrRepositorio.update(deactivateOldId, { activo: false });
    }

    // Generar token único para el nuevo QR
    const token = uuidv4(); // también puedes usar un nombre fijo opcional
    
    // Calcular fecha de expiración (24 horas desde ahora)
    const fechaExpiracion = new Date();
    fechaExpiracion.setHours(fechaExpiracion.getHours() + 24);
    
    const qr = this.qrRepositorio.create({
      token: newQrName || token,
      activo: true,
      fecha_expiracion: fechaExpiracion,
    });

    return await this.qrRepositorio.save(qr);
  }

  // Listar todos los QR (excluyendo MANUAL_MARK que se usa para marcados manuales)
  async findAll(): Promise<QrCode[]> {
    return this.qrRepositorio.find({
      where: { token: Not('MANUAL_MARK') },
    });
  }

  // Buscar QR activo por token
  async findActiveByToken(token: string): Promise<QrCode | null> {
    return this.qrRepositorio.findOne({
      where: { token, activo: true },
    });
  }

  // Desactivar QR
  async deactivate(qrId: number): Promise<void> {
    await this.qrRepositorio.update(qrId, { activo: false });
  }

  // Eliminar QR (solo si está desactivado y no tiene registros relacionados)
  async delete(qrId: number): Promise<void> {
    const qr = await this.qrRepositorio.findOne({ where: { id: qrId } });
    
    if (!qr) {
      throw new NotFoundException('QR no encontrado');
    }
    
    if (qr.activo) {
      throw new BadRequestException('No se puede eliminar un QR activo. Debe desactivarlo primero.');
    }
    
    // Verificar si hay registros de asistencia relacionados usando QueryBuilder con join
    const relatedAttendancesCount = await this.attendanceRepository
      .createQueryBuilder('attendance')
      .leftJoin('attendance.qr', 'qr')
      .where('qr.id = :qrId', { qrId })
      .getCount();
    
    if (relatedAttendancesCount > 0) {
      throw new BadRequestException(
        'No se puede eliminar este QR porque tiene registros de asistencia asociados. ' +
        'Para mantener la integridad de los datos, los QRs con asistencias no pueden ser eliminados.'
      );
    }
    
    try {
      await this.qrRepositorio.delete(qrId);
    } catch (error) {
      // Manejar errores de base de datos (restricciones de clave foránea, etc.)
      if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === '23503') {
        throw new BadRequestException(
          'No se puede eliminar este QR porque tiene registros relacionados en la base de datos.'
        );
      }
      throw new BadRequestException(`Error al eliminar el QR: ${error.message}`);
    }
  }
}
