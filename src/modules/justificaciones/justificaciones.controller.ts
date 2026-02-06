import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import { JustificacionesService } from './justificaciones.service';
import { Justificacion } from '../../entities/justificacion.entity';

@Controller('justificaciones')
export class JustificacionesController {
  constructor(private readonly justificacionesService: JustificacionesService) {}

  // Crear justificación
  @Post()
  async create(@Body() createJustificacionDto: {
    profesorId: number;
    fecha: string;
    tipo: string;
    descripcion: string;
  }): Promise<Justificacion> {
    return this.justificacionesService.create(createJustificacionDto);
  }

  // Obtener justificaciones por profesor
  @Get('profesor/:profesorId')
  async findByProfesor(@Param('profesorId', ParseIntPipe) profesorId: number): Promise<Justificacion[]> {
    return this.justificacionesService.findByProfesor(profesorId);
  }

  // Obtener justificación por ID
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<Justificacion> {
    return this.justificacionesService.findOne(id);
  }

  // Obtener justificaciones pendientes (admin)
  @Get('pendientes/todas')
  async findPendientes(): Promise<Justificacion[]> {
    return this.justificacionesService.findPendientes();
  }

  // Obtener todas las justificaciones (admin)
  @Get('todas/todas')
  async findAll(): Promise<Justificacion[]> {
    return this.justificacionesService.findAll();
  }

  // Aprobar justificación (admin)
  @Put(':id/aprobar')
  async aprobar(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { adminId: number },
  ): Promise<Justificacion> {
    return this.justificacionesService.aprobar(id, body.adminId);
  }

  // Rechazar justificación (admin)
  @Put(':id/rechazar')
  async rechazar(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { adminId: number; motivoRechazo: string },
  ): Promise<Justificacion> {
    return this.justificacionesService.rechazar(id, body.adminId, body.motivoRechazo);
  }

  // Verificar justificación por fecha
  @Get('verificar/:profesorId/:fecha')
  async verificar(
    @Param('profesorId', ParseIntPipe) profesorId: number,
    @Param('fecha') fecha: string,
  ): Promise<{ existe: boolean; justificacion?: Justificacion }> {
    return this.justificacionesService.verificarJustificacion(profesorId, fecha);
  }
}

