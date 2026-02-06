import { Controller, Post, Body, BadRequestException, Get, Param, Put, Delete, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { UserRole, User } from '../../entities/user.entity';

@Controller('users')
export class UsersController {
  constructor(
    private usersService: UsersService,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  @Post('create')
  async create(@Body() body: any) {
    const { name, email, password, role } = body;

    if (!Object.values(UserRole).includes(role)) {
      throw new BadRequestException('Rol no válido');
    }

    try {
      const user = await this.usersService.create({ name, email, password, role });
      return { 
        id: user.id, 
        name: user.name, 
        email: user.email, 
        role: user.role 
      };
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  @Post('create-professor')
  async createProfessor(@Body() body: any) {
    const { name, email, password, dni, phone, address, departamentoId, horarioId } = body;

    try {
      const professor = await this.usersService.createProfessorUser({
        name, email, password, dni, phone, address, departamentoId, horarioId
      });

      const user = professor.users[0];

      return { 
        id: user.id, 
        name: user.name, 
        email: user.email, 
        role: user.role,
        professorId: professor.id
      };
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  @Get()
  async getAll() {
    try {
      const users = await this.usersService.findAll();
      return users.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        professor: user.professor
      }));
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  @Get('admins')
  async getAdmins() {
    try {
      const admins = await this.usersService.findByRole(UserRole.ADMIN);
      return admins.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }));
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  @Get('professors')
  async getProfessors() {
    try {
      const professors = await this.usersService.findByRole(UserRole.PROFESSOR);
      return professors.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        professor: user.professor
      }));
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  @Put('update/:id')
  async update(
    @Param('id') id: string, 
    @Body() body: Partial<{ name: string; email: string; password: string }>
  ) {
    try {
      const user = await this.usersService.update(+id, body);
      return { 
        id: user.id, 
        name: user.name, 
        email: user.email, 
        role: user.role 
      };
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  @Delete('delete/:id')
  async delete(@Param('id') id: string) {
    try {
      return await this.usersService.delete(+id);
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  // 🔹 Verificar si un email está disponible
  @Get('check-email')
  async checkEmail(@Query('email') email: string, @Query('excludeId') excludeId?: string): Promise<{ available: boolean }> {
    if (!email) {
      throw new BadRequestException('El email es requerido');
    }

    // Normalizar email (minúsculas, sin espacios)
    const normalizedEmail = email.toLowerCase().trim();

    const queryBuilder = this.usersRepository.createQueryBuilder('user')
      .where('LOWER(user.email) = :email', { email: normalizedEmail });

    // Si se proporciona excludeId, excluir ese usuario (útil para edición)
    if (excludeId) {
      const id = parseInt(excludeId, 10);
      if (!isNaN(id)) {
        queryBuilder.andWhere('user.id != :id', { id });
      }
    }

    const existingUser = await queryBuilder.getOne();

    return { available: !existingUser };
  }
}
