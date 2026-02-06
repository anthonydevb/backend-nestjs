import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Professor } from './professors.entity';
import { User } from './user.entity';

export enum EstadoJustificacion {
  PENDIENTE = 'pendiente',
  APROBADA = 'aprobada',
  RECHAZADA = 'rechazada',
}

export enum TipoJustificacion {
  ENFERMEDAD = 'enfermedad',
  EMERGENCIA = 'emergencia',
  PERMISO = 'permiso',
  FESTIVO = 'festivo',
  OTRO = 'otro',
}

@Entity('justificaciones')
export class Justificacion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  profesorId: number;

  @ManyToOne(() => Professor)
  @JoinColumn({ name: 'profesorId' })
  profesor: Professor;

  @Column({ type: 'date' })
  fecha: Date;

  @Column({
    type: 'enum',
    enum: TipoJustificacion,
    default: TipoJustificacion.OTRO,
  })
  tipo: TipoJustificacion;

  @Column({ type: 'text' })
  descripcion: string;

  @Column({
    type: 'enum',
    enum: EstadoJustificacion,
    default: EstadoJustificacion.PENDIENTE,
  })
  estado: EstadoJustificacion;

  @Column({ type: 'text', nullable: true })
  motivoRechazo: string | null;

  @Column({ nullable: true })
  adminId: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'adminId' })
  admin: User | null;

  @CreateDateColumn()
  fechaCreacion: Date;

  @UpdateDateColumn()
  fechaActualizacion: Date;

  @Column({ type: 'datetime', nullable: true })
  fechaAprobacion: Date | null;
}

