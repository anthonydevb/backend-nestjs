import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Horario } from '../../entities/horario.entity';

@Injectable()
export class HorariosService {
  constructor(
    @InjectRepository(Horario)
    private horariosRepository: Repository<Horario>,
  ) {}

  // Crear un nuevo horario
  async create(data: { 
    hora_entrada: string; 
    hora_salida: string;
    tolerancia_entrada?: number;
  }): Promise<Horario> {
    // Validar formato de hora (HH:mm)
    if (!this.isValidTimeFormat(data.hora_entrada) || !this.isValidTimeFormat(data.hora_salida)) {
      throw new BadRequestException('El formato de hora debe ser HH:mm (ej: 08:00)');
    }

    // Validar que la hora de entrada sea menor que la hora de salida
    if (!this.isValidTimeRange(data.hora_entrada, data.hora_salida)) {
      throw new BadRequestException('La hora de entrada debe ser menor que la hora de salida');
    }

    // Validar tolerancia de entrada
    const toleranciaEntrada = data.tolerancia_entrada ?? 30;

    if (toleranciaEntrada < 0 || toleranciaEntrada > 120) {
      throw new BadRequestException('La tolerancia de entrada debe estar entre 0 y 120 minutos');
    }

    // Verificar si ya existe un horario con las mismas horas
    const existente = await this.horariosRepository.findOne({
      where: { 
        hora_entrada: data.hora_entrada,
        hora_salida: data.hora_salida
      }
    });

    if (existente) {
      throw new BadRequestException('Ya existe un horario con estas horas');
    }

    const horario = this.horariosRepository.create({
      hora_entrada: data.hora_entrada,
      hora_salida: data.hora_salida,
      tolerancia_entrada: toleranciaEntrada,
    });

    return this.horariosRepository.save(horario);
  }

  // Obtener todos los horarios
  async findAll(): Promise<Horario[]> {
    return this.horariosRepository.find({
      order: { hora_entrada: 'ASC' }
    });
  }

  // Obtener un horario por ID
  async findOne(id: number): Promise<Horario> {
    const horario = await this.horariosRepository.findOne({
      where: { id }
    });

    if (!horario) {
      throw new NotFoundException('Horario no encontrado');
    }

    return horario;
  }

  // Actualizar un horario
  async update(id: number, data: { 
    hora_entrada?: string; 
    hora_salida?: string;
    tolerancia_entrada?: number;
  }): Promise<Horario> {
    const horario = await this.findOne(id);

    // Validar formato de hora si se proporciona
    if (data.hora_entrada && !this.isValidTimeFormat(data.hora_entrada)) {
      throw new BadRequestException('El formato de hora de entrada debe ser HH:mm (ej: 08:00)');
    }

    if (data.hora_salida && !this.isValidTimeFormat(data.hora_salida)) {
      throw new BadRequestException('El formato de hora de salida debe ser HH:mm (ej: 17:00)');
    }

    // Validar rango de tiempo
    const horaEntrada = data.hora_entrada || horario.hora_entrada;
    const horaSalida = data.hora_salida || horario.hora_salida;

    if (!this.isValidTimeRange(horaEntrada, horaSalida)) {
      throw new BadRequestException('La hora de entrada debe ser menor que la hora de salida');
    }

    // Validar tolerancia de entrada si se proporciona
    if (data.tolerancia_entrada !== undefined) {
      if (data.tolerancia_entrada < 0 || data.tolerancia_entrada > 120) {
        throw new BadRequestException('La tolerancia de entrada debe estar entre 0 y 120 minutos');
      }
    }

    // Verificar duplicados si se cambian las horas
    if (data.hora_entrada || data.hora_salida) {
      const existente = await this.horariosRepository.findOne({
        where: { 
          hora_entrada: horaEntrada,
          hora_salida: horaSalida
        }
      });

      if (existente && existente.id !== id) {
        throw new BadRequestException('Ya existe un horario con estas horas');
      }
    }

    Object.assign(horario, data);
    horario.updatedAt = new Date();

    return this.horariosRepository.save(horario);
  }

  // Eliminar un horario
  async remove(id: number): Promise<{ message: string }> {
    const horario = await this.findOne(id);
    await this.horariosRepository.remove(horario);
    return { message: 'Horario eliminado exitosamente' };
  }

  // Validar formato de hora (HH:mm)
  private isValidTimeFormat(time: string): boolean {
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(time);
  }

  // Validar que la hora de entrada sea menor que la de salida
  private isValidTimeRange(horaEntrada: string, horaSalida: string): boolean {
    const [entradaH, entradaM] = horaEntrada.split(':').map(Number);
    const [salidaH, salidaM] = horaSalida.split(':').map(Number);
    
    const entradaMinutos = entradaH * 60 + entradaM;
    const salidaMinutos = salidaH * 60 + salidaM;
    
    return entradaMinutos < salidaMinutos;
  }
}

