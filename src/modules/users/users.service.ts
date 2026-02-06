import { Injectable, Inject, forwardRef, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../../entities/user.entity';
import { ProfessorsService } from '../professors/professors.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,

    @Inject(forwardRef(() => ProfessorsService))
    private professorsService: ProfessorsService,
  ) {}

  // Crear usuario normal (ADMIN, STUDENT, etc.)
  async create(data: { name: string; email: string; password: string; role: UserRole }) {
    const existingUser = await this.usersRepository.findOne({ where: { email: data.email } });
    if (existingUser) {
      throw new BadRequestException('El correo ya está registrado');
    }

    const user = this.usersRepository.create(data);
    return this.usersRepository.save(user);
  }

  // Crear usuario-profesor (usuario + profesor)
  async createProfessorUser(data: {
    name: string;
    email: string;
    password: string;
    dni?: string;
    phone?: string;
    address?: string;
    departamentoId?: number | null;
    horarioId?: number | null;
  }) {
    // Verificar correo
    const existingUser = await this.usersRepository.findOne({ where: { email: data.email } });
    if (existingUser) {
      throw new BadRequestException('El correo ya está registrado');
    }

    // Crear profesor (creará el usuario dentro de ProfessorsService)
    const professor = await this.professorsService.create({
      name: data.name,
      email: data.email,
      password: data.password,
      dni: data.dni,
      phone: data.phone,
      address: data.address,
      departamentoId: data.departamentoId || null,
      horarioId: data.horarioId || null,
    });

    return professor;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async findByEmailWithProfessor(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ 
      where: { email },
      relations: ['professor'] // Cargar la relación con professor
    });
  }

  async findOne(id: number): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async findAll(): Promise<User[]> {
    return this.usersRepository.find({ relations: ['professor'] });
  }

  async findByRole(role: UserRole): Promise<User[]> {
    return this.usersRepository.find({ 
      where: { role },
      relations: ['professor']
    });
  }

  async update(id: number, data: Partial<User>) {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new BadRequestException('Usuario no encontrado');

    Object.assign(user, data);
    return this.usersRepository.save(user);
  }

  async delete(id: number) {
    const result = await this.usersRepository.delete(id);
    if (result.affected === 0) throw new BadRequestException('Usuario no encontrado');
    return { message: 'Usuario eliminado correctamente' };
  }
}
