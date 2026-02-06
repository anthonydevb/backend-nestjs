import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe } from '@nestjs/common';
import { DepartamentosService } from './departamentos.service';
import { Departamento } from '../../entities/departamento.entity';

@Controller('departamentos')
export class DepartamentosController {
  constructor(private readonly departamentosService: DepartamentosService) {}

  @Post('create')
  async create(@Body() body: { nombre: string; descripcion?: string }): Promise<Departamento> {
    return this.departamentosService.create(body);
  }

  @Get()
  async findAll(): Promise<Departamento[]> {
    return this.departamentosService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<Departamento> {
    return this.departamentosService.findOne(id);
  }

  @Put('update/:id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { nombre?: string; descripcion?: string }
  ): Promise<Departamento> {
    return this.departamentosService.update(id, body);
  }

  @Delete('delete/:id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<{ message: string }> {
    return this.departamentosService.remove(id);
  }
}

