import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Justificacion, EstadoJustificacion, TipoJustificacion } from '../../entities/justificacion.entity';
import { Professor } from '../../entities/professors.entity';
import { User } from '../../entities/user.entity';
import { AttendancesService } from '../attendances/attendances.service';

@Injectable()
export class JustificacionesService {
  constructor(
    @InjectRepository(Justificacion)
    private justificacionesRepository: Repository<Justificacion>,
    @InjectRepository(Professor)
    private professorsRepository: Repository<Professor>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @Inject(forwardRef(() => AttendancesService))
    private attendancesService: AttendancesService,
  ) {}

  // Crear justificación
  async create(createJustificacionDto: {
    profesorId: number;
    fecha: string;
    tipo: string;
    descripcion: string;
  }): Promise<Justificacion> {
    // Validar que el profesor existe
    const profesor = await this.professorsRepository.findOne({
      where: { id: createJustificacionDto.profesorId },
    });

    if (!profesor) {
      throw new NotFoundException('Profesor no encontrado');
    }

    // Validar descripción
    if (!createJustificacionDto.descripcion || createJustificacionDto.descripcion.trim().length < 10) {
      throw new BadRequestException('La descripción debe tener al menos 10 caracteres');
    }

    // Validar tipo
    if (!Object.values(TipoJustificacion).includes(createJustificacionDto.tipo as TipoJustificacion)) {
      throw new BadRequestException('Tipo de justificación no válido');
    }

    // Convertir fecha string a Date
    const fecha = new Date(createJustificacionDto.fecha);
    if (isNaN(fecha.getTime())) {
      throw new BadRequestException('Fecha no válida');
    }

    // Convertir fecha a formato Date (solo fecha, sin hora)
    const fechaDate = new Date(createJustificacionDto.fecha + 'T00:00:00');
    fechaDate.setHours(0, 0, 0, 0);

    // Verificar si ya existe justificación para esta fecha
    const fechaFin = new Date(fechaDate);
    fechaFin.setHours(23, 59, 59, 999);

    const justificacionExistente = await this.justificacionesRepository.findOne({
      where: {
        profesorId: createJustificacionDto.profesorId,
        fecha: Between(fechaDate, fechaFin),
      },
    });

    if (justificacionExistente) {
      if (justificacionExistente.estado === EstadoJustificacion.APROBADA) {
        throw new BadRequestException('Ya existe una justificación aprobada para esta fecha');
      }
      if (justificacionExistente.estado === EstadoJustificacion.PENDIENTE) {
        throw new BadRequestException('Ya existe una justificación pendiente para esta fecha');
      }
    }

    // Crear justificación
    const justificacion = this.justificacionesRepository.create({
      profesorId: createJustificacionDto.profesorId,
      fecha: fechaDate,
      tipo: createJustificacionDto.tipo as TipoJustificacion,
      descripcion: createJustificacionDto.descripcion.trim(),
      estado: EstadoJustificacion.PENDIENTE,
    });

    return await this.justificacionesRepository.save(justificacion);
  }

  // Obtener justificaciones por profesor
  async findByProfesor(profesorId: number): Promise<Justificacion[]> {
    return await this.justificacionesRepository.find({
      where: { profesorId },
      relations: ['profesor', 'admin'],
      order: { fecha: 'DESC', fechaCreacion: 'DESC' },
    });
  }

  // Obtener justificación por ID
  async findOne(id: number): Promise<Justificacion> {
    const justificacion = await this.justificacionesRepository.findOne({
      where: { id },
      relations: ['profesor', 'admin'],
    });

    if (!justificacion) {
      throw new NotFoundException('Justificación no encontrada');
    }

    return justificacion;
  }

  // Obtener justificaciones pendientes (para admin)
  async findPendientes(): Promise<Justificacion[]> {
    return await this.justificacionesRepository.find({
      where: { estado: EstadoJustificacion.PENDIENTE },
      relations: ['profesor'],
      order: { fechaCreacion: 'ASC' },
    });
  }

  // Obtener todas las justificaciones (para admin)
  async findAll(): Promise<Justificacion[]> {
    return await this.justificacionesRepository.find({
      relations: ['profesor', 'admin'],
      order: { fechaCreacion: 'DESC' },
    });
  }

  // Aprobar justificación
  async aprobar(id: number, adminId: number): Promise<Justificacion> {
    const justificacion = await this.findOne(id);

    if (justificacion.estado !== EstadoJustificacion.PENDIENTE) {
      throw new BadRequestException('Solo se pueden aprobar justificaciones pendientes');
    }

    // Validar que el admin existe
    const admin = await this.usersRepository.findOne({ where: { id: adminId } });
    if (!admin) {
      throw new NotFoundException('Administrador no encontrado');
    }

    // Actualizar estado de la justificación
    justificacion.estado = EstadoJustificacion.APROBADA;
    justificacion.adminId = adminId;
    justificacion.fechaAprobacion = new Date();

    // Guardar la justificación primero
    const justificacionGuardada = await this.justificacionesRepository.save(justificacion);

    // Actualizar/crear registro de asistencia con la justificación aprobada
    try {
      // Mapear el tipo de justificación al tipo de asistencia
      // Por defecto, todas las justificaciones se consideran 'absence' (ausencia completa)
      // Si en el futuro queremos diferenciar retrasos o salidas tempranas, podemos ajustar esto
      const attendanceType: 'absence' | 'delay' | 'early_exit' = 'absence';
      
      // Construir el texto de justificación que incluye tipo y descripción
      const tipoLabel = this.getTipoLabel(justificacion.tipo);
      const justificationText = `[${tipoLabel}] ${justificacion.descripcion}`;
      
      console.log(`   📝 Texto de justificación construido: ${justificationText.substring(0, 100)}...`);
      console.log(`   📏 Longitud de justificación: ${justificationText.length} caracteres`);

      // Asegurar que la fecha sea un objeto Date válido
      let fechaDate: Date;
      if (justificacion.fecha instanceof Date) {
        fechaDate = justificacion.fecha;
      } else if (typeof justificacion.fecha === 'string') {
        fechaDate = new Date(justificacion.fecha);
      } else {
        fechaDate = new Date(justificacion.fecha);
      }

      // Normalizar la fecha
      fechaDate.setHours(0, 0, 0, 0);

      console.log(`✅ Aprobando justificación ${justificacion.id} para profesor ${justificacion.profesorId} en fecha ${fechaDate.toISOString()}`);
      console.log(`   Tipo: ${attendanceType}, Justificación: ${justificationText.substring(0, 50)}...`);

      // Verificar longitud de justificación antes de llamar
      if (justificationText.trim().length < 10) {
        console.error(`   ❌ ERROR: La justificación tiene menos de 10 caracteres: ${justificationText.length}`);
        throw new BadRequestException(`La justificación debe tener al menos 10 caracteres (actual: ${justificationText.length})`);
      }

      // Actualizar o crear el registro de asistencia
      console.log(`   📞 Llamando a justifyAttendance...`);
      const attendanceResult = await this.attendancesService.justifyAttendance(
        justificacion.profesorId,
        fechaDate,
        attendanceType,
        justificationText,
        admin.name || 'Administrador', // Nombre del admin que aprueba
      );
      console.log(`   ✅ justifyAttendance completado exitosamente`);

      console.log(`✅ Asistencia actualizada/creada correctamente.`);
      console.log(`   ID: ${attendanceResult.id}`);
      console.log(`   EntryTime: ${attendanceResult.entryTime}`);
      console.log(`   ExitTime: ${attendanceResult.exitTime}`);
      console.log(`   Justificación: ${attendanceResult.justification ? attendanceResult.justification.substring(0, 50) + '...' : 'NO HAY JUSTIFICACIÓN'}`);
      console.log(`   MarkedBy: ${attendanceResult.markedBy}`);
      console.log(`   IsManual: ${attendanceResult.isManual}`);
    } catch (error) {
      // Si hay un error al actualizar la asistencia, registrar el error pero intentar continuar
      console.error('❌ ERROR al actualizar asistencia al aprobar justificación:');
      console.error('   Mensaje:', error.message);
      console.error('   Stack:', error.stack);
      console.error('   Detalles:', {
        justificacionId: justificacion.id,
        profesorId: justificacion.profesorId,
        fecha: justificacion.fecha,
        tipo: justificacion.tipo,
        descripcion: justificacion.descripcion,
      });
      
      // Intentar guardar la asistencia directamente sin pasar por justifyAttendance
      // Esto es un fallback en caso de que el método falle
      try {
        console.log('   🔄 Intentando guardar asistencia directamente como fallback...');
        // Esto lo haremos después, por ahora solo logueamos el error
      } catch (fallbackError) {
        console.error('   ❌ También falló el fallback:', fallbackError.message);
      }
      
      // Lanzar el error para que el frontend lo vea y pueda mostrar un mensaje
      // Esto es importante para saber qué está fallando
      throw new BadRequestException(
        `La justificación se aprobó, pero hubo un error al actualizar la asistencia: ${error.message}. ` +
        `Por favor, verifica los logs del backend para más detalles.`
      );
    }

    return justificacionGuardada;
  }

  // Método auxiliar para obtener el label del tipo de justificación
  private getTipoLabel(tipo: TipoJustificacion): string {
    const labels: { [key in TipoJustificacion]: string } = {
      [TipoJustificacion.ENFERMEDAD]: 'Enfermedad',
      [TipoJustificacion.EMERGENCIA]: 'Emergencia Personal',
      [TipoJustificacion.PERMISO]: 'Permiso Administrativo',
      [TipoJustificacion.FESTIVO]: 'Día Festivo',
      [TipoJustificacion.OTRO]: 'Otro',
    };
    return labels[tipo] || tipo;
  }

  // Rechazar justificación
  async rechazar(id: number, adminId: number, motivoRechazo: string): Promise<Justificacion> {
    const justificacion = await this.findOne(id);

    if (justificacion.estado !== EstadoJustificacion.PENDIENTE) {
      throw new BadRequestException('Solo se pueden rechazar justificaciones pendientes');
    }

    if (!motivoRechazo || motivoRechazo.trim().length < 5) {
      throw new BadRequestException('El motivo de rechazo debe tener al menos 5 caracteres');
    }

    // Validar que el admin existe
    const admin = await this.usersRepository.findOne({ where: { id: adminId } });
    if (!admin) {
      throw new NotFoundException('Administrador no encontrado');
    }

    justificacion.estado = EstadoJustificacion.RECHAZADA;
    justificacion.adminId = adminId;
    justificacion.motivoRechazo = motivoRechazo.trim();
    justificacion.fechaAprobacion = new Date();

    return await this.justificacionesRepository.save(justificacion);
  }

  // Verificar si existe justificación para una fecha
  async verificarJustificacion(profesorId: number, fecha: string): Promise<{ existe: boolean; justificacion?: Justificacion }> {
    const fechaDate = new Date(fecha + 'T00:00:00');
    fechaDate.setHours(0, 0, 0, 0);
    const fechaFin = new Date(fechaDate);
    fechaFin.setHours(23, 59, 59, 999);

    const justificacion = await this.justificacionesRepository.findOne({
      where: {
        profesorId,
        fecha: Between(fechaDate, fechaFin),
      },
      relations: ['profesor', 'admin'],
    });

    return {
      existe: !!justificacion,
      justificacion: justificacion || undefined,
    };
  }
}

