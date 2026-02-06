import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // Obtener reportes por año y mes
  @Get('year/:year/month/:month')
  async getByYearMonth(
    @Param('year') year: number,
    @Param('month') month: number,
    @Query('professorId') professorId?: number,
  ) {
    return this.reportsService.getByYearMonth(+year, +month, professorId ? +professorId : undefined);
  }

  // Obtener reportes por año
  @Get('year/:year')
  async getByYear(
    @Param('year') year: number,
    @Query('professorId') professorId?: number,
  ) {
    return this.reportsService.getByYear(+year, professorId ? +professorId : undefined);
  }

  // Obtener reportes por rango de fechas
  @Post('date-range')
  async getByDateRange(
    @Body('startDate') startDate: string,
    @Body('endDate') endDate: string,
    @Body('professorId') professorId?: number,
  ) {
    console.log('📅 getByDateRange - startDate:', startDate, 'endDate:', endDate);
    
    // Parsear las fechas en hora local (no UTC) para evitar problemas de zona horaria
    // Si la fecha viene como "2025-12-01", crear la fecha en hora local
    const startParts = startDate.split('-').map(Number);
    const start = new Date(startParts[0], startParts[1] - 1, startParts[2], 0, 0, 0, 0);
    
    const endParts = endDate.split('-').map(Number);
    const end = new Date(endParts[0], endParts[1] - 1, endParts[2], 23, 59, 59, 999);
    
    console.log('📅 Fechas parseadas en hora local - start:', start, 'end:', end);
    const result = await this.reportsService.getByDateRange(
      start,
      end,
      professorId ? +professorId : undefined,
    );
    console.log('📊 Reportes encontrados:', result.length);
    return result;
  }

  // Obtener reportes de un profesor específico
  @Get('professor/:professorId')
  async getByProfessor(
    @Param('professorId') professorId: number,
    @Query('year') year?: number,
    @Query('month') month?: number,
  ) {
    return this.reportsService.getByProfessor(+professorId, year ? +year : undefined, month ? +month : undefined);
  }

  // Obtener estadísticas por año y mes
  @Get('stats/year/:year/month/:month')
  async getStatsByYearMonth(
    @Param('year') year: number,
    @Param('month') month: number,
  ) {
    return this.reportsService.getStatsByYearMonth(+year, +month);
  }

  // Sincronizar todas las asistencias existentes a reportes
  @Post('sync-all')
  async syncAllAttendances() {
    return this.reportsService.syncAllAttendances();
  }

  // Verificar estado de sincronización (cuántas asistencias hay vs cuántos reportes)
  @Get('sync-status')
  async getSyncStatus() {
    return this.reportsService.getSyncStatus();
  }

  // Corregir registros con mes incorrecto
  @Post('fix-months')
  async fixIncorrectMonths() {
    return this.reportsService.fixIncorrectMonths();
  }
}

