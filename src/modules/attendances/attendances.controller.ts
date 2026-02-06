import { Controller, Post, Body, Get, Param, Delete, Query } from '@nestjs/common';
import { AttendancesService } from './attendances.service';
import { CleanupService } from './cleanup.service';

@Controller('attendances')
export class AttendancesController {
  constructor(
    private readonly attendancesService: AttendancesService,
    private readonly cleanupService: CleanupService,
  ) {}

  // Marcar entrada
  // Recibe el ID del profesor y el token del QR
  @Post('entry')
  async markEntry(
    @Body('professorId') professorId: number,
    @Body('qrToken') qrToken: string
  ) {
    // Llama al servicio para registrar la entrada
    return this.attendancesService.markEntry(professorId, qrToken);
  }

  // Marcar salida y registrar actividad
  // Recibe ID del profesor, token del QR y la actividad realizada
  @Post('exit')
  async markExit(
    @Body('professorId') professorId: number,
    @Body('qrToken') qrToken: string,
    @Body('activity') activity: string
  ) {
    // Llama al servicio para registrar la salida y actividad
    return this.attendancesService.markExit(professorId, qrToken, activity);
  }

  // Obtener todas las asistencias de un profesor
  // Recibe el ID del profesor como parámetro
  @Get('professor/:professorId')
  async getAttendancesByProfessor(@Param('professorId') professorId: number) {
    // Llama al servicio para traer todas las asistencias del profesor
    return this.attendancesService.getAttendancesByProfessor(professorId);
  }
  // AttendancesController
@Get()
async getAllAttendances() {
  return this.attendancesService.getAll();
}

  // Marcar asistencia manualmente
  @Post('manual')
  async markManual(
    @Body('professorId') professorId: number,
    @Body('type') type: 'entry' | 'exit',
    @Body('dateTime') dateTime: string,
    @Body('markedBy') markedBy: string,
    @Body('justification') justification?: string,
    @Body('dni') dni?: string,
    @Body('activity') activity?: string,
  ) {
    return this.attendancesService.markManual(
      professorId,
      type,
      new Date(dateTime),
      justification || 'Marcado manual por administrador',
      markedBy,
      dni,
      activity,
    );
  }

  // Crear hojas de asistencia masivas para un mes
  @Post('create-monthly-sheets')
  async createMonthlySheets(
    @Body('year') year: number,
    @Body('month') month: number,
    @Body('professorIds') professorIds?: number[],
  ) {
    return this.attendancesService.createMonthlySheets(year, month, professorIds);
  }

  // Eliminar asistencias duplicadas
  @Post('remove-duplicates')
  async removeDuplicates() {
    return this.attendancesService.removeDuplicates();
  }

  // Eliminar todas las asistencias
  @Delete('delete-all')
  async deleteAllAttendances() {
    return this.attendancesService.deleteAllAttendances();
  }

  // Justificar ausencia o retraso (profesor o admin)
  @Post('justify')
  async justifyAttendance(
    @Body('professorId') professorId: number,
    @Body('date') date: string, // Fecha en formato YYYY-MM-DD
    @Body('type') type: 'absence' | 'delay' | 'early_exit', // Tipo de justificación
    @Body('justification') justification: string, // Texto de justificación
    @Body('markedBy') markedBy?: string, // Opcional: nombre de quien justifica (admin)
  ) {
    return this.attendancesService.justifyAttendance(
      professorId,
      new Date(date),
      type,
      justification,
      markedBy, // Pasar el nombre de quien justifica
    );
  }

  // Obtener días sin justificar de un profesor
  @Get('unjustified/:professorId')
  async getUnjustifiedDays(@Param('professorId') professorId: number) {
    return this.attendancesService.getUnjustifiedDays(professorId);
  }

  // Obtener asistencias por mes y año
  @Get('report/month/:year/:month')
  async getByMonthYear(
    @Param('year') year: number,
    @Param('month') month: number,
  ) {
    return this.attendancesService.getByMonthYear(+year, +month);
  }

  // Obtener asistencias por rango de fechas
  @Post('report/range')
  async getByDateRange(
    @Body('startDate') startDate: string,
    @Body('endDate') endDate: string,
    @Body('professorId') professorId?: number,
  ) {
    return this.attendancesService.getByDateRange(
      new Date(startDate),
      new Date(endDate),
      professorId,
    );
  }

  // Obtener estadísticas de asistencias por mes
  @Get('report/stats/:year/:month')
  async getMonthlyStats(
    @Param('year') year: number,
    @Param('month') month: number,
  ) {
    return this.attendancesService.getMonthlyStats(+year, +month);
  }

  // Verificar si un profesor tiene asistencia real para una fecha
  @Get('check-real/:professorId/:date')
  async checkRealAttendance(
    @Param('professorId') professorId: number,
    @Param('date') date: string, // Formato YYYY-MM-DD
    @Query('manual') manual?: string, // Si es 'true', solo verificar asistencias por QR
  ) {
    const checkDate = new Date(date);
    let hasReal: boolean;
    
    // Si es para marcado manual, solo verificar asistencias por QR
    if (manual === 'true') {
      hasReal = await this.attendancesService.hasQRAttendance(professorId, checkDate);
    } else {
      // Para justificaciones, verificar todas las asistencias reales
      hasReal = await this.attendancesService.hasRealAttendance(professorId, checkDate);
    }
    
    return { hasRealAttendance: hasReal };
  }

  // Ejecutar limpieza manual de registros antiguos (más de 1 mes)
  @Post('cleanup')
  async cleanupOldAttendances() {
    return this.cleanupService.cleanupManually();
  }

}
