import { Injectable, Inject, forwardRef, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Professor } from '../../entities/professors.entity';
import { UsersService } from '../users/users.service';
import { UserRole } from '../../entities/user.entity';
import { EventsGateway } from '../../gateways/events.gateway';

@Injectable()
export class ProfessorsService {
  private readonly DECOLECTA_API_KEY = 'sk_11609.ZExfyd72GCtuDYHB5q2WI7GdW4a90aAE';
  private readonly DECOLECTA_API_URL = 'https://api.decolecta.com/v1/reniec/dni';

  constructor(
    @InjectRepository(Professor)
    private professorsRepository: Repository<Professor>,

    @Inject(forwardRef(() => UsersService))
    private usersService: UsersService,

    private httpService: HttpService,

    private eventsGateway: EventsGateway,
  ) {}

  // Crear profesor
  async create(data: {
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
    // 1️⃣ Crear usuario con rol PROFESOR
    const user = await this.usersService.create({
      name: data.name,
      email: data.email,
      password: data.password,
      role: UserRole.PROFESSOR,
    });

    // 2️⃣ Crear registro del profesor
    const professor = this.professorsRepository.create({
      name: data.name,
      apellidos: data.apellidos,
      dni: data.dni,
      phone: data.phone,
      address: data.address,
      departamentoId: data.departamentoId || null,
      horarioId: data.horarioId || null,
      users: [user],
    });

    const savedProfessor = await this.professorsRepository.save(professor);
    
    // 3️⃣ Emitir evento en tiempo real
    this.eventsGateway.emitProfessorCreated(savedProfessor);
    this.eventsGateway.emitProfessorsListUpdate();

    return savedProfessor;
  }

  // Obtener todos los profesores
  async findAll(): Promise<Professor[]> {
    return this.professorsRepository.find({ relations: ['users'] });
  }

  // Obtener profesor por ID
  async findById(id: number): Promise<Professor & { email?: string; password?: string }> {
    const professor = await this.professorsRepository.findOne({
      where: { id },
      relations: ['users']
    });
    if (!professor) throw new NotFoundException('Profesor no encontrado');
    
    // Agregar email y password del usuario relacionado
    if (professor.users && professor.users.length > 0) {
      const user = professor.users[0];
      return {
        ...professor,
        email: user.email,
        password: user.password
      };
    }
    
    return professor;
  }

  // Actualizar profesor
  async update(id: number, body: Partial<Professor & { email?: string; password?: string }>): Promise<Professor> {
    const professor = await this.findById(id);

    // Actualizar datos del usuario si vienen
    if (body.email || (body.password && body.password.trim())) {
      const user = professor.users[0]; // asumimos que solo hay un usuario
      const userUpdateData: { email?: string; password?: string } = {};
      
      if (body.email) {
        userUpdateData.email = body.email;
      }
      
      // Solo actualizar contraseña si se proporciona y no está vacía
      if (body.password && body.password.trim()) {
        userUpdateData.password = body.password;
      }
      
      await this.usersService.update(user.id, userUpdateData);
    }

    // Actualizar datos del profesor
    Object.assign(professor, {
      name: body.name ?? professor.name,
      apellidos: body.apellidos !== undefined ? body.apellidos : professor.apellidos,
      dni: body.dni ?? professor.dni,
      phone: body.phone ?? professor.phone,
      address: body.address ?? professor.address,
      departamentoId: body.departamentoId !== undefined ? body.departamentoId : professor.departamentoId,
      horarioId: body.horarioId !== undefined ? body.horarioId : professor.horarioId,
    });

    const updatedProfessor = await this.professorsRepository.save(professor);
    
    // Emitir evento en tiempo real
    this.eventsGateway.emitProfessorUpdate(updatedProfessor);
    this.eventsGateway.emitProfessorsListUpdate();

    return updatedProfessor;
  }

  // Eliminar profesor
  async delete(id: number): Promise<{ message: string }> {
    const professor = await this.findById(id);

    // Eliminar usuario relacionado
    if (professor.users && professor.users.length > 0) {
      await this.usersService.delete(professor.users[0].id);
    }

    // Eliminar profesor
    await this.professorsRepository.delete(id);

    // Emitir evento en tiempo real
    this.eventsGateway.emitProfessorDeleted(id);
    this.eventsGateway.emitProfessorsListUpdate();

    return { message: `Profesor ${professor.name} eliminado correctamente` };
  }

  // Consultar datos por DNI usando API Decolecta
  async consultarPorDni(dni: string): Promise<{ name: string; apellidos?: string }> {
    try {
      const url = `${this.DECOLECTA_API_URL}?numero=${dni}`;
      console.log('Consultando API Decolecta:', url);
      
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: {
            'Authorization': `Bearer ${this.DECOLECTA_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }),
      );

      console.log('Respuesta completa de la API:', JSON.stringify(response.data, null, 2));
      const data = response.data;
      
      // Extraer nombre y apellidos de la respuesta de la API Decolecta
      let nombreCompleto = '';
      let apellidos = '';

      // Formato de Decolecta: full_name, first_name, first_last_name, second_last_name
      // La API devuelve: first_name = "ANTHONY ALEJANDRO", first_last_name = "SANCHEZ", second_last_name = "GUEVARA"
      if (data.first_name && data.first_last_name) {
        // Usar first_name como nombre
        nombreCompleto = data.first_name.trim();
        
        // Construir apellidos desde first_last_name y second_last_name
        if (data.first_last_name && data.second_last_name) {
          apellidos = `${data.first_last_name} ${data.second_last_name}`.trim();
          // El nombre completo sería: apellidos + nombre
          nombreCompleto = `${apellidos} ${nombreCompleto}`.trim();
        } else if (data.first_last_name) {
          apellidos = data.first_last_name.trim();
          nombreCompleto = `${apellidos} ${nombreCompleto}`.trim();
        }
      } else if (data.full_name) {
        // Si no hay first_name, usar full_name y extraer apellidos
        nombreCompleto = data.full_name.trim();
        
        // Extraer apellidos si están disponibles
        if (data.first_last_name && data.second_last_name) {
          apellidos = `${data.first_last_name} ${data.second_last_name}`.trim();
        } else if (data.first_last_name) {
          apellidos = data.first_last_name.trim();
        }
      }
      // Si no hay full_name, construir desde los campos individuales
      else if (data.first_name) {
        const nombres = data.first_name.trim();
        const apellidoPaterno = data.first_last_name?.trim() || '';
        const apellidoMaterno = data.second_last_name?.trim() || '';
        
        if (apellidoPaterno && apellidoMaterno) {
          apellidos = `${apellidoPaterno} ${apellidoMaterno}`;
          nombreCompleto = `${apellidoPaterno} ${apellidoMaterno} ${nombres}`.trim();
        } else if (apellidoPaterno) {
          apellidos = apellidoPaterno;
          nombreCompleto = `${apellidoPaterno} ${nombres}`.trim();
        } else {
          nombreCompleto = nombres;
        }
      }
      // Formato alternativo: nombreCompleto (por si cambia la API)
      else if (data.nombreCompleto) {
        nombreCompleto = data.nombreCompleto.trim();
      }
      // Formato alternativo: nombres + apellidos separados (formato antiguo)
      else if (data.nombres) {
        const nombres = data.nombres.trim();
        const apellidoPaterno = data.apellidoPaterno?.trim() || '';
        const apellidoMaterno = data.apellidoMaterno?.trim() || '';
        
        if (apellidoPaterno && apellidoMaterno) {
          apellidos = `${apellidoPaterno} ${apellidoMaterno}`;
          nombreCompleto = `${nombres} ${apellidos}`.trim();
        } else if (apellidoPaterno) {
          apellidos = apellidoPaterno;
          nombreCompleto = `${nombres} ${apellidos}`.trim();
        } else {
          nombreCompleto = nombres;
        }
      }

      if (!nombreCompleto) {
        // Log para debugging
        console.error('Estructura de respuesta de API no reconocida:', JSON.stringify(data, null, 2));
        throw new Error('No se encontraron datos del DNI en la respuesta de la API');
      }

      console.log('Nombre completo extraído:', nombreCompleto);
      console.log('Apellidos extraídos:', apellidos);

      // Devolver nombre y apellidos separados
      // Si tenemos first_name, usarlo como nombre, si no usar el nombre completo
      let nombreFinal = nombreCompleto;
      if (data.first_name && apellidos) {
        // Si tenemos nombre y apellidos separados, devolverlos así
        nombreFinal = data.first_name.trim();
      }

      return {
        name: nombreFinal,
        apellidos: apellidos || undefined,
      };
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new NotFoundException('DNI no encontrado en RENIEC');
      }
      if (error.response?.status === 401) {
        throw new Error('Error de autenticación con la API de Decolecta');
      }
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Error al consultar DNI: ${error.message || 'Error desconocido'}`);
    }
  }
}
