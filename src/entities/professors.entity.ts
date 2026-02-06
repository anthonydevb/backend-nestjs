import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { User } from '../entities/user.entity';

@Entity('professors')
export class Professor {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  apellidos: string; // Apellidos del profesor

  @Column({ nullable: true })
  dni: string; // Documento de identidad

  @Column({ nullable: true })
  phone: string; // Teléfono de contacto

  @Column({ nullable: true })
  address: string; // Dirección

  @Column({ type: 'int', nullable: true, default: null })
  departamentoId: number | null; // ID del departamento

  @Column({ type: 'int', nullable: true, default: null })
  horarioId: number | null; // ID del horario

  @OneToMany(() => User, (user) => user.professor)
  users: User[];
  
  email: any;
  role: any;
  attendances: any;
}
