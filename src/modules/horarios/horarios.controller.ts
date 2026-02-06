import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe } from '@nestjs/common';
import { HorariosService } from './horarios.service';
import { Horario } from '../../entities/horario.entity';

@Controller('horarios')
export class HorariosController {
  constructor(private readonly horariosService: HorariosService) {}

  @Post('create')
  async create(@Body() body: { 
    hora_entrada: string; 
    hora_salida: string;
    tolerancia_entrada?: number;
  }): Promise<Horario> {
    return this.horariosService.create(body);
  }

  @Get()
  async findAll(): Promise<Horario[]> {
    return this.horariosService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<Horario> {
    return this.horariosService.findOne(id);
  }

  @Put('update/:id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { 
      hora_entrada?: string; 
      hora_salida?: string;
      tolerancia_entrada?: number;
    }
  ): Promise<Horario> {
    return this.horariosService.update(id, body);
  }

  @Delete('delete/:id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<{ message: string }> {
    return this.horariosService.remove(id);
  }
}

