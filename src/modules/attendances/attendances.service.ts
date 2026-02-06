import { Injectable, BadRequestException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { Between, IsNull, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Attendance } from '../../entities/attendance.entity';
import { Professor } from '../../entities/professors.entity';
import { QrCode } from '../../entities/qr-code.entity';
import { Horario } from '../../entities/horario.entity';
import { ReportsService } from '../reports/reports.service';
import { EventsGateway } from '../../gateways/events.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { HorariosService } from '../horarios/horarios.service';
import { UserRole } from '../../entities/user.entity';
import { NotificationType, NotificationPriority } from '../../entities/notification.entity';

@Injectable()
export class AttendancesService {
  constructor(
    @InjectRepository(Attendance)
    private readonly attendanceRepository: Repository<Attendance>,
    @InjectRepository(Professor)
    private readonly professorRepository: Repository<Professor>,
    @InjectRepository(QrCode)
    private readonly qrRepository: Repository<QrCode>,
    @InjectRepository(Horario)
    private readonly horarioRepository: Repository<Horario>,
    @Inject(forwardRef(() => ReportsService))
    private readonly reportsService: ReportsService,
    private readonly eventsGateway: EventsGateway,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
    private readonly horariosService: HorariosService,
  ) {}

  // Método auxiliar para guardar asistencia y emitir eventos
  private async saveAttendanceWithEvents(attendance: Attendance, isUpdate: boolean = false): Promise<Attendance> {
    const saved = await this.attendanceRepository.save(attendance);
    await this.saveReportAfterAttendance(saved);
    
    // Emitir eventos en tiempo real
    // Si es una asistencia manual, no emitir el evento de creación para evitar activar nuevos QR
    if (isUpdate) {
      this.eventsGateway.emitAttendanceUpdated(saved);
    } else {
      // Solo emitir evento de creación si NO es manual
      // Las asistencias manuales solo actualizan la lista, no activan nuevos QR
      if (!saved.isManual) {
        this.eventsGateway.emitAttendanceCreated(saved);
        // Enviar notificación a administradores cuando se crea una nueva asistencia (solo si no es manual)
        await this.notifyAdminsAboutNewAttendance(saved);
      }
    }
    // Siempre actualizar la lista de asistencias
    this.eventsGateway.emitAttendancesListUpdate();
    
    return saved;
  }

  // Método para enviar notificaciones a todos los administradores sobre una nueva asistencia
  private async notifyAdminsAboutNewAttendance(attendance: Attendance): Promise<void> {
    try {
      // Obtener todos los administradores
      const admins = await this.usersService.findByRole(UserRole.ADMIN);
      
      if (admins.length === 0) {
        console.log('No hay administradores para enviar notificaciones');
        return;
      }

      // Cargar información del profesor si no está cargada
      let professorName = 'Profesor';
      if (!attendance.professor) {
        const fullAttendance = await this.attendanceRepository.findOne({
          where: { id: attendance.id },
          relations: ['professor'],
        });
        if (fullAttendance?.professor) {
          attendance.professor = fullAttendance.professor;
        }
      }
      
      if (attendance.professor) {
        professorName = attendance.professor.name || 'Profesor';
        if (attendance.professor.apellidos) {
          professorName += ` ${attendance.professor.apellidos}`;
        }
      }

      // Formatear la hora de entrada
      const entryTime = attendance.entryTime 
        ? new Date(attendance.entryTime).toLocaleTimeString('es-ES', { 
            hour: '2-digit', 
            minute: '2-digit' 
          })
        : 'No registrada';

      // Determinar el tipo de marcado
      const markedBy = attendance.markedBy || 'Sistema';
      const isManual = attendance.isManual ? 'Marcado manualmente' : 'Marcado por QR';

      // Crear el mensaje de la notificación
      const titulo = `Nueva Asistencia Registrada`;
      const mensaje = `${professorName} ha registrado su asistencia.\n` +
                     `Hora de entrada: ${entryTime}\n` +
                     `Método: ${isManual}${markedBy !== 'Sistema' && markedBy !== 'QR' ? ` por ${markedBy}` : ''}`;

      // Enviar notificación a cada administrador
      const notificationPromises = admins.map(admin => 
        this.notificationsService.create({
          destinatarioId: admin.id,
          titulo,
          mensaje,
          tipo: NotificationType.INFO,
          prioridad: NotificationPriority.MEDIUM,
        }).catch(error => {
          console.error(`Error enviando notificación al administrador ${admin.id}:`, error);
          return null;
        })
      );

      await Promise.all(notificationPromises);
      console.log(`✓ Notificaciones enviadas a ${admins.length} administrador(es) sobre la asistencia del profesor ${professorName}`);
    } catch (error) {
      // No fallar si hay error al enviar notificaciones, solo loguear
      console.error('Error al enviar notificaciones a administradores:', error);
    }
  }

  // Método auxiliar para guardar reporte después de guardar asistencia
  private async saveReportAfterAttendance(attendance: Attendance): Promise<void> {
    try {
      // Cargar relaciones necesarias si no están cargadas
      if (!attendance.professor) {
        const fullAttendance = await this.attendanceRepository.findOne({
          where: { id: attendance.id },
          relations: ['professor'],
        });
        if (fullAttendance && fullAttendance.professor) {
          attendance.professor = fullAttendance.professor;
        }
      }
      
      if (attendance.professor) {
        await this.reportsService.saveReport(attendance);
      }
    } catch (error) {
      // No fallar si hay error al guardar reporte, solo loguear
      console.error('Error al guardar reporte de asistencia:', error);
    }
  }

  // Método auxiliar para verificar si es tardanza
  private async checkIfLate(professor: Professor, entryTime: Date): Promise<boolean> {
    if (!professor.horarioId) {
      return false; // Si no tiene horario asignado, no se considera tardanza
    }

    const horario = await this.horarioRepository.findOne({ where: { id: professor.horarioId } });
    if (!horario) {
      return false; // Si no existe el horario, no se considera tardanza
    }

    // Parsear hora de entrada del horario (formato HH:mm)
    const [horas, minutos] = horario.hora_entrada.split(':').map(Number);
    const horaEntradaHorario = new Date(entryTime);
    horaEntradaHorario.setHours(horas, minutos, 0, 0);

    // Calcular la diferencia en minutos
    const diferenciaMinutos = (entryTime.getTime() - horaEntradaHorario.getTime()) / (1000 * 60);
    
    // Si la diferencia es mayor a la tolerancia, es tardanza
    return diferenciaMinutos > horario.tolerancia_entrada;
  }

  // Mark entry (marcar entrada con QR)
  async markEntry(professorId: number, qrToken: string): Promise<Attendance> {
    const professor = await this.professorRepository.findOne({ where: { id: professorId } });
    if (!professor) throw new NotFoundException('Professor not found');

    const qr = await this.qrRepository.findOne({ where: { token: qrToken, activo: true } });
    if (!qr) throw new BadRequestException('QR code is invalid or inactive');

    const entryTime = new Date();
    const isLate = await this.checkIfLate(professor, entryTime);

    // Definir rango del día de hoy
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // PRIMERO: Buscar si hay una hoja creada por el sistema para hoy
    // Las hojas creadas por el sistema tienen entryTime a las 00:00:00 del día
    // y están marcadas con markedBy = 'Sistema'
    // Buscar primero por markedBy = 'Sistema' y luego verificar la hora
    const allTodayAttendances = await this.attendanceRepository.find({
      where: {
        professor: { id: professorId },
        entryTime: Between(todayStart, todayEnd),
      },
      relations: ['qr'],
    });

    // Buscar hoja del sistema (markedBy = 'Sistema' y hora 00:00:00)
    const existingSheet = allTodayAttendances.find(att => {
      if (att.markedBy === 'Sistema' && att.entryTime) {
        const entryDate = new Date(att.entryTime);
        const entryHour = entryDate.getHours();
        const entryMinutes = entryDate.getMinutes();
        const entrySeconds = entryDate.getSeconds();
        // Verificar que sea exactamente 00:00:00 (o muy cerca)
        return entryHour === 0 && entryMinutes === 0 && entrySeconds < 5;
      }
      return false;
    });

    if (existingSheet) {
      console.log(`✓ Encontrada hoja del sistema para profesor ${professorId}, actualizando con entrada real`);
      // Actualizar la hoja existente con la entrada real
      existingSheet.entryTime = entryTime;
      existingSheet.qr = qr;
      existingSheet.isManual = false;
      existingSheet.markedBy = 'QR'; // Marcar como registrado por QR
      existingSheet.justification = null;
      existingSheet.isLate = isLate;
      const updated = await this.saveAttendanceWithEvents(existingSheet, true);
      console.log(`✓ Hoja actualizada correctamente. Nueva hora de entrada: ${updated.entryTime}, Tardanza: ${isLate}`);
      return updated;
    }

    // SEGUNDO: Verificar si ya hay una entrada real hoy (que no sea hoja del sistema)
    // Usar la lista que ya obtuvimos
    const existingRealEntry = allTodayAttendances.find(att => {
      if (!att.entryTime) return false;
      if (att.markedBy === 'Sistema') return false; // Ignorar hojas del sistema
      const entryDate = new Date(att.entryTime);
      const entryHour = entryDate.getHours();
      const entryMinutes = entryDate.getMinutes();
      // Si tiene una hora real (no 00:00:00), entonces es una entrada válida
      return !(entryHour === 0 && entryMinutes === 0);
    });

    if (existingRealEntry) {
      console.log(`✗ Ya existe una entrada registrada para profesor ${professorId} hoy`);
      throw new BadRequestException('Entry already registered today');
    }

    // Crear nueva asistencia si no se encontró ninguna
    const attendance = this.attendanceRepository.create({
      professor,
      qr,
      entryTime: entryTime,
      isManual: false,
      markedBy: 'QR', // Marcar como registrado por QR
      isLate: isLate,
    });

    const saved = await this.saveAttendanceWithEvents(attendance, false);
    console.log(`✓ Asistencia creada. Hora de entrada: ${saved.entryTime}, Tardanza: ${isLate}`);
    return saved;
  }

  // Mark exit and send activity
  async markExit(professorId: number, qrToken: string, activity: string): Promise<Attendance> {
    const professor = await this.professorRepository.findOne({ where: { id: professorId } });
    if (!professor) throw new NotFoundException('Professor not found');

    const qr = await this.qrRepository.findOne({ where: { token: qrToken, activo: true } });
    if (!qr) throw new BadRequestException('QR code is invalid or inactive');

    // Find today's attendance with entry but no exit
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Buscar asistencia de hoy con entrada pero sin salida
    // No filtrar por QR específico, puede ser que el QR haya cambiado al actualizar la hoja
    const attendance = await this.attendanceRepository.findOne({
      where: {
        professor: { id: professorId },
        entryTime: Between(todayStart, todayEnd),
        exitTime: IsNull(),
      },
      relations: ['qr'],
    });

    if (!attendance || !attendance.entryTime) {
      throw new BadRequestException('No entry found today to register exit');
    }

    // Verificar que tenga una entrada real (no sea solo una hoja del sistema sin actualizar)
    const entryHour = attendance.entryTime.getHours();
    const entryMinutes = attendance.entryTime.getMinutes();
    
    // Si es una hoja del sistema sin actualizar (00:00:00), no se puede marcar salida
    if (entryHour === 0 && entryMinutes === 0 && attendance.markedBy === 'Sistema') {
      throw new BadRequestException('Debe marcar la entrada primero antes de marcar la salida');
    }

    attendance.exitTime = new Date();
    attendance.activity = activity;
    attendance.qr = qr; // Actualizar QR si es necesario
    // Si no tiene markedBy o es 'Sistema', establecer como 'QR' (registrado por QR)
    if (!attendance.markedBy || attendance.markedBy === 'Sistema') {
      attendance.markedBy = 'QR';
    }

    // Marcar como actualización (no nueva asistencia) para no enviar notificación
    return await this.saveAttendanceWithEvents(attendance, true);
  }

  // Get all attendances for a professor
  async getAttendancesByProfessor(professorId: number): Promise<Attendance[]> {
    const professor = await this.professorRepository.findOne({ where: { id: professorId } });
    if (!professor) throw new NotFoundException('Professor not found');

    return this.attendanceRepository.find({
      where: { professor: { id: professorId } },
      relations: ['qr'],
      order: { createdAt: 'DESC' },
    });
  }
  // AttendancesService
  async getAll(): Promise<Attendance[]> {
  const allAttendances = await this.attendanceRepository.find({
    relations: ['professor', 'qr'], 
    order: { createdAt: 'DESC', entryTime: 'DESC' },
  });

  console.log(`📊 getAll(): Total de asistencias encontradas en BD: ${allAttendances.length}`);
  
  // Log detallado de todas las asistencias antes del filtro
  console.log(`📋 Detalle de todas las asistencias en BD:`);
  allAttendances.forEach((a, idx) => {
    const entryDate = a.entryTime ? new Date(a.entryTime).toISOString() : 'null';
    const exitDate = a.exitTime ? new Date(a.exitTime).toISOString() : 'null';
    const createdDate = a.createdAt ? new Date(a.createdAt).toISOString() : 'null';
    console.log(`   ${idx + 1}. ID: ${a.id}, Profesor: ${a.professor?.name || 'N/A'}, Entry: ${entryDate}, Exit: ${exitDate}, Created: ${createdDate}, MarkedBy: ${a.markedBy}, IsManual: ${a.isManual}, Justification: ${a.justification ? a.justification.substring(0, 30) + '...' : 'null'}`);
  });
  
  const withJustification = allAttendances.filter(a => a.justification && a.justification.trim().length > 0);
  console.log(`📊 getAll(): Asistencias con justificación: ${withJustification.length}`);
  withJustification.forEach(a => {
    console.log(`   - ID: ${a.id}, Profesor: ${a.professor?.name}, Justificación: ${a.justification?.substring(0, 50)}...`);
  });

  // Incluir TODAS las asistencias válidas:
  // 1. Justificaciones válidas (excluyendo solo las automáticas del sistema)
  // 2. Marcados manuales (siempre incluir)
  // 3. Asistencias con entrada/salida real (siempre incluir)
  // 4. Hojas del sistema solo si son faltas (día pasado o hoy con 00:00)

  const filteredAttendances = allAttendances.filter((attendance) => {
    // Si no tiene profesor, excluir
    if (!attendance.professor) {
      return false;
    }

    // SIEMPRE incluir marcados manuales (no del sistema) - PRIMERO para evitar que se filtren
    if (attendance.isManual && attendance.markedBy && attendance.markedBy !== 'Sistema' && attendance.markedBy !== 'sistema') {
      console.log(`   ✅ Incluida (marcado manual): ID ${attendance.id}, Profesor: ${attendance.professor.name}, MarkedBy: ${attendance.markedBy}, EntryTime: ${attendance.entryTime ? new Date(attendance.entryTime).toISOString() : 'null'}`);
      return true;
      }
      
    // SIEMPRE incluir asistencias con entrada/salida real (no 00:00)
          if (attendance.entryTime) {
            const entryDate = new Date(attendance.entryTime);
      const entryHour = entryDate.getHours();
      const entryMinutes = entryDate.getMinutes();
      
      // Si tiene hora real (no 00:00), SIEMPRE incluir
      if (entryHour !== 0 || entryMinutes !== 0) {
        console.log(`   ✅ Incluida (entrada real): ID ${attendance.id}, Profesor: ${attendance.professor.name}, EntryTime: ${attendance.entryTime}`);
        return true;
      }
      
      // Si es 00:00 y es del sistema, solo incluir si es día pasado o hoy (falta)
      if (attendance.markedBy === 'Sistema' || attendance.markedBy === 'sistema') {
              const today = new Date();
        today.setHours(23, 59, 59, 999);
              entryDate.setHours(0, 0, 0, 0);
        if (entryDate.getTime() <= today.getTime()) {
          console.log(`   ✅ Incluida (falta del sistema): ID ${attendance.id}, Profesor: ${attendance.professor.name}`);
            return true;
          }
        return false; // Es futuro, no incluir
      }
      
      // Si es 00:00 pero NO es del sistema, SIEMPRE incluir (marcado manual o justificación)
      // Esto incluye registros del día 30 que fueron marcados manualmente
      console.log(`   ✅ Incluida (entrada 00:00 no sistema): ID ${attendance.id}, Profesor: ${attendance.professor.name}, EntryTime: ${attendance.entryTime}, MarkedBy: ${attendance.markedBy}`);
      return true;
    }

    // SIEMPRE incluir asistencias con salida real (no 00:00)
    if (attendance.exitTime) {
      const exitDate = new Date(attendance.exitTime);
      const exitHour = exitDate.getHours();
      const exitMinutes = exitDate.getMinutes();
      
      // Si tiene hora real (no 00:00), SIEMPRE incluir
      if (exitHour !== 0 || exitMinutes !== 0) {
        console.log(`   ✅ Incluida (salida real): ID ${attendance.id}, Profesor: ${attendance.professor.name}, ExitTime: ${attendance.exitTime}`);
      return true;
    }

      // Si es 00:00 y es del sistema, solo incluir si es día pasado o hoy
      if (attendance.markedBy === 'Sistema' || attendance.markedBy === 'sistema') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        exitDate.setHours(0, 0, 0, 0);
        if (exitDate <= today) {
          console.log(`   ✅ Incluida (salida 00:00 sistema): ID ${attendance.id}, Profesor: ${attendance.professor.name}`);
          return true;
        }
        return false; // Es futuro, no incluir
      }
      
      // Si es 00:00 pero NO es del sistema, incluir
      console.log(`   ✅ Incluida (salida 00:00 no sistema): ID ${attendance.id}, Profesor: ${attendance.professor.name}`);
      return true;
    }

    // SIEMPRE incluir justificaciones válidas (excluyendo solo las automáticas del sistema)
    if (attendance.justification && attendance.justification.trim().length > 0) {
      // Excluir solo las justificaciones automáticas del sistema
      if (attendance.justification.includes('Hoja de asistencia creada automáticamente') && 
          (attendance.markedBy === 'Sistema' || attendance.markedBy === 'sistema')) {
        // Es una hoja del sistema automática, verificar si es falta (sin entrada/salida)
        if (!attendance.entryTime && !attendance.exitTime) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
          if (attendance.createdAt) {
            const createdDate = new Date(attendance.createdAt);
            createdDate.setHours(0, 0, 0, 0);
            if (createdDate <= today) {
              console.log(`   ✅ Incluida (falta sin entrada/salida): ID ${attendance.id}, Profesor: ${attendance.professor.name}`);
              return true;
            }
          }
        }
        // Si tiene entrada/salida pero es del sistema con justificación automática, no incluir
        return false;
      }
      
      // Incluir todas las demás justificaciones (manuales, aprobadas, etc.)
      console.log(`   ✅ Incluida (justificación válida): ID ${attendance.id}, Profesor: ${attendance.professor.name}, Justificación: ${attendance.justification.substring(0, 50)}...`);
      return true;
    }

    // Si no tiene entrada, salida, ni justificación, pero es del sistema, verificar si es falta
    if (attendance.markedBy === 'Sistema' || attendance.markedBy === 'sistema') {
      if (attendance.createdAt) {
        const createdDate = new Date(attendance.createdAt);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        createdDate.setHours(0, 0, 0, 0);
        if (createdDate <= today) {
          console.log(`   ✅ Incluida (falta del sistema sin datos): ID ${attendance.id}, Profesor: ${attendance.professor.name}`);
          return true;
        }
      }
      return false; // Es futuro o no se puede determinar
    }

    // Si llegamos aquí y no es del sistema, incluir por seguridad (puede ser un registro especial)
    console.log(`   ✅ Incluida (por seguridad): ID ${attendance.id}, Profesor: ${attendance.professor.name}, MarkedBy: ${attendance.markedBy}`);
    return true;
  });

  console.log(`📊 getAll(): Total de asistencias después del filtro: ${filteredAttendances.length}`);
  const filteredWithJustification = filteredAttendances.filter(a => a.justification && a.justification.trim().length > 0);
  console.log(`📊 getAll(): Asistencias con justificación después del filtro: ${filteredWithJustification.length}`);
  filteredWithJustification.forEach(a => {
    console.log(`   ✓ Incluida - ID: ${a.id}, Profesor: ${a.professor?.name}, Justificación: ${a.justification?.substring(0, 50)}...`);
  });

  return filteredAttendances;
}

  // Marcar asistencia manualmente (sin QR)
  async markManual(
    professorId: number,
    type: 'entry' | 'exit',
    dateTime: Date,
    justification: string = 'Marcado manual por administrador',
    markedBy: string,
    dni?: string,
    activity?: string,
  ): Promise<Attendance> {
    // Asegurar que se carguen los datos completos del profesor
    const professor = await this.professorRepository.findOne({ 
      where: { id: professorId },
      select: ['id', 'name', 'dni', 'phone', 'address', 'departamentoId', 'horarioId'],
    });
    if (!professor) throw new NotFoundException('Professor not found');

    // Verificar DNI si se proporciona
    if (dni && professor.dni && professor.dni !== dni) {
      throw new BadRequestException('DNI no coincide con el profesor seleccionado');
    }

    // Verificar si el profesor ya tiene una justificación válida para esta fecha
    const dateOnly = new Date(dateTime);
    dateOnly.setHours(0, 0, 0, 0);
    const dayStart = new Date(dateOnly);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dateOnly);
    dayEnd.setHours(23, 59, 59, 999);

    // Buscar todas las asistencias del profesor para esta fecha
    const allAttendancesForDate = await this.attendanceRepository.find({
      where: {
        professor: { id: professorId },
      },
      relations: ['professor', 'qr'],
    });

    // Filtrar por fecha (puede estar en entryTime, exitTime o createdAt)
    const attendancesForDate = allAttendancesForDate.filter(att => {
      let match = false;
      
      if (att.entryTime) {
        const entryDate = new Date(att.entryTime);
        entryDate.setHours(0, 0, 0, 0);
        if (entryDate.getTime() === dayStart.getTime()) {
          match = true;
        }
      }
      
      if (!match && att.exitTime) {
        const exitDate = new Date(att.exitTime);
        exitDate.setHours(0, 0, 0, 0);
        if (exitDate.getTime() === dayStart.getTime()) {
          match = true;
        }
      }
      
      if (!match && att.createdAt) {
        const createdDate = new Date(att.createdAt);
        createdDate.setHours(0, 0, 0, 0);
        if (createdDate.getTime() === dayStart.getTime()) {
          match = true;
        }
      }
      
      return match;
    });

    // Verificar si alguna de estas asistencias tiene una justificación válida
    for (const att of attendancesForDate) {
      // Verificar si tiene una justificación válida (no es del sistema ni marcado manual)
      const hasValidJustification = att.justification && 
        att.justification.trim().length > 0 &&
        !att.justification.includes('Hoja de asistencia creada automáticamente') &&
        att.justification !== 'Marcado manual por administrador';
      
      if (hasValidJustification) {
        // Verificar si NO tiene asistencia real (entryTime y exitTime no tienen horas reales)
        const hasRealEntry = att.entryTime && 
          (new Date(att.entryTime).getHours() !== 0 || 
           new Date(att.entryTime).getMinutes() !== 0);
        
        const hasRealExit = att.exitTime && 
          (new Date(att.exitTime).getHours() !== 0 || 
           new Date(att.exitTime).getMinutes() !== 0);
        
        // Si tiene justificación válida y NO tiene asistencia real, bloquear el marcado manual
        if (!hasRealEntry && !hasRealExit) {
          throw new BadRequestException('No se puede marcar asistencia manualmente cuando el profesor ya tiene una justificación válida para esta fecha');
        }
      }
    }

    // Verificar si es tardanza (solo para entradas)
    const isLate = type === 'entry' ? await this.checkIfLate(professor, dateTime) : false;

    // Verificar si ya hay asistencia real (marcada por QR) para ese día
    // PERO: Si es marcado de salida, permitir si solo hay entrada por QR (sin salida)
    
    if (type === 'entry') {
      // Para entrada: solo bloquear si hay asistencia marcada por QR (no manual)
      // Permitir actualizar marcados manuales existentes
      const todayStart = new Date(dateTime);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(dateTime);
      todayEnd.setHours(23, 59, 59, 999);
      
      // Buscar asistencias marcadas por QR (no manuales) del día
      const qrAttendances = await this.attendanceRepository.find({
        where: {
          professor: { id: professorId },
          entryTime: Between(todayStart, todayEnd),
          markedBy: 'QR',
        },
      });
      
      // Si hay asistencia por QR con hora real, bloquear
      if (qrAttendances.length > 0) {
        const hasRealQR = qrAttendances.some(att => {
          if (!att.entryTime) return false;
          const entryDate = new Date(att.entryTime);
          const entryHour = entryDate.getHours();
          const entryMinutes = entryDate.getMinutes();
          // Entrada real si no es 00:00
          return !(entryHour === 0 && entryMinutes === 0);
        });
        
        if (hasRealQR) {
          throw new BadRequestException('No se puede marcar manualmente una entrada en un día en el que el profesor ya marcó su asistencia por QR');
        }
      }
      // Si no hay asistencia por QR, permitir marcar manualmente (incluso si hay marcado manual previo, para actualizarlo)
    } else {
      // Para salida: bloquear si hay entrada por QR (el profesor ya marcó su asistencia)
      // Verificar si hay entrada por QR del día
      const todayStart = new Date(dateTime);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(dateTime);
      todayEnd.setHours(23, 59, 59, 999);
      
      const qrAttendances = await this.attendanceRepository.find({
        where: {
          professor: { id: professorId },
          entryTime: Between(todayStart, todayEnd),
          markedBy: 'QR',
        },
      });
      
      // Si hay asistencia por QR con entrada real, bloquear cualquier marcado manual
      if (qrAttendances.length > 0) {
        const hasRealEntry = qrAttendances.some(att => {
          if (!att.entryTime) return false;
          const entryDate = new Date(att.entryTime);
          const entryHour = entryDate.getHours();
          const entryMinutes = entryDate.getMinutes();
          // Entrada real si no es 00:00
          return !(entryHour === 0 && entryMinutes === 0);
        });
        
        if (hasRealEntry) {
          throw new BadRequestException('No se puede marcar manualmente una salida en un día en el que el profesor ya marcó su asistencia por QR');
        }
        
        // Si hay salida por QR, también bloquear
        const hasExit = qrAttendances.some(att => {
          if (!att.exitTime) return false;
          const exitDate = new Date(att.exitTime);
          const exitHour = exitDate.getHours();
          const exitMinutes = exitDate.getMinutes();
          // Salida real si no es 00:00
          return !(exitHour === 0 && exitMinutes === 0);
        });
        
        if (hasExit) {
          throw new BadRequestException('El profesor ya tiene una salida registrada por QR para este día');
        }
      }
    }

    // Para marcados manuales, no usar QR (dejar como null)
    // Esto evita que aparezca "MANUAL_MARK" en el historial de QR
    const manualQr = null;

    if (type === 'entry') {
      // Verificar si ya tiene entrada hoy - buscar por cualquier campo de fecha relacionado
      const todayStart = new Date(dateTime);
      todayStart.setHours(0, 0, 0, 0);

      const todayEnd = new Date(dateTime);
      todayEnd.setHours(23, 59, 59, 999);

      // Buscar primero por entryTime
      let existing = await this.attendanceRepository.findOne({
        where: {
          professor: { id: professorId },
          entryTime: Between(todayStart, todayEnd),
        },
        relations: ['professor', 'qr'],
      });

      // Si no se encuentra por entryTime, buscar por createdAt para encontrar justificaciones o registros sin entrada
      if (!existing) {
        existing = await this.attendanceRepository.findOne({
          where: {
            professor: { id: professorId },
            createdAt: Between(todayStart, todayEnd),
          },
          relations: ['professor', 'qr'],
        });
      }

      // Si aún no se encuentra, buscar todas las asistencias del profesor y filtrar por fecha
      if (!existing) {
        const allAttendances = await this.attendanceRepository.find({
          where: {
            professor: { id: professorId },
          },
          relations: ['professor', 'qr'],
          order: { createdAt: 'DESC' },
        });

        // Buscar por cualquier campo de fecha que coincida con el día
        for (const att of allAttendances) {
          let match = false;
          
          if (att.entryTime) {
            const entryDate = new Date(att.entryTime);
            entryDate.setHours(0, 0, 0, 0);
            if (entryDate.getTime() === todayStart.getTime()) {
              match = true;
            }
          }
          
          if (!match && att.exitTime) {
            const exitDate = new Date(att.exitTime);
            exitDate.setHours(0, 0, 0, 0);
            if (exitDate.getTime() === todayStart.getTime()) {
              match = true;
            }
          }
          
          if (!match && att.createdAt) {
            const createdDate = new Date(att.createdAt);
            createdDate.setHours(0, 0, 0, 0);
            if (createdDate.getTime() === todayStart.getTime()) {
              match = true;
            }
          }
          
          if (match) {
            existing = att;
            console.log(`✅ Registro existente encontrado para marcado manual (ID: ${att.id})`);
            break;
          }
        }
      }

      // Verificar si es tardanza
      const isLate = await this.checkIfLate(professor, dateTime);

      // Actualizar entrada existente si es del sistema o si es un marcado manual previo
      // Permitir actualizar marcados manuales para corregir errores
      if (existing) {
        // Solo rechazar si es una asistencia por QR con hora real
        if (existing.entryTime && existing.markedBy === 'QR') {
        const entryDate = new Date(existing.entryTime);
        const entryHour = entryDate.getHours();
        const entryMinutes = entryDate.getMinutes();
          if (entryHour !== 0 || entryMinutes !== 0) {
          throw new BadRequestException('El profesor ya tiene una entrada registrada por QR para este día');
          }
        }
        
        // Permitir actualizar si es del sistema, marcado manual previo, o QR a las 00:00
        // Actualizar entrada existente
        existing.entryTime = dateTime;
        existing.isLate = isLate;
        existing.activity = activity || existing.activity;
        existing.isManual = true;
        existing.markedBy = markedBy;
        existing.justification = justification;
        existing.qr = null; // Marcados manuales no tienen QR
        const saved = await this.attendanceRepository.save(existing);
        await this.saveReportAfterAttendance(saved);
        
        // Retornar con relaciones cargadas
        const result = await this.attendanceRepository.findOne({
          where: { id: saved.id },
          relations: ['professor', 'qr'],
        });
        if (!result) {
          throw new NotFoundException('Error al recuperar la asistencia guardada');
        }
        return result;
      }

      // Crear nueva entrada
      const attendance = this.attendanceRepository.create({
        professor,
        qr: null, // Marcados manuales no tienen QR
        entryTime: dateTime,
        activity: activity || null,
        isManual: true,
        markedBy,
        justification,
        isLate: isLate,
      });

      // Usar saveAttendanceWithEvents para enviar notificaciones
      return await this.saveAttendanceWithEvents(attendance, false);
    } else {
      // Marcar salida
      const todayStart = new Date(dateTime);
      todayStart.setHours(0, 0, 0, 0);

      const todayEnd = new Date(dateTime);
      todayEnd.setHours(23, 59, 59, 999);

      // Buscar todas las asistencias del día (incluyendo las marcadas por QR)
      const allDayAttendances = await this.attendanceRepository.find({
        where: {
          professor: { id: professorId },
          entryTime: Between(todayStart, todayEnd),
        },
        relations: ['qr'],
      });

      // Verificar si ya tiene salida real
      for (const att of allDayAttendances) {
        if (att.exitTime) {
          const exitDate = new Date(att.exitTime);
          const exitHour = exitDate.getHours();
          const exitMinutes = exitDate.getMinutes();
          // Si tiene salida real (no 00:00) y no es del sistema, rechazar
          if ((exitHour !== 0 || exitMinutes !== 0) && att.markedBy !== 'Sistema') {
            throw new BadRequestException('El profesor ya tiene una salida registrada para este día');
          }
        }
      }

      // Buscar asistencia sin salida para actualizar (puede ser manual o por QR)
      const attendance = allDayAttendances.find(att => !att.exitTime || 
        (att.exitTime && new Date(att.exitTime).getHours() === 0 && new Date(att.exitTime).getMinutes() === 0));

      if (!attendance) {
        // Si no hay entrada, crear entrada y salida
        const isLateForExit = await this.checkIfLate(professor, dateTime);
        const newAttendance = this.attendanceRepository.create({
          professor,
          qr: null, // Marcados manuales no tienen QR
          entryTime: dateTime, // Usar la misma hora para entrada
          exitTime: dateTime,
          activity: activity || null,
          isManual: true,
          markedBy,
          justification,
          isLate: isLateForExit,
        });
        // Usar saveAttendanceWithEvents para enviar notificaciones
        return await this.saveAttendanceWithEvents(newAttendance, false);
      }

      // Actualizar salida existente (puede ser asistencia por QR o manual)
      attendance.exitTime = dateTime;
      // Si la actividad se proporciona, actualizarla
      if (activity) {
        attendance.activity = activity;
      }
      // Si es una asistencia por QR, mantener el QR original pero marcar como manual la salida
      // Si no tiene QR, dejarlo como null (marcados manuales no tienen QR)
      // No asignar QR manual para evitar que aparezca en el historial
      // Marcar que la salida fue hecha manualmente (pero mantener el markedBy original si es por QR)
      // Solo cambiar markedBy si no es por QR
      if (attendance.markedBy !== 'QR') {
        attendance.isManual = true;
        attendance.markedBy = markedBy;
      }
      // Actualizar justificación si se proporciona
      if (justification) {
        attendance.justification = justification;
      }

      const saved = await this.attendanceRepository.save(attendance);
      await this.saveReportAfterAttendance(saved);
      
      // Retornar con relaciones cargadas
      const result = await this.attendanceRepository.findOne({
        where: { id: saved.id },
        relations: ['professor', 'qr'],
      });
      if (!result) {
        throw new NotFoundException('Error al recuperar la asistencia guardada');
      }
      return result;
    }
  }

  // Crear hojas de asistencia masivas para un mes
  async createMonthlySheets(
    year: number,
    month: number,
    professorIds?: number[],
  ): Promise<{ created: number; skipped: number; errors: string[] }> {
    const errors: string[] = [];
    let created = 0;
    let skipped = 0;

    // Validar mes y año
    if (month < 1 || month > 12) {
      throw new BadRequestException('Mes inválido. Debe estar entre 1 y 12');
    }

    if (year < 2000 || year > 2100) {
      throw new BadRequestException('Año inválido');
    }

    // Obtener profesores
    let professors: Professor[];
    if (professorIds && professorIds.length > 0) {
      professors = await this.professorRepository.find({
        where: professorIds.map(id => ({ id })),
      });
      if (professors.length === 0) {
        throw new NotFoundException('No se encontraron profesores con los IDs proporcionados');
      }
    } else {
      // Si no se especifican profesores, crear para todos
      professors = await this.professorRepository.find();
      if (professors.length === 0) {
        throw new NotFoundException('No hay profesores registrados');
      }
    }

    // Obtener o crear QR manual
    let manualQr = await this.qrRepository.findOne({ where: { token: 'MANUAL_MARK' } });
    if (!manualQr) {
      manualQr = this.qrRepository.create({
        token: 'MANUAL_MARK',
        activo: true,
      });
      manualQr = await this.qrRepository.save(manualQr);
    }

    // Calcular días del mes
    const daysInMonth = new Date(year, month, 0).getDate();
    const attendancesToCreate: Attendance[] = [];

    // Iterar sobre cada profesor
    for (const professor of professors) {
      // Iterar sobre cada día del mes
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month - 1, day);
        
        // Omitir fines de semana (sábado = 6, domingo = 0)
        const dayOfWeek = date.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          continue; // Saltar sábados y domingos
        }

        // Verificar si ya existe una asistencia para este día
        const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0);
        const dayEnd = new Date(year, month - 1, day, 23, 59, 59, 999);

        // Buscar TODAS las asistencias existentes para este día y profesor
        // Esto previene duplicados
        const existingAttendances = await this.attendanceRepository.find({
          where: {
            professor: { id: professor.id },
            entryTime: Between(dayStart, dayEnd),
          },
        });

        // Si ya existe alguna asistencia para este día, saltar
        if (existingAttendances && existingAttendances.length > 0) {
          skipped++;
          console.log(`Omitiendo día ${day}/${month}/${year} para profesor ${professor.name} - ya existe ${existingAttendances.length} asistencia(s)`);
          continue;
        }

        // Crear asistencia con entryTime a las 00:00:00 como marcador de hoja creada
        // Cuando el profesor marque su entrada real, se actualizará el entryTime
        // Usamos una hora especial (00:00:00) para identificar hojas creadas por el sistema
        const attendance = this.attendanceRepository.create({
          professor,
          qr: manualQr,
          entryTime: dayStart, // Usar inicio del día como marcador
          exitTime: null, // Sin salida
          isManual: true,
          markedBy: 'Sistema',
          justification: `Hoja de asistencia creada automáticamente para ${date.toLocaleDateString('es-ES')}. Se actualizará cuando el profesor marque su entrada.`,
        });

        attendancesToCreate.push(attendance);
      }
    }

    // Guardar todas las asistencias en lotes para evitar problemas de memoria
    if (attendancesToCreate.length > 0) {
      try {
        // Guardar en lotes de 100 para mejor rendimiento
        const batchSize = 100;
        for (let i = 0; i < attendancesToCreate.length; i += batchSize) {
          const batch = attendancesToCreate.slice(i, i + batchSize);
          await this.attendanceRepository.save(batch);
        }
        created = attendancesToCreate.length;
        console.log(`Se crearon ${created} hojas de asistencia para ${professors.length} profesor(es)`);
      } catch (error) {
        console.error('Error al guardar asistencias:', error);
        errors.push(`Error al guardar asistencias: ${error.message}`);
        // Intentar guardar individualmente para ver cuáles fallan
        for (const attendance of attendancesToCreate) {
          try {
            await this.attendanceRepository.save(attendance);
            created++;
          } catch (individualError) {
            errors.push(`Error al guardar asistencia para profesor ${attendance.professor.id} en ${attendance.entryTime}: ${individualError.message}`);
          }
        }
      }
    }

    return { created, skipped, errors };
  }

  // Eliminar asistencias duplicadas
  async removeDuplicates(): Promise<{ removed: number; kept: number }> {
    const allAttendances = await this.attendanceRepository.find({
      relations: ['professor', 'qr'],
      order: { createdAt: 'DESC' },
    });

    const uniqueMap = new Map<string, Attendance>();
    const toDelete: Attendance[] = [];

    for (const attendance of allAttendances) {
      if (!attendance.professor) continue;

      // Determinar la fecha del registro (entryTime, exitTime, o createdAt)
      let recordDate: Date;
      if (attendance.entryTime) {
        recordDate = new Date(attendance.entryTime);
      } else if (attendance.exitTime) {
        recordDate = new Date(attendance.exitTime);
      } else if (attendance.createdAt) {
        recordDate = new Date(attendance.createdAt);
      } else {
        continue; // Saltar si no tiene ninguna fecha
      }
      
      recordDate.setHours(0, 0, 0, 0);
      
      // Crear clave única: profesorId + fecha (sin hora)
      const key = `${attendance.professor.id}_${recordDate.getTime()}`;
      
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, attendance);
      } else {
        const existing = uniqueMap.get(key)!;
        
        // Decidir cuál mantener según prioridad:
        // 1. Preferir asistencias con entrada/salida real (no solo justificación)
        // 2. Preferir la que NO es hoja del sistema
        // 3. Si ambas son del mismo tipo, mantener la más reciente
        
        const attendanceHasRealTime = (attendance.entryTime && 
          (new Date(attendance.entryTime).getHours() !== 0 || 
           new Date(attendance.entryTime).getMinutes() !== 0)) ||
          (attendance.exitTime && 
          (new Date(attendance.exitTime).getHours() !== 0 || 
           new Date(attendance.exitTime).getMinutes() !== 0));
        
        const existingHasRealTime = (existing.entryTime && 
          (new Date(existing.entryTime).getHours() !== 0 || 
           new Date(existing.entryTime).getMinutes() !== 0)) ||
          (existing.exitTime && 
          (new Date(existing.exitTime).getHours() !== 0 || 
           new Date(existing.exitTime).getMinutes() !== 0));
        
        // Si una tiene hora real y la otra no, mantener la que tiene hora real
        if (attendanceHasRealTime && !existingHasRealTime) {
          toDelete.push(existing);
          uniqueMap.set(key, attendance);
        } else if (!attendanceHasRealTime && existingHasRealTime) {
          toDelete.push(attendance);
        } else {
          // Ambas tienen o no tienen hora real, decidir por otros criterios
        if (attendance.markedBy === 'Sistema' && existing.markedBy !== 'Sistema') {
          // Mantener la existente (no es hoja del sistema)
          toDelete.push(attendance);
        } else if (attendance.markedBy !== 'Sistema' && existing.markedBy === 'Sistema') {
          // Reemplazar: eliminar la existente (hoja del sistema) y mantener esta
          toDelete.push(existing);
          uniqueMap.set(key, attendance);
        } else {
          // Ambas son del mismo tipo, mantener la más reciente
          if (attendance.id > existing.id) {
            toDelete.push(existing);
            uniqueMap.set(key, attendance);
          } else {
            toDelete.push(attendance);
            }
          }
        }
      }
    }

    // Eliminar duplicados
    if (toDelete.length > 0) {
      await this.attendanceRepository.remove(toDelete);
      console.log(`Se eliminaron ${toDelete.length} asistencias duplicadas`);
      console.log(`IDs eliminados: ${toDelete.map(a => a.id).join(', ')}`);
    }

    return { removed: toDelete.length, kept: uniqueMap.size };
  }

  // Eliminar todas las asistencias
  async deleteAllAttendances(): Promise<{ deleted: number }> {
    const allAttendances = await this.attendanceRepository.find();
    const count = allAttendances.length;
    
    if (count > 0) {
      await this.attendanceRepository.remove(allAttendances);
      console.log(`Se eliminaron ${count} asistencias de la base de datos`);
    }
    
    return { deleted: count };
  }

  // Método auxiliar para verificar si hay asistencia real (no del sistema) para un día
  async hasRealAttendance(professorId: number, date: Date): Promise<boolean> {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    // Buscar todas las asistencias del día
    const dayAttendances = await this.attendanceRepository.find({
      where: {
        professor: { id: professorId },
        entryTime: Between(dayStart, dayEnd),
      },
      relations: ['qr'],
    });

    // Verificar si hay alguna asistencia real (no del sistema y no manual)
    // Para justificaciones, solo bloquear si hay asistencias por QR (reales del profesor)
    // Permitir justificar si solo hay asistencias marcadas manualmente o del sistema
    for (const att of dayAttendances) {
      // Solo considerar como "asistencia real" las marcadas por QR (no manuales ni del sistema)
      if (att.markedBy === 'QR' && att.entryTime) {
        const entryDate = new Date(att.entryTime);
        const entryHour = entryDate.getHours();
        const entryMinutes = entryDate.getMinutes();
        // Si tiene hora real (no 00:00), es asistencia real por QR
        if (entryHour !== 0 || entryMinutes !== 0) {
          return true;
        }
      }
      // Si tiene salida marcada por QR (no 00:00), también es asistencia real
      if (att.markedBy === 'QR' && att.exitTime) {
        const exitDate = new Date(att.exitTime);
        const exitHour = exitDate.getHours();
        const exitMinutes = exitDate.getMinutes();
        if (exitHour !== 0 || exitMinutes !== 0) {
          return true;
        }
      }
    }

    return false;
  }

  // Método auxiliar para verificar si hay asistencia marcada por QR (no manual) para un día
  async hasQRAttendance(professorId: number, date: Date): Promise<boolean> {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    // Buscar asistencias marcadas por QR del día
    const qrAttendances = await this.attendanceRepository.find({
      where: {
        professor: { id: professorId },
        entryTime: Between(dayStart, dayEnd),
        markedBy: 'QR',
      },
      relations: ['qr'],
    });

    // Verificar si hay alguna asistencia por QR con hora real
    for (const att of qrAttendances) {
      if (att.entryTime) {
        const entryDate = new Date(att.entryTime);
        const entryHour = entryDate.getHours();
        const entryMinutes = entryDate.getMinutes();
        // Si tiene hora real (no 00:00), es asistencia por QR real
        if (entryHour !== 0 || entryMinutes !== 0) {
          return true;
        }
      }
      // Si tiene salida real (no 00:00), también es asistencia por QR real
      if (att.exitTime) {
        const exitDate = new Date(att.exitTime);
        const exitHour = exitDate.getHours();
        const exitMinutes = exitDate.getMinutes();
        if (exitHour !== 0 || exitMinutes !== 0) {
          return true;
        }
      }
    }

    return false;
  }

  // Justificar ausencia o retraso (profesor o admin)
  async justifyAttendance(
    professorId: number,
    date: Date,
    type: 'absence' | 'delay' | 'early_exit',
    justification: string,
    markedBy?: string, // Opcional: nombre de quien justifica (si es admin)
  ): Promise<Attendance> {
    console.log(`🔵 justifyAttendance llamado:`);
    console.log(`   professorId: ${professorId}`);
    console.log(`   date: ${date.toISOString()}`);
    console.log(`   type: ${type}`);
    console.log(`   justification: ${justification.substring(0, 50)}...`);
    console.log(`   markedBy: ${markedBy}`);
    // Verificar que el profesor existe y cargar datos completos
    const professor = await this.professorRepository.findOne({ 
      where: { id: professorId },
      select: ['id', 'name', 'dni', 'phone', 'address', 'departamentoId', 'horarioId'],
    });
    if (!professor) {
      throw new NotFoundException('Professor not found');
    }

    // Verificar que la fecha sea pasada (no futura)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const justificationDate = new Date(date);
    justificationDate.setHours(0, 0, 0, 0);

    if (justificationDate > today) {
      throw new BadRequestException('No se puede justificar una fecha futura');
    }

    // Validar que la justificación tenga al menos 10 caracteres
    if (!justification || justification.trim().length < 10) {
      throw new BadRequestException('La justificación debe tener al menos 10 caracteres');
    }

    // Verificar si ya hay asistencia real marcada por QR (no manual)
    // NO permitir justificar si hay asistencia por QR, sin importar quién intente justificar
    // Esto previene que se justifique o marque manualmente cuando el profesor ya marcó su asistencia
    const hasQRAttendance = await this.hasQRAttendance(professorId, justificationDate);
    if (hasQRAttendance) {
      throw new BadRequestException('No se puede justificar un día en el que el profesor ya marcó su asistencia por QR');
    }

    // Definir rango del día a justificar
    const dayStart = new Date(justificationDate);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(justificationDate);
    dayEnd.setHours(23, 59, 59, 999);

    console.log(`   🔍 Buscando registro existente para profesor ${professorId} en fecha ${justificationDate.toISOString()}`);
    
    // Buscar TODAS las asistencias del profesor y filtrar por fecha para asegurar que encontramos cualquier registro existente
    // Esto es más robusto que buscar solo por entryTime o createdAt
    const allProfessorAttendances = await this.attendanceRepository.find({
        where: {
          professor: { id: professorId },
        },
        relations: ['qr', 'professor'],
        order: { createdAt: 'DESC' },
      });

    console.log(`   📊 Total de asistencias del profesor: ${allProfessorAttendances.length}`);

    let attendance: Attendance | null = null;

      // Buscar registros que puedan estar relacionados con ese día
    for (const att of allProfessorAttendances) {
        let match = false;
        
        // Verificar por entryTime
        if (att.entryTime) {
          const entryDate = new Date(att.entryTime);
          entryDate.setHours(0, 0, 0, 0);
          if (entryDate.getTime() === justificationDate.getTime()) {
            match = true;
          console.log(`   ✅ Coincidencia por entryTime: ID ${att.id}, fecha ${entryDate.toISOString()}, markedBy: ${att.markedBy}`);
          }
        }
        
      // Verificar por exitTime si no coincide por entryTime
        if (!match && att.exitTime) {
          const exitDate = new Date(att.exitTime);
          exitDate.setHours(0, 0, 0, 0);
          if (exitDate.getTime() === justificationDate.getTime()) {
            match = true;
          console.log(`   ✅ Coincidencia por exitTime: ID ${att.id}, fecha ${exitDate.toISOString()}, markedBy: ${att.markedBy}`);
        }
      }
      
      // Verificar por createdAt si no hay entryTime ni exitTime (para ausencias justificadas previas)
      if (!match && att.createdAt && !att.entryTime && !att.exitTime) {
        const createdDate = new Date(att.createdAt);
        createdDate.setHours(0, 0, 0, 0);
        if (createdDate.getTime() === justificationDate.getTime()) {
          match = true;
          console.log(`   ✅ Coincidencia por createdAt (sin entry/exit): ID ${att.id}, fecha ${createdDate.toISOString()}, markedBy: ${att.markedBy}`);
          }
        }
        
        if (match) {
        // Si encontramos múltiples coincidencias, preferir la más reciente (ya están ordenadas por createdAt DESC)
        if (!attendance || (attendance && att.createdAt > attendance.createdAt)) {
          attendance = att;
          console.log(`   ✅ Registro encontrado para esta fecha (ID: ${att.id})`);
        }
        }
      }
      
      if (!attendance) {
      console.log(`   ⚠️ No se encontró ningún registro existente para esta fecha, se creará uno nuevo`);
    } else {
      console.log(`   ✅ Registro existente encontrado (ID: ${attendance.id}), se actualizará en lugar de crear uno nuevo`);
    }

    // Determinar quién justifica: si se proporciona markedBy (admin), usar ese nombre, si no, usar el nombre del profesor
    const whoJustified = markedBy || professor.name || 'Profesor';
    
    if (attendance) {
      console.log(`   ✅ Registro de asistencia encontrado (ID: ${attendance.id}), actualizando...`);
      console.log(`   Estado actual - EntryTime: ${attendance.entryTime}, ExitTime: ${attendance.exitTime}, MarkedBy: ${attendance.markedBy}, Justification: ${attendance.justification}`);
      
      // Si existe, actualizar la justificación
      // PERO si ya tiene asistencia marcada por QR (entryTime y exitTime reales), mantener esos datos
      // y solo agregar la justificación como información adicional
      const hasRealAttendance = attendance.entryTime && 
                                attendance.exitTime && 
                                attendance.markedBy === 'QR';
      
      if (hasRealAttendance && type === 'absence') {
        // Si hay asistencia real por QR pero se está justificando como ausencia,
        // esto no tiene sentido, pero por ahora solo agregamos la justificación
        console.log(`   ⚠️ ATENCIÓN: Se está justificando una ausencia pero el profesor ya marcó asistencia por QR ese día`);
      }
      
      // Actualizar la justificación SIEMPRE
      attendance.justification = justification;
      attendance.isManual = true;
      attendance.markedBy = whoJustified;
      
      // Solo remover QR si es una ausencia completa (no si es retraso o salida temprana)
      if (type === 'absence') {
        // Las justificaciones de ausencia no requieren QR
        attendance.qr = null;
      }
      // Para retrasos y salidas tempranas, mantener el QR si existe
      
      // Si es una ausencia completa, asegurar que entryTime y exitTime sean null
      if (type === 'absence') {
        // Para ausencias justificadas, establecer entryTime a 00:00 del día para que saveReport funcione
        const dayStartDate = new Date(justificationDate);
        dayStartDate.setHours(0, 0, 0, 0);
        attendance.entryTime = dayStartDate;
        attendance.exitTime = null;
        attendance.activity = null; // No hay actividad en ausencias
      } else if (type === 'delay') {
        // Para retrasos, mantener la entrada pero puede no tener salida
        if (!attendance.entryTime || (attendance.entryTime && new Date(attendance.entryTime).getHours() === 0 && new Date(attendance.entryTime).getMinutes() === 0)) {
          attendance.entryTime = dayStart;
        }
        // No modificar exitTime en retrasos si ya existe
      } else if (type === 'early_exit') {
        // Para salida temprana, mantener la salida
        if (!attendance.exitTime || (attendance.exitTime && new Date(attendance.exitTime).getHours() === 0 && new Date(attendance.exitTime).getMinutes() === 0)) {
          attendance.exitTime = dayEnd;
        }
        // No modificar entryTime en salidas tempranas si ya existe
      }
      
      console.log(`   Guardando asistencia actualizada...`);
      const saved = await this.attendanceRepository.save(attendance);
      console.log(`   ✅ Asistencia guardada. ID: ${saved.id}, Justificación: ${saved.justification ? saved.justification.substring(0, 50) + '...' : 'NO HAY JUSTIFICACIÓN'}`);
      await this.saveReportAfterAttendance(saved);
      console.log(`   ✅ Reporte actualizado después de guardar asistencia`);
      
      // Emitir eventos WebSocket para actualizar la tabla en tiempo real
      this.eventsGateway.emitAttendanceUpdated(saved);
      this.eventsGateway.emitAttendancesListUpdate();
      console.log(`   ✅ Eventos WebSocket emitidos para actualizar tabla de asistencias`);
      
      // Retornar con relaciones cargadas para asegurar que el frontend reciba los datos del profesor
      const result = await this.attendanceRepository.findOne({
        where: { id: saved.id },
        relations: ['professor', 'qr'],
      });
      if (!result) {
        throw new NotFoundException('Error al recuperar la asistencia guardada');
      }
      console.log(`   ✅ Asistencia recuperada. Justificación final: ${result.justification ? result.justification.substring(0, 50) + '...' : 'NO HAY'}`);
      return result;
    } else {
      console.log(`   ⚠️ No se encontró registro existente, creando nuevo registro...`);
      // Si no existe registro, crear uno nuevo para la justificación
      // Para ausencias justificadas, usar la fecha del día como entryTime pero a las 00:00
      // para que saveReport pueda determinar correctamente la fecha
      // Alternativamente, usar la fecha proporcionada como referencia
      const referenceTime = type === 'absence' 
        ? new Date(justificationDate) // Usar la fecha de la justificación como referencia
        : (type === 'delay' ? dayStart : (type === 'early_exit' ? dayStart : dayStart));

      attendance = this.attendanceRepository.create({
        professor,
        qr: null, // Las justificaciones no requieren QR, solo se hacen desde el panel admin
        // Para ausencias justificadas, establecer entryTime a la fecha pero sin hora
        // para que saveReport pueda determinar la fecha correctamente
        entryTime: type === 'absence' 
          ? new Date(justificationDate.getFullYear(), justificationDate.getMonth(), justificationDate.getDate(), 0, 0, 0, 0)
          : (type === 'delay' ? dayStart : (type === 'early_exit' ? dayStart : dayStart)), 
        exitTime: type === 'absence' ? null : (type === 'early_exit' ? dayEnd : null),
        activity: null, // Las justificaciones no tienen actividad
        isManual: true,
        markedBy: whoJustified,
        justification: justification,
      });

      console.log(`   Guardando nueva asistencia...`);
      const saved = await this.attendanceRepository.save(attendance);
      console.log(`   ✅ Nueva asistencia guardada. ID: ${saved.id}, Justificación: ${saved.justification ? saved.justification.substring(0, 50) + '...' : 'NO HAY JUSTIFICACIÓN'}`);
      await this.saveReportAfterAttendance(saved);
      console.log(`   ✅ Reporte creado después de guardar asistencia`);
      
      // Emitir eventos WebSocket para actualizar la tabla en tiempo real
      this.eventsGateway.emitAttendanceCreated(saved);
      this.eventsGateway.emitAttendancesListUpdate();
      console.log(`   ✅ Eventos WebSocket emitidos para actualizar tabla de asistencias`);
      
      // Retornar con relaciones cargadas
      const result = await this.attendanceRepository.findOne({
        where: { id: saved.id },
        relations: ['professor', 'qr'],
      });
      if (!result) {
        throw new NotFoundException('Error al recuperar la asistencia guardada');
      }
      console.log(`   ✅ Asistencia recuperada. Justificación final: ${result.justification ? result.justification.substring(0, 50) + '...' : 'NO HAY'}`);
      return result;
    }
  }

  // Obtener días sin justificar de un profesor
  async getUnjustifiedDays(professorId: number): Promise<{ date: string; hasAttendance: boolean; hasJustification: boolean }[]> {
    // Verificar que el profesor existe
    const professor = await this.professorRepository.findOne({ where: { id: professorId } });
    if (!professor) {
      throw new NotFoundException('Professor not found');
    }

    // Obtener todas las asistencias del profesor
    const allAttendances = await this.attendanceRepository.find({
      where: {
        professor: { id: professorId },
      },
      order: { entryTime: 'DESC' },
    });

    // Crear un mapa de fechas con su estado
    const dateMap = new Map<string, { hasAttendance: boolean; hasJustification: boolean }>();

    // Procesar asistencias existentes
    for (const attendance of allAttendances) {
      if (attendance.entryTime) {
        const date = new Date(attendance.entryTime);
        date.setHours(0, 0, 0, 0);
        const dateKey = date.toISOString().split('T')[0];

        const hasRealAttendance = attendance.markedBy !== 'Sistema' || 
          (attendance.entryTime && new Date(attendance.entryTime).getHours() !== 0);
        
        const hasJustification = !!attendance.justification && 
          attendance.justification.trim().length > 0 &&
          !attendance.justification.includes('Hoja de asistencia creada automáticamente');

        dateMap.set(dateKey, {
          hasAttendance: hasRealAttendance,
          hasJustification: hasJustification,
        });
      }
    }

    // Obtener los últimos 30 días para verificar
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const unjustifiedDays: { date: string; hasAttendance: boolean; hasJustification: boolean }[] = [];
    
    for (let d = new Date(thirtyDaysAgo); d <= today; d.setDate(d.getDate() + 1)) {
      const dateKey = d.toISOString().split('T')[0];
      const status = dateMap.get(dateKey);

      // Si no hay registro o no tiene justificación, agregarlo
      if (!status || !status.hasJustification) {
        unjustifiedDays.push({
          date: dateKey,
          hasAttendance: status?.hasAttendance || false,
          hasJustification: false,
        });
      }
    }

    return unjustifiedDays;
  }

  // Obtener asistencias por mes y año
  async getByMonthYear(year: number, month: number): Promise<Attendance[]> {
    // Validar mes
    if (month < 1 || month > 12) {
      throw new BadRequestException('Mes inválido. Debe estar entre 1 y 12');
    }

    // Crear fechas de inicio y fin del mes
    const startDate = new Date(year, month - 1, 1);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    // Filtrar por fecha usando TypeORM QueryBuilder
    const qb = this.attendanceRepository
      .createQueryBuilder('attendance')
      .leftJoinAndSelect('attendance.professor', 'professor')
      .leftJoinAndSelect('attendance.qr', 'qr')
      .where(
        '(attendance.entryTime >= :startDate AND attendance.entryTime <= :endDate) OR (attendance.exitTime >= :startDate AND attendance.exitTime <= :endDate)',
        { startDate, endDate },
      )
      .orderBy('attendance.entryTime', 'ASC');

    return qb.getMany();
  }

  // Obtener asistencias por rango de fechas
  async getByDateRange(
    startDate: Date,
    endDate: Date,
    professorId?: number,
  ): Promise<Attendance[]> {
    const qb = this.attendanceRepository
      .createQueryBuilder('attendance')
      .leftJoinAndSelect('attendance.professor', 'professor')
      .leftJoinAndSelect('attendance.qr', 'qr')
      .where(
        '(attendance.entryTime >= :startDate AND attendance.entryTime <= :endDate) OR (attendance.exitTime >= :startDate AND attendance.exitTime <= :endDate)',
        { startDate, endDate },
      );

    if (professorId) {
      qb.andWhere('professor.id = :professorId', { professorId });
    }

    qb.orderBy('attendance.entryTime', 'ASC');

    return qb.getMany();
  }

  // Obtener estadísticas mensuales
  async getMonthlyStats(
    year: number,
    month: number,
  ): Promise<{
    totalAsistencias: number;
    totalProfesores: number;
    asistenciasCompletas: number;
    asistenciasIncompletas: number;
    ausencias: number;
    justificados: number;
    retrasos: number;
    salidasTempranas: number;
    porProfesor: Array<{
      profesorId: number;
      nombre: string;
      totalDias: number;
      asistencias: number;
      ausencias: number;
      retrasos: number;
    }>;
  }> {
    const attendances = await this.getByMonthYear(year, month);

    // Obtener todos los profesores
    const allProfessors = await this.professorRepository.find();
    
    // Cargar todos los horarios de una vez para eficiencia
    const allHorarios = await this.horarioRepository.find();
    const horariosMap = new Map<number, Horario>();
    allHorarios.forEach(hor => horariosMap.set(hor.id, hor));
    
    // Calcular días del mes
    const daysInMonth = new Date(year, month, 0).getDate();

    // Mapa para estadísticas por profesor
    const professorStats = new Map<
      number,
      {
        nombre: string;
        asistencias: number;
        ausencias: number;
        retrasos: number;
        diasConAsistencia: Set<string>;
      }
    >();

    // Inicializar todos los profesores
    allProfessors.forEach((prof) => {
      professorStats.set(prof.id, {
        nombre: prof.name,
        asistencias: 0,
        ausencias: 0,
        retrasos: 0,
        diasConAsistencia: new Set(),
      });
    });

    // Procesar asistencias
    let totalCompletas = 0;
    let totalIncompletas = 0;
    let totalRetrasos = 0;
    let totalSalidasTempranas = 0;

    attendances.forEach((att) => {
      if (!att.professor) return;

      const profId = att.professor.id;
      const stats = professorStats.get(profId);
      if (!stats) return;

      if (att.entryTime) {
        const dateKey = new Date(att.entryTime).toISOString().split('T')[0];
        stats.diasConAsistencia.add(dateKey);
        stats.asistencias++;

        // Verificar si es retraso (comparar con hora esperada del horario + tolerancia)
        if (att.professor.horarioId) {
          const horario = horariosMap.get(att.professor.horarioId);
          if (horario && horario.hora_entrada) {
            const [expectedHour, expectedMin] = horario.hora_entrada
              .split(':')
              .map(Number);
            const tolerancia = horario.tolerancia_entrada || 30; // Por defecto 30 minutos
            
            // Calcular la hora límite (hora esperada + tolerancia)
            const expectedMinutes = expectedHour * 60 + expectedMin;
            const limiteMinutes = expectedMinutes + tolerancia;
            const limiteHour = Math.floor(limiteMinutes / 60);
            const limiteMin = limiteMinutes % 60;
            
            const entryDate = new Date(att.entryTime);
            const entryMinutes = entryDate.getHours() * 60 + entryDate.getMinutes();
            
            // Es tardanza si la entrada es después del límite (hora esperada + tolerancia)
            if (entryMinutes > limiteMinutes) {
              stats.retrasos++;
              totalRetrasos++;
            }
          }
        }

        // Verificar si tiene salida
        if (att.exitTime) {
          totalCompletas++;
        } else {
          totalIncompletas++;
        }

        // No se verifica salida temprana - el profesor puede salir a cualquier hora
      }
    });

    // Calcular justificados (asistencias con justificación) y ausencias sin justificar
    let totalJustificados = 0;
    
    attendances.forEach((att) => {
      if (!att.professor) return;
      
      // Si tiene justificación (y no es del sistema automático), contar como justificado
      if (att.justification && 
          att.justification.trim().length > 0 &&
          !att.justification.includes('Hoja de asistencia creada automáticamente') &&
          !att.justification.includes('Marcado manual por administrador')) {
        totalJustificados++;
      }
    });

    // Calcular ausencias sin justificar por profesor
    professorStats.forEach((stats, profId) => {
      stats.ausencias = daysInMonth - stats.diasConAsistencia.size;
    });

    const totalAusencias = Array.from(professorStats.values()).reduce(
      (sum, stats) => sum + stats.ausencias,
      0,
    );

    return {
      totalAsistencias: attendances.length,
      totalProfesores: allProfessors.length,
      asistenciasCompletas: totalCompletas,
      asistenciasIncompletas: totalIncompletas,
      ausencias: totalAusencias,
      justificados: totalJustificados, // Agregar campo de justificados
      retrasos: totalRetrasos,
      salidasTempranas: totalSalidasTempranas,
      porProfesor: Array.from(professorStats.entries()).map(([id, stats]) => ({
        profesorId: id,
        nombre: stats.nombre,
        totalDias: daysInMonth,
        asistencias: stats.asistencias,
        ausencias: stats.ausencias,
        retrasos: stats.retrasos,
      })),
    };
  }

}
