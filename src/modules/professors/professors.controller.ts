import { Controller, Post, Get, Put, Delete, Body, Param, BadRequestException } from '@nestjs/common';
import { ProfessorsService } from './professors.service';
import { Professor } from '../../entities/professors.entity';

@Controller('professors')
export class ProfessorsController {
  constructor(private readonly professorsService: ProfessorsService) {}

  // Crear un profesor
  @Post('create')
  async create(@Body() body: {
    name: string;
    apellidos?: string;
    dni?: string;
    phone?: string;
    address?: string;
    departamentoId?: number | null;
    horarioId?: number | null;
    email: string;
    password: string;
  }): Promise<Professor> {
    try {
      return await this.professorsService.create(body);
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  // Obtener todos los profesores
  @Get()
  async findAll(): Promise<Professor[]> {
    try {
      return await this.professorsService.findAll();
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  // Consultar datos por DNI desde API externa
  @Get('consult-dni/:dni')
  async consultarPorDni(@Param('dni') dni: string): Promise<{ name: string; apellidos?: string }> {
    try {
      return await this.professorsService.consultarPorDni(dni);
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  // Obtener profesor por ID
  @Get(':id')
  async findById(@Param('id') id: string): Promise<Professor> {
    try {
      return await this.professorsService.findById(+id);
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }
@Get('me/:id')
async getMe(@Param('id') id: string) {
  return this.professorsService.findById(+id);
}

  

  // Actualizar profesor
  @Put('update/:id')
  async update(
    @Param('id') id: string,
    @Body() body: Partial<Professor & { email?: string; password?: string }>,
  ): Promise<Professor> {
    try {
      return await this.professorsService.update(+id, body);
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  // Eliminar profesor
  @Delete('delete/:id')
  async delete(@Param('id') id: string): Promise<{ message: string }> {
    try {
      return await this.professorsService.delete(+id);
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }
}
