import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Departamento } from '../../entities/departamento.entity';

@Injectable()
export class DepartamentosService {
  constructor(
    @InjectRepository(Departamento)
    private departamentosRepository: Repository<Departamento>,
  ) {}

  // Crear un nuevo departamento
  async create(data: { nombre: string; descripcion?: string }): Promise<Departamento> {
    // Verificar si ya existe un departamento con el mismo nombre
    const existente = await this.departamentosRepository.findOne({
      where: { nombre: data.nombre }
    });

    if (existente) {
      throw new BadRequestException('Ya existe un departamento con ese nombre');
    }

    const departamento = this.departamentosRepository.create({
      nombre: data.nombre,
      descripcion: data.descripcion || null,
    });

    return this.departamentosRepository.save(departamento);
  }

  // Obtener todos los departamentos
  async findAll(): Promise<Departamento[]> {
    return this.departamentosRepository.find({
      order: { nombre: 'ASC' }
    });
  }

  // Obtener un departamento por ID
  async findOne(id: number): Promise<Departamento> {
    const departamento = await this.departamentosRepository.findOne({
      where: { id }
    });

    if (!departamento) {
      throw new NotFoundException('Departamento no encontrado');
    }

    return departamento;
  }

  // Actualizar un departamento
  async update(id: number, data: { nombre?: string; descripcion?: string }): Promise<Departamento> {
    const departamento = await this.findOne(id);

    // Si se está cambiando el nombre, verificar que no exista otro con el mismo nombre
    if (data.nombre && data.nombre !== departamento.nombre) {
      const existente = await this.departamentosRepository.findOne({
        where: { nombre: data.nombre }
      });

      if (existente) {
        throw new BadRequestException('Ya existe un departamento con ese nombre');
      }
    }

    Object.assign(departamento, data);
    departamento.updatedAt = new Date();

    return this.departamentosRepository.save(departamento);
  }

  // Eliminar un departamento
  async remove(id: number): Promise<{ message: string }> {
    const departamento = await this.findOne(id);
    await this.departamentosRepository.remove(departamento);
    return { message: 'Departamento eliminado exitosamente' };
  }
}

