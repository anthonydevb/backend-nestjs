import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { AttendanceReport } from '../../entities/attendance-report.entity';
import { Attendance } from '../../entities/attendance.entity';
import { Professor } from '../../entities/professors.entity';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(AttendanceReport)
    private readonly reportRepository: Repository<AttendanceReport>,
    @InjectRepository(Attendance)
    private readonly attendanceRepository: Repository<Attendance>,
    @InjectRepository(Professor)
    private readonly professorRepository: Repository<Professor>,
  ) {}

  // Guardar un reporte de asistencia (llamado cuando se crea/actualiza una asistencia)
  async saveReport(attendance: Attendance): Promise<AttendanceReport | null> {
    try {
      // Verificar que la asistencia tenga profesor
      if (!attendance.professor || !attendance.professor.id) {
        console.error('Error: La asistencia no tiene profesor asociado');
        return null;
      }

      // Determinar la fecha del reporte
      let reportDate: Date;
      if (attendance.entryTime) {
        reportDate = new Date(attendance.entryTime);
      } else if (attendance.exitTime) {
        reportDate = new Date(attendance.exitTime);
      } else if (attendance.createdAt) {
        reportDate = new Date(attendance.createdAt);
      } else {
        reportDate = new Date(); // Fallback a hoy
      }

      // Normalizar la fecha a medianoche en hora local (no UTC)
      // Esto evita problemas de cambio de día por zona horaria
      const year = reportDate.getFullYear();
      const month = reportDate.getMonth();
      const day = reportDate.getDate();
      reportDate = new Date(year, month, day, 0, 0, 0, 0);

      // Si es una ausencia justificada (tiene justification pero no entryTime real o es a las 00:00),
      // usar la fecha del createdAt si está más cerca de la fecha esperada
      if (attendance.justification && attendance.justification.trim().length > 0) {
        // Si entryTime es a las 00:00 y es manual, probablemente es una ausencia justificada
        // Usar la fecha del createdAt que debería ser más precisa
        if (attendance.entryTime && attendance.isManual) {
          const entryDate = new Date(attendance.entryTime);
          if (entryDate.getHours() === 0 && entryDate.getMinutes() === 0 && attendance.createdAt) {
            const createdDate = new Date(attendance.createdAt);
            // Si createdAt está en el mismo día o muy cerca, usarlo
            if (Math.abs(createdDate.getTime() - entryDate.getTime()) < 24 * 60 * 60 * 1000) {
              reportDate = new Date(createdDate);
              reportDate.setHours(0, 0, 0, 0);
            }
          }
        }
      }

      const reportYear = reportDate.getFullYear();
      const reportMonth = reportDate.getMonth() + 1; // Mes 1-12

      // Buscar reporte existente por profesor y fecha (no solo por attendanceId, porque puede haber múltiples actualizaciones)
      const existingReport = await this.reportRepository.findOne({
        where: {
          professor: { id: attendance.professor.id },
          fecha: reportDate,
        },
        relations: ['professor'],
      });

      if (existingReport) {
        // Actualizar reporte existente con los datos más recientes
        existingReport.entryTime = attendance.entryTime;
        existingReport.exitTime = attendance.exitTime;
        existingReport.activity = attendance.activity;
        existingReport.isManual = attendance.isManual;
        existingReport.markedBy = attendance.markedBy;
        existingReport.justification = attendance.justification;
        existingReport.isLate = attendance.isLate || false;
        existingReport.attendanceId = attendance.id; // Actualizar referencia al ID más reciente
        existingReport.year = reportYear;
        existingReport.month = reportMonth;
        return await this.reportRepository.save(existingReport);
      }

      // Crear nuevo reporte
      const report = this.reportRepository.create({
        professor: attendance.professor,
        fecha: reportDate,
        year: reportYear,
        month: reportMonth,
        entryTime: attendance.entryTime,
        exitTime: attendance.exitTime,
        activity: attendance.activity,
        isManual: attendance.isManual,
        markedBy: attendance.markedBy,
        justification: attendance.justification,
        isLate: attendance.isLate || false,
        attendanceId: attendance.id,
      });

      return await this.reportRepository.save(report);
    } catch (error) {
      console.error('Error al guardar reporte de asistencia:', error);
      // No lanzar error para no interrumpir el flujo principal
      return null;
    }
  }

  // Obtener reportes por año y mes
  async getByYearMonth(year: number, month: number, professorId?: number): Promise<AttendanceReport[]> {
    // Crear el rango de fechas del mes (del 1 al último día del mes)
    const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0); // Primer día del mes
    const endDate = new Date(year, month, 0, 23, 59, 59, 999); // Último día del mes
    
    console.log(`📅 Obteniendo reportes para ${month}/${year} - Rango: ${startDate.toISOString()} a ${endDate.toISOString()}`);
    
    // Usar getByDateRange para garantizar sincronización con asistencias
    return await this.getByDateRange(startDate, endDate, professorId);
  }

  // Obtener reportes por año
  async getByYear(year: number, professorId?: number): Promise<AttendanceReport[]> {
    // Crear el rango de fechas del año completo (del 1 de enero al 31 de diciembre)
    const startDate = new Date(year, 0, 1, 0, 0, 0, 0); // Primer día del año
    const endDate = new Date(year, 11, 31, 23, 59, 59, 999); // Último día del año
    
    console.log(`📅 Obteniendo reportes para el año ${year} - Rango: ${startDate.toISOString()} a ${endDate.toISOString()}`);
    
    // Usar getByDateRange para garantizar sincronización con asistencias
    return await this.getByDateRange(startDate, endDate, professorId);
  }

  // Obtener reportes por rango de fechas
  async getByDateRange(startDate: Date, endDate: Date, professorId?: number): Promise<AttendanceReport[]> {
    // Normalizar fechas a medianoche para comparación correcta
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    
    console.log('🔍 Buscando reportes entre:', start, 'y', end);
    
    // SIEMPRE obtener directamente de asistencias para asegurar datos actualizados
    // Esto garantiza que los reportes reflejen siempre las asistencias más recientes
    console.log('📊 Obteniendo reportes directamente de asistencias para garantizar sincronización...');
    return await this.getReportsFromAttendances(start, end, professorId);
  }

  // Obtener reportes directamente de la tabla de asistencias si no están sincronizados
  private async getReportsFromAttendances(startDate: Date, endDate: Date, professorId?: number): Promise<AttendanceReport[]> {
    // Normalizar las fechas para comparación completa (incluyendo horas)
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    
    console.log('🔍 Buscando asistencias entre:', start.toISOString(), 'y', end.toISOString());
    
    // Obtener todas las asistencias que puedan estar relacionadas con el rango de fechas
    // Usar un rango extendido para capturar casos edge (un día antes y después)
    const extendedStart = new Date(start);
    extendedStart.setDate(extendedStart.getDate() - 1);
    extendedStart.setHours(0, 0, 0, 0);
    const extendedEnd = new Date(end);
    extendedEnd.setDate(extendedEnd.getDate() + 1);
    extendedEnd.setHours(23, 59, 59, 999);
    
    console.log('🔍 Consultando con fechas extendidas:', extendedStart.toISOString(), 'a', extendedEnd.toISOString());
    console.log('🔍 Rango original solicitado:', start.toISOString(), 'a', end.toISOString());
    
    // Usar comparación de timestamps completos para evitar problemas con DATE() en MySQL
    // Esto captura todas las asistencias que puedan tener entryTime, exitTime o createdAt en el rango
    // También incluir asistencias con justificaciones válidas (aunque no tengan entryTime/exitTime con horas reales)
    // Usar BETWEEN para mejor rendimiento en MySQL
    const qb = this.attendanceRepository
      .createQueryBuilder('attendance')
      .leftJoinAndSelect('attendance.professor', 'professor')
      .where(
        '(attendance.entryTime IS NOT NULL AND attendance.entryTime BETWEEN :extendedStart AND :extendedEnd) OR ' +
        '(attendance.exitTime IS NOT NULL AND attendance.exitTime BETWEEN :extendedStart AND :extendedEnd) OR ' +
        '(attendance.createdAt BETWEEN :extendedStart AND :extendedEnd) OR ' +
        '(attendance.justification IS NOT NULL AND attendance.justification != "" AND ' +
        'attendance.justification NOT LIKE :autoJustification1 AND ' +
        'attendance.justification != :autoJustification2)',
        { 
          extendedStart, 
          extendedEnd,
          autoJustification1: '%Hoja de asistencia creada automáticamente%',
          autoJustification2: 'Marcado manual por administrador'
        }
      );
    
    if (professorId) {
      qb.andWhere('professor.id = :professorId', { professorId });
    }
    
    qb.orderBy('COALESCE(attendance.entryTime, attendance.exitTime, attendance.createdAt)', 'ASC')
      .addOrderBy('professor.name', 'ASC');

    const attendances = await qb.getMany();
    console.log('📊 Asistencias encontradas en consulta inicial:', attendances.length);
    
    // Log detallado de las primeras asistencias encontradas
    if (attendances.length > 0) {
      console.log('📋 Primeras asistencias encontradas:');
      attendances.slice(0, 5).forEach((att, idx) => {
        const entryDate = att.entryTime ? new Date(att.entryTime).toISOString() : 'null';
        const exitDate = att.exitTime ? new Date(att.exitTime).toISOString() : 'null';
        const createdDate = att.createdAt ? new Date(att.createdAt).toISOString() : 'null';
        console.log(`  ${idx + 1}. ID: ${att.id}, Profesor: ${att.professor?.name || 'N/A'}, Entry: ${entryDate}, Exit: ${exitDate}, Created: ${createdDate}`);
      });
    } else {
      console.log('⚠️ No se encontraron asistencias en la consulta inicial. Intentando consulta alternativa más amplia...');
      
      // Intentar una consulta más amplia: obtener todas las asistencias de los últimos 30 días
      const veryExtendedStart = new Date(start);
      veryExtendedStart.setDate(veryExtendedStart.getDate() - 30);
      veryExtendedStart.setHours(0, 0, 0, 0);
      const veryExtendedEnd = new Date(end);
      veryExtendedEnd.setDate(veryExtendedEnd.getDate() + 30);
      veryExtendedEnd.setHours(23, 59, 59, 999);
      
      console.log('🔍 Intentando consulta alternativa con rango amplio:', veryExtendedStart.toISOString(), 'a', veryExtendedEnd.toISOString());
      
      const altQb = this.attendanceRepository
        .createQueryBuilder('attendance')
        .leftJoinAndSelect('attendance.professor', 'professor')
        .where(
          '(attendance.entryTime IS NOT NULL AND attendance.entryTime BETWEEN :veryExtendedStart AND :veryExtendedEnd) OR ' +
          '(attendance.exitTime IS NOT NULL AND attendance.exitTime BETWEEN :veryExtendedStart AND :veryExtendedEnd) OR ' +
          '(attendance.createdAt BETWEEN :veryExtendedStart AND :veryExtendedEnd) OR ' +
          '(attendance.justification IS NOT NULL AND attendance.justification != "" AND ' +
          'attendance.justification NOT LIKE :autoJustification1 AND ' +
          'attendance.justification != :autoJustification2)',
          { 
            veryExtendedStart, 
            veryExtendedEnd,
            autoJustification1: '%Hoja de asistencia creada automáticamente%',
            autoJustification2: 'Marcado manual por administrador'
          }
        );
      
      if (professorId) {
        altQb.andWhere('professor.id = :professorId', { professorId });
      }
      
      const altAttendances = await altQb.getMany();
      console.log(`📊 Asistencias encontradas en consulta alternativa: ${altAttendances.length}`);
      
      if (altAttendances.length > 0) {
        console.log('📋 Primeras asistencias encontradas en consulta alternativa:');
        altAttendances.slice(0, 10).forEach((att, idx) => {
          const entryDate = att.entryTime ? new Date(att.entryTime).toISOString() : 'null';
          const exitDate = att.exitTime ? new Date(att.exitTime).toISOString() : 'null';
          const createdDate = att.createdAt ? new Date(att.createdAt).toISOString() : 'null';
          console.log(`  ${idx + 1}. ID: ${att.id}, Profesor: ${att.professor?.name || 'N/A'}, Entry: ${entryDate}, Exit: ${exitDate}, Created: ${createdDate}`);
        });
        // Usar las asistencias de la consulta alternativa
        attendances.push(...altAttendances);
      } else {
        // Consulta de prueba sin filtros de fecha para ver si hay asistencias
        const testAttendances = await this.attendanceRepository.find({
          relations: ['professor'],
          take: 10,
          order: { createdAt: 'DESC' }
        });
        console.log(`📊 Total de asistencias en BD (últimas 10): ${testAttendances.length}`);
        if (testAttendances.length > 0) {
          testAttendances.forEach((att, idx) => {
            const entryDate = att.entryTime ? new Date(att.entryTime).toISOString() : 'null';
            const createdDate = att.createdAt ? new Date(att.createdAt).toISOString() : 'null';
            console.log(`  ${idx + 1}. ID: ${att.id}, Profesor: ${att.professor?.name || 'N/A'}, Entry: ${entryDate}, Created: ${createdDate}`);
          });
        }
      }
    }
    
    // Normalizar fechas de inicio y fin para comparación (solo fecha, sin hora)
    const startDateOnly = new Date(startDate);
    startDateOnly.setHours(0, 0, 0, 0);
    const endDateOnly = new Date(endDate);
    endDateOnly.setHours(23, 59, 59, 999);
    
    console.log('📅 Rango de fechas para filtrar reportes:', startDateOnly.toISOString(), 'a', endDateOnly.toISOString());
    
    // Convertir asistencias a formato de reportes
    const reportsMap = new Map<string, AttendanceReport>();
    let filteredCount = 0;
    
    for (const attendance of attendances) {
      if (!attendance.professor) {
        console.log('⚠️ Asistencia sin profesor, omitiendo:', attendance.id);
        continue;
      }
      
      // Determinar la fecha del reporte
      let reportDate: Date;
      if (attendance.entryTime) {
        reportDate = new Date(attendance.entryTime);
      } else if (attendance.exitTime) {
        reportDate = new Date(attendance.exitTime);
      } else if (attendance.createdAt) {
        reportDate = new Date(attendance.createdAt);
      } else {
        console.log('⚠️ Asistencia sin fecha válida, omitiendo:', attendance.id);
        continue; // Saltar si no tiene fecha
      }
      
      reportDate.setHours(0, 0, 0, 0);
      
      // Comparar fechas usando solo año, mes y día (ignorar hora y zona horaria)
      const reportDateStr = `${reportDate.getFullYear()}-${String(reportDate.getMonth() + 1).padStart(2, '0')}-${String(reportDate.getDate()).padStart(2, '0')}`;
      const startDateStr = `${startDateOnly.getFullYear()}-${String(startDateOnly.getMonth() + 1).padStart(2, '0')}-${String(startDateOnly.getDate()).padStart(2, '0')}`;
      const endDateStr = `${endDateOnly.getFullYear()}-${String(endDateOnly.getMonth() + 1).padStart(2, '0')}-${String(endDateOnly.getDate()).padStart(2, '0')}`;
      
      // Filtrar: solo incluir reportes cuya fecha esté dentro del rango solicitado
      if (reportDateStr < startDateStr || reportDateStr > endDateStr) {
        filteredCount++;
        console.log(`⏭️ Asistencia ${attendance.id} filtrada: fecha reporte ${reportDateStr} fuera del rango [${startDateStr}, ${endDateStr}]`);
        continue; // Saltar si la fecha del reporte está fuera del rango
      }
      
      // Verificar si es una justificación válida
      const hasValidJustification = attendance.justification && 
        attendance.justification.trim().length > 0 &&
        !attendance.justification.includes('Hoja de asistencia creada automáticamente') &&
        attendance.justification !== 'Marcado manual por administrador';
      
      const isJustified = hasValidJustification && 
        (!attendance.entryTime || (new Date(attendance.entryTime).getHours() === 0 && new Date(attendance.entryTime).getMinutes() === 0)) &&
        (!attendance.exitTime || (new Date(attendance.exitTime).getHours() === 0 && new Date(attendance.exitTime).getMinutes() === 0));
      
      if (isJustified && attendance.justification) {
        console.log(`✅ Justificación incluida: ID ${attendance.id}, Profesor: ${attendance.professor.name}, Fecha: ${reportDateStr}, Justificación: ${attendance.justification.substring(0, 50)}...`);
      } else {
        console.log(`✅ Asistencia ${attendance.id} incluida: fecha reporte ${reportDateStr}, profesor: ${attendance.professor.name}`);
      }
      
      // Usar una clave única que incluya el ID de la asistencia para evitar perder registros
      // Si hay múltiples asistencias del mismo profesor en el mismo día, crear un reporte para cada una
      const dateKey = `${attendance.professor.id}-${reportDate.toISOString().split('T')[0]}-${attendance.id}`;
      
      // Verificar si ya existe un reporte para esta asistencia específica
      // Si no existe, crear uno nuevo
      if (!reportsMap.has(dateKey)) {
        // Crear nuevo reporte temporal para esta asistencia
        const report = this.reportRepository.create({
          professor: attendance.professor,
          fecha: reportDate,
          year: reportDate.getFullYear(),
          month: reportDate.getMonth() + 1,
          entryTime: attendance.entryTime,
          exitTime: attendance.exitTime,
          activity: attendance.activity,
          isManual: attendance.isManual,
          markedBy: attendance.markedBy,
          justification: attendance.justification,
          isLate: attendance.isLate || false,
          attendanceId: attendance.id,
        });
        reportsMap.set(dateKey, report);
      } else {
        // Si ya existe, actualizar con los datos más recientes
        const existing = reportsMap.get(dateKey)!;
        if (attendance.entryTime) existing.entryTime = attendance.entryTime;
        if (attendance.exitTime) existing.exitTime = attendance.exitTime;
        if (attendance.activity) existing.activity = attendance.activity;
        if (attendance.justification) existing.justification = attendance.justification;
        existing.isManual = attendance.isManual;
        existing.markedBy = attendance.markedBy;
        existing.isLate = attendance.isLate || false;
      }
    }
    
    const reports = Array.from(reportsMap.values());
    console.log(`📊 Reportes generados desde asistencias: ${reports.length} (${filteredCount} asistencias filtradas por estar fuera del rango)`);
    console.log(`📋 IDs de reportes generados: ${reports.map(r => r.attendanceId || 'sin-id').join(', ')}`);
    console.log(`📋 Profesores en reportes: ${reports.map(r => r.professor?.name || 'N/A').join(', ')}`);
    
    // Sincronizar los reportes en la base de datos (crear o actualizar)
    try {
      for (const report of reports) {
        // Buscar si ya existe un reporte para esta asistencia específica usando attendanceId
        // Esto permite tener múltiples reportes del mismo profesor en el mismo día
        let existing: AttendanceReport | null = null;
        
        if (report.attendanceId) {
          existing = await this.reportRepository.findOne({
            where: {
              attendanceId: report.attendanceId,
            } as any,
          });
        }
        
        // Si no se encuentra por attendanceId, buscar por profesor y fecha como fallback
        // pero solo si no hay attendanceId o si el attendanceId no coincide
        if (!existing && report.attendanceId) {
          const whereClause: any = {
            professor: { id: report.professor.id },
            fecha: report.fecha,
          };
          if (report.attendanceId) {
            whereClause.attendanceId = report.attendanceId;
          }
          existing = await this.reportRepository.findOne({
            where: whereClause,
          });
        }
        
        if (existing) {
          // Actualizar reporte existente con los datos más recientes
          existing.entryTime = report.entryTime;
          existing.exitTime = report.exitTime;
          existing.activity = report.activity;
          existing.isManual = report.isManual;
          existing.markedBy = report.markedBy;
          existing.justification = report.justification;
          existing.isLate = report.isLate;
          existing.attendanceId = report.attendanceId;
          existing.year = report.year;
          existing.month = report.month;
          await this.reportRepository.save(existing);
        } else {
          // Crear nuevo reporte si no existe
          await this.reportRepository.save(report);
        }
      }
      console.log(`✅ Reportes sincronizados en la base de datos: ${reports.length} reportes procesados`);
    } catch (error) {
      console.error('⚠️ Error al sincronizar reportes (continuando de todas formas):', error);
    }
    
    return reports;
  }

  // Obtener reportes de un profesor específico
  async getByProfessor(professorId: number, year?: number, month?: number): Promise<AttendanceReport[]> {
    // Si se especifica año y mes, usar getByYearMonth
    if (year && month) {
      const reports = await this.getByYearMonth(year, month, professorId);
      return reports.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    }
    
    // Si solo se especifica año, usar getByYear
    if (year) {
      const reports = await this.getByYear(year, professorId);
      return reports.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    }
    
    // Si no se especifica año ni mes, obtener todas las asistencias del profesor
    // Usar un rango amplio (últimos 10 años hasta el futuro)
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    const startDate = new Date();
    startDate.setFullYear(endDate.getFullYear() - 10);
    startDate.setHours(0, 0, 0, 0);
    
    const reports = await this.getByDateRange(startDate, endDate, professorId);
    return reports.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }

  // Obtener estadísticas por año y mes
  async getStatsByYearMonth(year: number, month: number): Promise<any> {
    const reports = await this.getByYearMonth(year, month);
    
    const totalReports = reports.length;
    const withEntry = reports.filter(r => r.entryTime !== null).length;
    const withExit = reports.filter(r => r.exitTime !== null).length;
    // Solo contar justificaciones reales (no automáticas) y que NO tengan asistencia real
    const justified = reports.filter(r => {
      const justification = r.justification?.trim() || '';
      if (justification.length === 0) return false;
      
      // Excluir justificaciones automáticas
      const isAutoJustification = justification.includes('Marcado manual por administrador') ||
                                  justification.includes('Hoja de asistencia creada automáticamente');
      if (isAutoJustification) return false;
      
      // Verificar si tiene asistencia real (entrada o salida con horas reales)
      const hasRealEntry = r.entryTime && 
        (new Date(r.entryTime).getHours() !== 0 || 
         new Date(r.entryTime).getMinutes() !== 0);
      const hasRealExit = r.exitTime && 
        (new Date(r.exitTime).getHours() !== 0 || 
         new Date(r.exitTime).getMinutes() !== 0);
      
      // Solo es justificada si NO tiene asistencia real
      return !hasRealEntry && !hasRealExit;
    }).length;
    const absences = reports.filter(r => !r.entryTime && !r.exitTime && (!r.justification || r.justification.trim().length === 0)).length;
    const manual = reports.filter(r => r.isManual).length;
    const tardanzas = reports.filter(r => r.isLate === true).length;

    return {
      year,
      month,
      totalReports,
      withEntry,
      withExit,
      justified,
      absences,
      manual,
      tardanzas,
      reports,
    };
  }

  // Sincronizar todas las asistencias existentes a reportes (útil para migración)
  async syncAllAttendances(): Promise<{ synced: number; errors: number; skipped: number }> {
    const allAttendances = await this.attendanceRepository.find({
      relations: ['professor'],
      order: { createdAt: 'ASC' }, // Ordenar por fecha de creación para procesar en orden
    });

    let synced = 0;
    let errors = 0;
    let skipped = 0;

    console.log(`Iniciando sincronización de ${allAttendances.length} asistencias a reportes...`);

    for (const attendance of allAttendances) {
      try {
        if (!attendance.professor) {
          console.warn(`Asistencia ${attendance.id} no tiene profesor asociado, omitiendo...`);
          skipped++;
          continue;
        }

        const report = await this.saveReport(attendance);
        if (report) {
          synced++;
          if (synced % 100 === 0) {
            console.log(`Procesadas ${synced} asistencias...`);
          }
        } else {
          skipped++;
        }
      } catch (error) {
        console.error(`Error al sincronizar asistencia ${attendance.id}:`, error);
        errors++;
      }
    }

    console.log(`Sincronización completada: ${synced} sincronizadas, ${errors} errores, ${skipped} omitidas`);
    return { synced, errors, skipped };
  }

  // Obtener estado de sincronización
  async getSyncStatus(): Promise<{ totalAttendances: number; totalReports: number; pending: number; percentage: string }> {
    const totalAttendances = await this.attendanceRepository.count();
    const totalReports = await this.reportRepository.count();
    const pending = totalAttendances - totalReports;
    const percentage = totalAttendances > 0 ? ((totalReports / totalAttendances) * 100).toFixed(2) : '0.00';
    
    return {
      totalAttendances,
      totalReports,
      pending,
      percentage,
    };
  }

  // Corregir registros con mes incorrecto
  async fixIncorrectMonths(): Promise<{ fixed: number; errors: number }> {
    console.log('🔧 Iniciando corrección de meses incorrectos...');
    
    const allReports = await this.reportRepository.find();
    let fixed = 0;
    let errors = 0;

    for (const report of allReports) {
      try {
        const fecha = new Date(report.fecha);
        const correctYear = fecha.getFullYear();
        const correctMonth = fecha.getMonth() + 1; // 1-12

        // Si el mes o año no coinciden con la fecha, corregir
        if (report.year !== correctYear || report.month !== correctMonth) {
          console.log(`Corrigiendo reporte ID ${report.id}: fecha=${fecha.toISOString()}, year=${report.year}->${correctYear}, month=${report.month}->${correctMonth}`);
          report.year = correctYear;
          report.month = correctMonth;
          await this.reportRepository.save(report);
          fixed++;
        }
      } catch (error) {
        console.error(`Error al corregir reporte ${report.id}:`, error);
        errors++;
      }
    }

    console.log(`✅ Corrección completada: ${fixed} corregidos, ${errors} errores`);
    return { fixed, errors };
  }
}

